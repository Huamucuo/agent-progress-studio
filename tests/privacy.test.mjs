import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import path from 'node:path';
import { tmpdir } from 'node:os';
import os from 'node:os';
import { discoverSessions, LogSource } from '../src/adapters/codex-log.mjs';
import { SessionAccess, canonicalUuid } from '../src/core/session-access.mjs';
import { AppServerSource } from '../src/adapters/app-server.mjs';
import { createApplication } from '../src/server.mjs';
import { collectEvidence, readEvidence, sourceFingerprint } from '../src/collectors/evidence.mjs';

const codexId = 'abcdef12-abcd-4abc-8abc-abcdef123456';
const workId = 'feedbeef-abcd-4abc-8abc-abcdef123456';
const ioAudit = [];
after(async () => { if (process.env.APS_PRIVACY_TRACE) await fs.writeFile(process.env.APS_PRIVACY_TRACE, JSON.stringify({ syntheticOnly: true, cases: ioAudit }, null, 2)); });
const row = (type, payload) => JSON.stringify({ timestamp: '2026-10-09T00:00:00Z', type, payload }) + '\n';
async function fixture(t, filename, headerId = codexId) {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'aps-privacy-'));
  await fs.mkdir(path.join(root, 'sessions'));
  const file = path.join(root, 'sessions', filename), header = row('session_meta', { id: headerId, cwd: root });
  await fs.writeFile(file, header + row('event_msg', { type: 'user_message', message: 'SYNTHETIC_PRIVATE_BODY' }));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return { root, file, headerBytes: Buffer.byteLength(header) };
}

// Instrument the real Node I/O boundary, not just normalized/displayed results.
// A body call is any requested range crossing the first newline, even if discarded.
function traceIO(t, fixture) {
  const calls = [], history = [], descriptors = new Set(); let phase = 'initial';
  const record = value => { const entry = { phase, ...value }; calls.push(entry); history.push(entry); };
  calls.beginPhase = name => { phase = name; calls.length = 0; };
  ioAudit.push({ name: t.name, headerBytes: fixture.headerBytes, calls: history });
  const open = fs.open, readFile = fs.readFile, readSync = fsSync.readSync;
  t.mock.method(fs, 'open', async (...args) => {
    const handle = await open(...args);
    if (path.resolve(String(args[0])) !== fixture.file) return handle;
    record({ method: 'open' }); descriptors.add(handle.fd);
    const read = handle.read.bind(handle);
    t.mock.method(handle, 'read', async (...params) => {
      const position = params[3] ?? 0, length = params[2] ?? params[0].length;
      record({ method: 'read', position, length, body: position + length > fixture.headerBytes });
      return read(...params);
    });
    return handle;
  });
  t.mock.method(fs, 'readFile', async (...args) => {
    if (path.resolve(String(args[0])) === fixture.file) record({ method: 'readFile', body: true });
    return readFile(...args);
  });
  t.mock.method(fsSync, 'readSync', (...args) => {
    if (descriptors.has(args[0])) record({ method: 'readSync', position: args[4], length: args[3], body: args[4] + args[3] > fixture.headerBytes });
    return readSync(...args);
  });
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  return calls;
}

for (const [label, filename] of [
  ['lowercase', `rollout-${codexId}.jsonl`],
  ['uppercase', `rollout-${codexId.toUpperCase()}.jsonl`],
  ['mixed case', `rollout-AbCdEf12-AbCd-4aBc-8aBc-AbCdEf123456.jsonl`],
  ['invalid UUID', 'rollout-not-a-uuid.jsonl'],
  ['custom filename', 'custom.jsonl']
]) test(`P-01 discovery never opens session content: ${label}`, async t => {
  const f = await fixture(t, filename), calls = traceIO(t, f);
  await discoverSessions(f.root, 60, new Set([codexId]));
  assert.equal(calls.filter(c => c.body).length, 0, 'Body I/O must never be called');
  assert.equal(calls.filter(c => c.method === 'open').length, 0, 'Discovery must use names/stat only');
});

