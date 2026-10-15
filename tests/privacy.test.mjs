import { logOptions, scope } from './access-fixture.mjs';
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import path from 'node:path';
import { tmpdir } from 'node:os';
import os from 'node:os';
import { discoverSessions, LogSource } from '../src/adapters/codex-log.mjs';
import { SessionAccess, canonicalUuid, sessionRef } from '../src/core/session-access.mjs';
import { AppServerSource } from '../src/adapters/app-server.mjs';
import { createApplication } from '../src/server.mjs';
import { DesktopHost } from '../desktop/host.mjs';
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
  const samePath = value => path.resolve(String(value)).toLowerCase() === path.resolve(fixture.file).toLowerCase();
  const calls = [], history = [], descriptors = new Set(); let phase = 'initial';
  const record = value => { const entry = { phase, ...value }; calls.push(entry); history.push(entry); };
  calls.beginPhase = name => { phase = name; calls.length = 0; };
  ioAudit.push({ name: t.name, headerBytes: fixture.headerBytes, calls: history });
  const open = fs.open, readFile = fs.readFile, readSync = fsSync.readSync;
  t.mock.method(fs, 'open', async (...args) => {
    const handle = await open(...args);
    if (!samePath(args[0])) return handle;
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
    if (samePath(args[0])) record({ method: 'readFile', body: true });
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

async function crowdedFixture(t){
 const f=await fixture(t,`rollout-${codexId}.jsonl`),older=path.join(f.root,'sessions/2026/10/09'),recent=path.join(f.root,'sessions/2026/10/13');await fs.mkdir(older,{recursive:true});await fs.mkdir(recent,{recursive:true});const relocated=path.join(older,path.basename(f.file));await fs.rename(f.file,relocated);f.file=relocated;
 await Promise.all(Array.from({length:310},(_,i)=>fs.writeFile(path.join(recent,`rollout-00000000-0000-4000-8000-${String(i).padStart(12,'0')}.jsonl`),'SYNTHETIC_UNKNOWN_BODY_MUST_NOT_OPEN')));return f;
}
test('old explicitly selected UUID survives the 300-candidate discovery budget using metadata only',async t=>{
 const f=await crowdedFixture(t),calls=traceIO(t,f);assert.equal((await discoverSessions(f.root)).some(s=>s.id===codexId),false,'Fixture must exceed ordinary discovery');
 const selected=await discoverSessions(f.root,60,new Set(),codexId.toUpperCase());assert.ok(selected.some(s=>s.id===codexId),'Explicit older selection must remain available');assert.ok(selected.length<=61);assert.equal(calls.length,0,'Priority discovery cannot open even the selected body');
 assert.equal((await discoverSessions(f.root,60,new Set([codexId]),codexId)).some(s=>s.id===codexId),false,'Known Work must remain excluded');assert.equal(calls.length,0);
});
test('priority metadata denies duplicate UUID aliases across active and archived stores without a body read',async t=>{
 const f=await crowdedFixture(t);await fs.mkdir(path.join(f.root,'archived_sessions'));await fs.writeFile(path.join(f.root,'archived_sessions',`rollout-${codexId.toUpperCase()}.jsonl`),'SYNTHETIC_CONFLICTING_BODY');const calls=traceIO(t,f);
 assert.equal((await discoverSessions(f.root,60,new Set(),codexId)).some(s=>s.id===codexId),false);assert.equal(calls.length,0);
});
test('incomplete priority scan cannot retain an earlier candidate or read a body',async t=>{
 const f=await fixture(t,`rollout-${codexId}.jsonl`);await fs.mkdir(path.join(f.root,'sessions/overbudget'));const original=fs.readdir;
 t.mock.method(fs,'readdir',async(dir,...args)=>String(dir).endsWith('overbudget')?Array.from({length:10001},(_,i)=>({name:`00000000-0000-4000-8000-${String(i).padStart(12,'0')}.jsonl`,isDirectory:()=>false,isFile:()=>true,isSymbolicLink:()=>false})):original(dir,...args));syncBuiltinESMExports();t.after(()=>{t.mock.restoreAll();syncBuiltinESMExports();});const calls=traceIO(t,f);
 assert.ok((await discoverSessions(f.root)).some(s=>s.id===codexId),'Ordinary candidate exists before the bounded priority scan');assert.equal((await discoverSessions(f.root,60,new Set(),codexId)).some(s=>s.id===codexId),false);assert.equal(calls.length,0);
});
test('desktop old-session selection stays denied until granted, monitors appends, and revoke stops body I/O',async t=>{
 const f=await crowdedFixture(t),calls=traceIO(t,f),host=new DesktopHost({dataDir:path.join(f.root,'data'),codexHome:f.root,workHooksDir:path.join(f.root,'events'),interval:0,initialSelection:{id:codexId}});await host.start();t.after(()=>host.close());
 assert.equal(calls.length,0);assert.ok(host.service.sessions.some(s=>s.id===codexId));assert.equal((await host.request('monitor')).task.title,'');
 const s=()=>({authorityInstanceId:host.service.access.instanceId,expectedPolicyRevision:host.service.access.revision,selectionRevision:host.service.selectionRevision});await host.request('sessionAccess',{sessionId:codexId,decision:'allow-codex',...s()});assert.ok(calls.some(c=>c.body),'Authorized read is the positive control');
 await fs.appendFile(f.file,row('event_msg',{type:'agent_message',phase:'final_answer',message:'SYNTHETIC_OLD_SESSION_LIVE_APPEND'}));await host.service.tick();const allowed=await host.request('monitor');assert.equal(allowed.conversation.messages.at(-1).text,'SYNTHETIC_OLD_SESSION_LIVE_APPEND');
 await host.request('sessionAccess',{sessionId:codexId,decision:'revoke',...s()});calls.beginPhase('revoked');await host.service.tick();assert.deepEqual((await host.request('monitor')).conversation.messages,[]);assert.equal(calls.length,0,'Revoked old session must not open any part of its body');let returned=0;assert.throws(()=>host.sendResponse(allowed,()=>returned++));assert.equal(returned,0);
});

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
    const options = canonicalUuid(id) ? await logOptions(f.file, id, false) : {};
    if (label === 'known Work') await options.access.change(options.ref, { origin: 'work-local' }, options.access.revision);
    if (label === 'Codex without content grant') await options.access.change(options.ref, { origin: 'codex' }, options.access.revision);
    const source = new LogSource(f.file, id, undefined, options);
    await source.poll();
    assert.equal(calls.filter(c => c.body).length, 0, 'Denied body reader must not be called');
    assert.equal(calls.filter(c => c.method === 'open').length, 0);
    assert.equal(source.state.title, '');
  });
}