for (const label of ['unknown', 'known Work', 'Codex without content grant', 'invalid UUID']) {
  test(`P-01 direct LogSource defaults to deny: ${label}`, async t => {
    const id = label === 'invalid UUID' ? 'not-a-uuid' : codexId;
    const f = await fixture(t, `rollout-${id}.jsonl`, id), calls = traceIO(t, f);
    const access = new SessionAccess();
    if (label === 'known Work') access.set(id, 'work-local');
    if (label === 'Codex without content grant') access.set(id, 'codex');
    const source = new LogSource(f.file, id, undefined, { canRead: id => access.canRead(id) });
    await source.poll();
    assert.equal(calls.filter(c => c.body).length, 0, 'Denied body reader must not be called');
    assert.equal(calls.filter(c => c.method === 'open').length, 0);
    assert.equal(source.state.title, '');
  });
}

test('P-01 filename/header mismatch never calls body I/O even with explicit Codex grant', async t => {
  const f = await fixture(t, `rollout-${codexId}.jsonl`, workId), calls = traceIO(t, f);
  const source = new LogSource(f.file, codexId, 8 * 1024 * 1024, { canRead: id => id === codexId });
  await source.poll();
  assert.equal(calls.filter(c => c.body).length, 0, 'Only the bounded header may be read');
  assert.equal(source.state.title, '');
});

test('P-01 invalid internal UUID never reaches the body reader', async t => {
  const f = await fixture(t, `rollout-${codexId}.jsonl`, 'invalid-internal-id'), calls = traceIO(t, f);
  const source = new LogSource(f.file, codexId, undefined, { canRead: () => true });
  await source.poll(); assert.equal(calls.filter(c => c.body).length, 0); assert.equal(source.state.events.length, 0);
});

test('P-01 labels never imply permission; UUID aliases and conflicting grants fail closed', () => {
  const legacy = new SessionAccess(undefined, { [codexId.toUpperCase()]: 'codex', [workId]: 'work-local', MixedHookID: 'codex' });
  assert.equal(legacy.origin(codexId), 'codex'); assert.equal(legacy.canRead(codexId), false);
  assert.equal(legacy.origin('mixedhookid'), 'unknown'); assert.equal(canonicalUuid('not-a-uuid'), null);
  for (const entries of [
    [[codexId, { origin: 'codex', bodyRead: true }], [codexId.toUpperCase(), { origin: 'work-local', bodyRead: true }]],
    [[codexId.toUpperCase(), { origin: 'work-local', bodyRead: true }], [codexId, { origin: 'codex', bodyRead: true }]]
  ]) {
    const access = new SessionAccess({ version: 1, sessions: Object.fromEntries(entries) });
    assert.equal(access.canRead(codexId), false); assert.equal(access.origin(codexId), 'work-local');
  }
  assert.throws(() => legacy.set('not-a-uuid', 'codex', true));
});

for (const filenameId of [codexId, codexId.toUpperCase(), 'AbCdEf12-AbCd-4aBc-8aBc-AbCdEf123456']) {
  test(`P-01 explicitly granted Codex control reads only after matching header: ${filenameId}`, async t => {
    const f = await fixture(t, `rollout-${filenameId}.jsonl`, codexId.toUpperCase()), calls = traceIO(t, f);
    const access = new SessionAccess(); access.set(codexId, 'codex', true);
    const source = new LogSource(f.file, filenameId, 8 * 1024 * 1024, { canRead: id => access.canRead(id) });
    await source.poll(); assert.equal(source.state.title, 'SYNTHETIC_PRIVATE_BODY');
    assert.equal(calls.filter(c => c.body).length, 1);
    assert.ok(calls.filter(c => c.body).every(c => c.position >= f.headerBytes));
    calls.beginPhase('after-revocation'); access.set(codexId, 'work-local'); await source.poll();
    assert.equal(calls.length, 0, 'Revocation must prevent even opening the log');
    assert.equal(source.state.events.length, 0); assert.equal(source.state.cwd, '');
  });
}

test('P-01 replacing an authorized log with a Work header clears state before body I/O', async t => {
  const f = await fixture(t, `rollout-${codexId}.jsonl`), calls = traceIO(t, f);
  const source = new LogSource(f.file, codexId, 8 * 1024 * 1024, { canRead: id => id === codexId });
  await source.poll(); assert.equal(source.state.title, 'SYNTHETIC_PRIVATE_BODY');
  const header = row('session_meta', { id: workId, cwd: f.root }); f.headerBytes = Buffer.byteLength(header);
  await fs.writeFile(f.file, header + row('event_msg', { type: 'user_message', message: 'REPLACEMENT_PRIVATE_BODY' }));
  calls.beginPhase('after-replacement'); await source.poll();
  assert.equal(calls.filter(c => c.body).length, 0); assert.equal(source.state.title, ''); assert.equal(source.state.cwd, '');
});

test('P-01 app-server denies unscoped list and history before sending a request', async () => {
  const source = new AppServerSource('ws://127.0.0.1:4500'), sent = [];
  source.socket = { send: raw => { sent.push(JSON.parse(raw)); queueMicrotask(() => source.receive({ id: sent.at(-1).id, result: {} })); } };
  await assert.rejects(() => source.request('thread/list', { limit: 50 }));
  await assert.rejects(() => source.request('thread/read', { threadId: codexId, includeTurns: true }));
  assert.equal(sent.length, 0);
});

test('P-01 app-server direct poll and notification deny unknown IDs', async () => {
  const source = new AppServerSource('ws://127.0.0.1:4500'), requests = [];
  source.threadId = codexId; source.connected = true;
  source.request = async method => { requests.push(method); return { thread: { id: codexId, turns: [] } }; };
  await source.poll(); assert.equal(requests.length, 0);
  source.receive({ method: 'turn/plan/updated', params: { threadId: codexId, plan: [{ step: 'SYNTHETIC_PRIVATE_PLAN', status: 'pending' }] } });
  assert.equal(source.state.plan.length, 0);
});

for (const origin of ['unknown', 'work-local', 'codex']) test(`P-01 service labels alone never open session logs: ${origin}`, async t => {
  const f = await fixture(t, `rollout-${codexId.toUpperCase()}.jsonl`), dataDir = path.join(f.root, 'data');
  await fs.mkdir(dataDir); await fs.writeFile(path.join(dataDir, 'hook-origins.json'), JSON.stringify({ [codexId]: origin }));
  const calls = traceIO(t, f);
  const app = await createApplication({ port: 0, mode: 'local', codexHome: f.root, dataDir, interval: 0 }); t.after(() => app.close());
  await app.service.tick();
  for (const route of ['/api/snapshot', '/api/export', '/api/stream']) {
    const controller = new AbortController(); const response = await fetch(app.url + route, { signal: controller.signal });
    const chunk = await response.body.getReader().read(); controller.abort();
    assert.doesNotMatch(new TextDecoder().decode(chunk.value), /SYNTHETIC_PRIVATE_BODY/);
  }
  assert.equal(calls.length, 0, 'Neither discovery nor snapshot/export/stream may open denied logs');
  assert.equal(app.service.snapshot.workspace, null);
  if (origin === 'work-local') await assert.rejects(() => app.service.sessionAccess({ sessionId: codexId, decision: 'allow-codex' }));
  assert.equal(calls.length, 0);
});

test('P-01 corrupt current policy never falls back to a legacy Codex label', async t => {
  const f = await fixture(t, `rollout-${codexId}.jsonl`), dataDir = path.join(f.root, 'data');
  await fs.mkdir(dataDir); await fs.writeFile(path.join(dataDir, 'session-access.json'), '{broken');
  await fs.writeFile(path.join(dataDir, 'hook-origins.json'), JSON.stringify({ [codexId]: 'codex' }));
  const calls = traceIO(t, f), app = await createApplication({ port: 0, mode: 'local', codexHome: f.root, dataDir, interval: 0 }); t.after(() => app.close());
  assert.equal(app.service.snapshot.source.origin, 'unknown'); assert.equal(calls.length, 0);
});