test('P-01 filename/header mismatch never calls body I/O even with explicit Codex grant', async t => {
  const f = await fixture(t, `rollout-${codexId}.jsonl`, workId), calls = traceIO(t, f);
  const source = new LogSource(f.file, codexId, 8 * 1024 * 1024, await logOptions(f.file, codexId));
  await source.poll();
  assert.equal(calls.filter(c => c.body).length, 0, 'Only the bounded header may be read');
  assert.equal(source.state.title, '');
});

test('P-01 invalid internal UUID never reaches the body reader', async t => {
  const f = await fixture(t, `rollout-${codexId}.jsonl`, 'invalid-internal-id'), calls = traceIO(t, f);
  const source = new LogSource(f.file, codexId, undefined, await logOptions(f.file, codexId));
  await source.poll(); assert.equal(calls.filter(c => c.body).length, 0); assert.equal(source.state.events.length, 0);
});

test('P-01 labels never imply permission; UUID aliases and conflicting grants fail closed', () => {
  const legacy = new SessionAccess(undefined, { [codexId.toUpperCase()]: 'codex', [workId]: 'work-local', MixedHookID: 'codex' });
  assert.equal(legacy.origin(sessionRef('local:fixture', codexId)), 'codex'); assert.equal(legacy.can(sessionRef('local:fixture', codexId), 'content'), false);
  assert.equal(legacy.origin(sessionRef('hooks:fixture', 'mixedhookid')), 'unknown'); assert.equal(canonicalUuid('not-a-uuid'), null);
  for (const entries of [
    [[codexId, { origin: 'codex', bodyRead: true }], [codexId.toUpperCase(), { origin: 'work-local', bodyRead: true }]],
    [[codexId.toUpperCase(), { origin: 'work-local', bodyRead: true }], [codexId, { origin: 'codex', bodyRead: true }]]
  ]) {
    const access = new SessionAccess({ version: 1, sessions: Object.fromEntries(entries) });
    assert.equal(access.can(sessionRef('local:fixture', codexId), 'content'), false); assert.equal(access.origin(sessionRef('local:fixture', codexId)), 'work-local');
  }
  assert.throws(() => sessionRef('local:fixture', 'not-a-uuid'));
});

for (const filenameId of [codexId, codexId.toUpperCase(), 'AbCdEf12-AbCd-4aBc-8aBc-AbCdEf123456']) {
  test(`P-01 explicitly granted Codex control reads only after matching header: ${filenameId}`, async t => {
    const f = await fixture(t, `rollout-${filenameId}.jsonl`, codexId.toUpperCase()), calls = traceIO(t, f);
    const options = await logOptions(f.file, codexId);
    const source = new LogSource(f.file, filenameId, 8 * 1024 * 1024, options);
    await source.poll(); assert.equal(source.state.title, 'SYNTHETIC_PRIVATE_BODY');
    assert.equal(calls.filter(c => c.body).length, 1);
    assert.ok(calls.filter(c => c.body).every(c => c.position >= f.headerBytes));
    calls.beginPhase('after-revocation'); await options.access.change(options.ref, { content: false }, options.access.revision); await source.poll();
    assert.equal(calls.length, 0, 'Revocation must prevent even opening the log');
    assert.equal(source.state.events.length, 0); assert.equal(source.state.cwd, '');
  });
}

test('P-01 replacing an authorized log with a Work header clears state before body I/O', async t => {
  const f = await fixture(t, `rollout-${codexId}.jsonl`), calls = traceIO(t, f);
  const source = new LogSource(f.file, codexId, 8 * 1024 * 1024, await logOptions(f.file, codexId));
  await source.poll(); assert.equal(source.state.title, 'SYNTHETIC_PRIVATE_BODY');
  const header = row('session_meta', { id: workId, cwd: f.root }); f.headerBytes = Buffer.byteLength(header);
  await fs.writeFile(f.file, header + row('event_msg', { type: 'user_message', message: 'REPLACEMENT_PRIVATE_BODY' }));
  calls.beginPhase('after-replacement'); await source.poll();
  assert.equal(calls.filter(c => c.body).length, 0); assert.equal(source.state.title, ''); assert.equal(source.state.cwd, '');
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
  const post = async (decision, token) => fetch(app.url + '/api/session-access', { method: 'POST', headers: { 'content-type': 'application/json', 'x-aps-token': token }, body: JSON.stringify({ sessionId: codexId.toUpperCase(), decision, ...scope(app) }) });
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