test('P-01 grant, realtime update, revocation, export and restart enforce the same scope', async t => {
  const f = await fixture(t, `rollout-${codexId}.jsonl`), dataDir = path.join(f.root, 'data');
  let app = await createApplication({ port: 0, mode: 'local', codexHome: f.root, dataDir, interval: 0 });
  t.after(() => app.close()); const calls = traceIO(t, f);
  const post = async (decision, token) => fetch(app.url + '/api/session-access', { method: 'POST', headers: { 'content-type': 'application/json', 'x-aps-token': token }, body: JSON.stringify({ sessionId: codexId.toUpperCase(), decision }) });
  let token = (await (await fetch(app.url + '/api/bootstrap')).json()).token;
  assert.equal((await post('allow-codex', 'invalid')).status, 403); assert.equal(calls.length, 0);
  assert.equal((await post('allow-codex', token)).status, 200);
  assert.equal(app.service.snapshot.task.title, 'SYNTHETIC_PRIVATE_BODY');
  await fs.appendFile(f.file, row('event_msg', { type: 'user_message', message: 'AUTHORIZED_LIVE_UPDATE' })); await app.service.tick();
  assert.equal(app.service.snapshot.task.title, 'AUTHORIZED_LIVE_UPDATE');
  await app.close(); app = await createApplication({ port: 0, mode: 'local', codexHome: f.root, dataDir, interval: 0 });
  assert.equal(app.service.snapshot.task.title, 'AUTHORIZED_LIVE_UPDATE');
  token = (await (await fetch(app.url + '/api/bootstrap')).json()).token; calls.beginPhase('after-revocation');
  assert.equal((await post('revoke', token)).status, 200);
  const exported = await (await fetch(app.url + '/api/export')).json();
  assert.equal(calls.length, 0); assert.equal(exported.task.title, ''); assert.equal(exported.workspace, null);
  assert.equal((await fetch(app.url + '/api/evidence?kind=file&id=anything')).status, 400);
  await app.close(); app = await createApplication({ port: 0, mode: 'local', codexHome: f.root, dataDir, interval: 0 });
  assert.equal(calls.length, 0); assert.equal(app.service.snapshot.task.title, '');
});

test('P-01 evidence helpers reject a workspace overlapping the protected session tree before file I/O', async t => {
  const f = await fixture(t, `rollout-${codexId}.jsonl`);
  await fs.mkdir(path.join(f.root, '.agent-progress'));
  await fs.writeFile(path.join(f.root, '.agent-progress/acceptance.json'), JSON.stringify({ version: 1, taskId: 'privacy', title: 'Fixture', criteria: [{ id: 'file', title: 'File', files: [`sessions/rollout-${codexId}.jsonl`] }] }));
  const calls = traceIO(t, f), options = { protectedRoots: [path.join(f.root, 'sessions')] };
  const evidence = await collectEvidence(f.root, options);
  const fp = await sourceFingerprint(f.root, options);
  assert.equal(evidence.manifest, null); assert.equal(fp.complete, false);
  await assert.rejects(() => readEvidence(f.root, 'file', `sessions/rollout-${codexId}.jsonl`, { files: [`sessions/rollout-${codexId}.jsonl`] }, options));
  assert.equal(calls.length, 0, 'Evidence must not become a second session-content reader');
});

test('P-01 custom CODEX_HOME never removes protection from the default session store', async t => {
  const f = await fixture(t, `rollout-${workId}.jsonl`, workId);
  const home = path.join(f.root, 'synthetic-home'), sessions = path.join(home, '.codex/sessions');
  await fs.mkdir(sessions, { recursive: true }); const moved = path.join(sessions, path.basename(f.file)); await fs.rename(f.file, moved); f.file = moved;
  const original = process.env.CODEX_HOME; process.env.CODEX_HOME = path.join(f.root, 'custom-codex');
  t.after(() => { if (original === undefined) delete process.env.CODEX_HOME; else process.env.CODEX_HOME = original; });
  t.mock.method(os, 'homedir', () => home);
  const calls = traceIO(t, f);
  assert.equal((await sourceFingerprint(sessions)).complete, false);
  assert.equal((await collectEvidence(sessions)).manifest, null);
  assert.equal(calls.length, 0, 'The ungranted default-store Work log must not be read');
});

test('P-01 unknown discovery and duplicate case aliases inspect no header or body', async t => {
  const f = await fixture(t, `rollout-${codexId}.jsonl`), calls = traceIO(t, f);
  assert.deepEqual((await discoverSessions(f.root)).map(s => s.id), [codexId]);
  await fs.mkdir(path.join(f.root, 'sessions/duplicate'));
  await fs.writeFile(path.join(f.root, `sessions/duplicate/rollout-${codexId.toUpperCase()}.jsonl`), 'UNREAD_DUPLICATE');
  assert.deepEqual(await discoverSessions(f.root), []); assert.equal(calls.length, 0);
});

test('P-01 service invalidates cached task and evidence after a header replacement', async t => {
  const f = await fixture(t, `rollout-${codexId}.jsonl`), dataDir = path.join(f.root, 'data');
  const app = await createApplication({ port: 0, mode: 'local', codexHome: f.root, dataDir, interval: 0 }); t.after(() => app.close());
  await app.service.sessionAccess({ sessionId: codexId, decision: 'allow-codex' });
  assert.equal(app.service.snapshot.task.title, 'SYNTHETIC_PRIVATE_BODY');
  const header = row('session_meta', { id: workId }); f.headerBytes = Buffer.byteLength(header);
  await fs.writeFile(f.file, header + row('event_msg', { type: 'user_message', message: 'DENIED_REPLACEMENT' }));
  const calls = traceIO(t, f);
  const exported = await (await fetch(app.url + '/api/export')).json();
  assert.equal(exported.task.title, ''); assert.equal(exported.workspace, null);
  await assert.rejects(() => app.service.detail('file', 'any'));
  assert.equal(calls.filter(c => c.body).length, 0);
});

test('P-01 unscoped and revoked app-server wire frames are rejected before JSON parsing', t => {
  let authorized = true, rejected = false;
  const source = new AppServerSource('ws://127.0.0.1:4500', { canRead: () => authorized }); source.threadId = codexId;
  const parser = t.mock.method(JSON, 'parse');
  source.receiveWire(JSON.stringify({ method: 'turn/plan/updated', params: { threadId: workId, plan: ['PRIVATE'] } }));
  source.receiveWire(JSON.stringify({ id: 777, result: { thread: { id: workId, preview: 'PRIVATE' } } }));
  assert.equal(parser.mock.callCount(), 0);
  source.pending.set(1, { scopeId: codexId, reject: () => { rejected = true; } });
  authorized = false; source.state.title = 'OLD_CACHED_TASK';
  source.receiveWire(JSON.stringify({ id: 1, result: { thread: { id: codexId, preview: 'PRIVATE' } } }));
  assert.equal(parser.mock.callCount(), 0); assert.equal(rejected, true); assert.equal(source.state.title, '');
});

test('P-01 app-server handshake never lists sessions and authorized history remains readable', async t => {
  const sent = [];
  class Socket extends EventTarget {
    constructor() { super(); queueMicrotask(() => this.dispatchEvent(new Event('open'))); }
    send(raw) {
      const message = JSON.parse(raw); sent.push(message.method);
      if (!message.id) return;
      const result = message.method === 'initialize' ? {} : { thread: { id: codexId, preview: 'AUTHORIZED_HISTORY', turns: [] } };
      queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ id: message.id, result }) })));
    }
    close() { this.dispatchEvent(new Event('close')); }
  }
  t.mock.method(globalThis, 'WebSocket', function () { return new Socket(); });
  const source = new AppServerSource('ws://127.0.0.1:4500', { canRead: id => id === codexId, allowedIds: () => [codexId, workId] });
  t.after(() => source.close());
  assert.deepEqual((await source.connect()).map(s => s.id), [codexId]); await source.select(codexId);
  assert.deepEqual(sent, ['initialize', 'initialized', 'thread/read']); assert.equal(source.state.title, 'AUTHORIZED_HISTORY');
});
