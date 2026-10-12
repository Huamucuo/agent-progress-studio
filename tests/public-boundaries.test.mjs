import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { execFileSync, fork } from 'node:child_process';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { WorkHookSource } from '../src/adapters/work-hooks.mjs';
import { AppServerSource } from '../src/adapters/app-server.mjs';
import { SessionAccess, sessionRef } from '../src/core/session-access.mjs';
import { ResourceRegistry, canonicalPath } from '../src/core/resource-registry.mjs';
import { evidenceOptions } from './access-fixture.mjs';
import { fakeRpc } from './rpc-fixture.mjs';
import { wireHost } from './ws-fixture.mjs';

const fold = value => process.platform === 'win32' ? String(value).toLowerCase() : String(value);
const hookName = i => '179149440000' + i + '-00000000-0000-4000-8000-' + String(i + 1).padStart(12, '0') + '.json';
const hookRecord = (turn = 'normal-turn') => JSON.stringify({ event_type: 'Stop', session_id: 'fixture-session', timestamp: '2026-10-09T00:00:00.000Z', turn_id: turn });
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'aps-public-boundary-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const project = path.join(root, 'project'), codexHome = path.join(root, 'codex'), archive = path.join(codexHome, 'archived_sessions'), spool = path.join(root, 'spool');
  await fs.mkdir(project); await fs.mkdir(archive, { recursive: true }); await fs.mkdir(spool);
  const denied = path.join(archive, '00000000-0000-4000-8000-000000000099.jsonl');
  await fs.writeFile(denied, 'SYNTHETIC_DENIED_ARCHIVE');
  return { root, project, codexHome, archive, spool, denied };
}
function traceBodies(t, afterRead = async () => {}) {
  const calls = [], readFile = fs.readFile, open = fs.open;
  t.mock.method(fs, 'readFile', async (file, ...args) => {
    const body = await readFile(file, ...args); calls.push({ file: String(file), method: 'readFile' }); await afterRead(String(file), body); return body;
  });
  t.mock.method(fs, 'open', async (file, ...args) => {
    const handle = await open(file, ...args), read = handle.read.bind(handle), readBody = handle.readFile.bind(handle);
    t.mock.method(handle, 'read', async (...parameters) => {
      const result = await read(...parameters); calls.push({ file: String(file), method: 'read' }); await afterRead(String(file), result.buffer.subarray(0, result.bytesRead)); return result;
    });
    t.mock.method(handle, 'readFile', async (...parameters) => {
      const body = await readBody(...parameters); calls.push({ file: String(file), method: 'handle.readFile' }); await afterRead(String(file), body); return body;
    });
    return handle;
  });
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  return calls;
}
async function hookSource(t, f) {
  const access = new SessionAccess(), ref = sessionRef('hooks:' + await canonicalPath(f.spool), 'spool');
  await access.change(ref, { observe: true }, access.revision);
  const registry = new ResourceRegistry({ codexHomes: [f.codexHome], hooksDir: f.spool });
  const source = new WorkHookSource(f.spool, 'fixture-session', { access, ref, registry });
  const invalidated = () => { if (!access.can(ref, 'observe')) source.close(); };
  access.on('invalidate', invalidated);
  t.after(() => { access.off('invalidate', invalidated); source.close(); });
  return { source, access, ref };
}
for (const [format, key, armor] of [
  ['openpgp', 'gpg.program', 'PGP SIGNATURE'],
  ['openpgp', 'gpg.openpgp.program', 'PGP SIGNATURE'],
  ['x509', 'gpg.x509.program', 'SIGNED MESSAGE'],
  ['ssh', 'gpg.ssh.program', 'SSH SIGNATURE']
]) {
  test('GIT boundary disables implicit ' + key + ' body reads while retaining signed commit evidence', async t => {
    const f = await fixture(t), marker = path.join(f.root, 'verifier-invocations.txt'), helper = path.join(f.root, 'verifier.mjs');
    await fs.writeFile(helper, "import fs from 'node:fs';fs.appendFileSync(" + JSON.stringify(marker) + ",JSON.stringify({readDeniedArchive:fs.readFileSync(" + JSON.stringify(f.denied) + ",'utf8').includes('SYNTHETIC_DENIED_ARCHIVE')})+'\\n');process.exit(1);");
    const wrapper = path.join(f.root, process.platform === 'win32' ? 'verifier.cmd' : 'verifier.sh');
    await fs.writeFile(wrapper, process.platform === 'win32' ? '@echo off\r\n"' + process.execPath + '" "' + helper + '"\r\n' : '#!/bin/sh\n"' + process.execPath + '" "' + helper + '"\n', { mode: 0o700 });
    const git = (args, input) => execFileSync('git', ['-c', 'safe.directory=' + f.project, '--no-optional-locks', ...args], { cwd: f.project, input, encoding: 'utf8', windowsHide: true, env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null', GIT_TERMINAL_PROMPT: '0' } }).trim();
    git(['init', '--quiet']); await fs.writeFile(path.join(f.project, 'source.txt'), 'LEGITIMATE_SOURCE');
    git(['add', 'source.txt']); git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgSign=false', 'commit', '--quiet', '-m', 'unsigned-fixture']);
    const tree = git(['rev-parse', 'HEAD^{tree}']), parent = git(['rev-parse', 'HEAD']);
    const commit = 'tree ' + tree + '\nparent ' + parent + '\nauthor Fixture <fixture@example.invalid> 1791494400 +0000\ncommitter Fixture <fixture@example.invalid> 1791494400 +0000\ngpgsig -----BEGIN ' + armor + '-----\n SYNTHETIC_SIGNATURE\n -----END ' + armor + '-----\n\nsigned-fixture\n';
    const signed = git(['hash-object', '-t', 'commit', '-w', '--stdin'], commit); git(['update-ref', 'HEAD', signed]);
    git(['config', 'log.showSignature', 'true']); git(['config', 'gpg.format', format]); git(['config', key, wrapper.replaceAll('\\', '/')]);
    if (format === 'ssh') { const signers = path.join(f.project, 'allowed-signers'); await fs.writeFile(signers, ''); git(['config', 'gpg.ssh.allowedSignersFile', signers.replaceAll('\\', '/')]); }
    git(['log', '-1', '--show-signature', '--format=%H']);
    const control = await fs.readFile(marker, 'utf8'); assert.match(control, /"readDeniedArchive":true/, 'Fixture control must really execute the configured verifier');
    await fs.unlink(marker);
    const options = await evidenceOptions(f.project, { codexHomes: [f.codexHome] });
    const log = await options.context.gateway.git(options.context, 'log');
    const detail = await options.context.gateway.git(options.context, 'commit', [signed, 'source.txt']);
    assert.match(log, /signed-fixture/); assert.match(detail, /signed-fixture/);
    assert.equal(await fs.stat(marker).then(() => true, () => false), false, 'Gateway must never execute configured signature verifiers');
  });
}
test('HOOK rejects a hard link before any body read and still accepts ordinary metadata', async t => {
  const f = await fixture(t), file = path.join(f.spool, hookName(0)); await fs.link(f.denied, file);
  const { source } = await hookSource(t, f), calls = traceBodies(t);
  await source.poll(); assert.equal(calls.filter(c => fold(c.file) === fold(file)).length, 0, 'Hard-linked rejected input must never enter a body API');
  assert.equal(source.records.size, 0);
  await fs.unlink(file); await fs.writeFile(file, hookRecord()); await source.poll();
  assert.equal(source.state.events.length, 1); assert.equal(source.state.events[0].metadata.turn_id, 'normal-turn');
});
test('HOOK checks opened identity when a named file is replaced after lstat', async t => {
  const f = await fixture(t), file = path.join(f.spool, hookName(0)); await fs.writeFile(file, hookRecord());
  const { source } = await hookSource(t, f); const lstat = fs.lstat; let swapped = false;
  t.mock.method(fs, 'lstat', async (...args) => {
    const stat = await lstat(...args);
    if (!swapped && fold(args[0]) === fold(file)) { swapped = true; await fs.rename(file, file + '.old'); await fs.link(f.denied, file); }
    return stat;
  });
  const calls = traceBodies(t); await source.poll();
  assert.equal(calls.filter(c => fold(c.file) === fold(file)).length, 0, 'Replacement alias must be rejected before a body read');
  assert.equal(source.records.size, 0);
});
test('HOOK rejects a spool ancestor junction into an archived store before body I/O', async t => {
  const f = await fixture(t), mapped = path.join(f.root, 'mapped'), event = path.join(f.archive, 'events'); await fs.mkdir(event);
  await fs.writeFile(path.join(event, hookName(0)), hookRecord('archive-turn'));
  await fs.symlink(f.archive, mapped, process.platform === 'win32' ? 'junction' : 'dir');
  const source = new WorkHookSource(path.join(mapped, 'events'), 'fixture-session', { registry: new ResourceRegistry({ codexHomes: [f.codexHome] }) });
  t.after(() => source.close()); const calls = traceBodies(t); await source.poll();
  assert.equal(calls.length, 0, 'A metadata spool must not alias a protected archive'); assert.equal(source.state.events.length, 0);
});
for (const pauseAt of [1, 2, 3]) {
  test('HOOK revocation after body ' + pauseAt + ' stops subsequent I/O, parsing, and cache rebuilding', async t => {
    const f = await fixture(t); for (let i = 0; i < 3; i++) await fs.writeFile(path.join(f.spool, hookName(i)), hookRecord('turn-' + i));
    const { source, access, ref } = await hookSource(t, f);
    let release, held, seen = 0; const ready = new Promise(r => { held = r; }), gate = new Promise(r => { release = r; });
    const calls = traceBodies(t, async file => { if (fold(file).startsWith(fold(f.spool)) && ++seen === pauseAt) { held(); await gate; } });
    const pending = source.poll().catch(error => error);
    await ready; await access.change(ref, { observe: false }, access.revision); const atRevoke = calls.length;
    const parse = JSON.parse; let parses = 0;
    t.mock.method(JSON, 'parse', text => { if (typeof text === 'string' && text.includes('"event_type"')) parses++; return parse(text); });
    release(); await pending;
    assert.equal(calls.length, atRevoke, 'Revoked run must not start any later body read');
    assert.equal(parses, 0, 'Returned bytes from the old permit must not be parsed');
    assert.equal(source.records.size, 0); assert.deepEqual(source.sessions, []); assert.deepEqual(source.state.events, []);
    await access.change(ref, { observe: true }, access.revision); await source.poll(); assert.equal(source.records.size, 3, 'A fresh grant can collect legitimate metadata');
  });
}
test('HOOK old poll cannot borrow a regrant or overwrite a later poll', async t => {
  const f = await fixture(t), file = path.join(f.spool, hookName(0)); await fs.writeFile(file, hookRecord('old-turn'));
  const { source, access, ref } = await hookSource(t, f);
  let release, held, once = false; const ready = new Promise(r => { held = r; }), gate = new Promise(r => { release = r; });
  traceBodies(t, async name => { if (!once && fold(name) === fold(file)) { once = true; held(); await gate; } });
  const old = source.poll().catch(error => error); await ready; source.close();
  await access.change(ref, { observe: true }, access.revision); await fs.writeFile(file, hookRecord('new-turn'));
  await source.poll(); release(); await old;
  assert.equal(source.state.turnId, 'new-turn', 'Old bytes must not be published under a new grant');
  assert.equal(source.records.get(hookName(0)).record.turn_id, 'new-turn');
});
test('HOOK overlapping polls commit only the newest lifecycle', async t => {
  const f = await fixture(t), file = path.join(f.spool, hookName(0)); await fs.writeFile(file, hookRecord('old-turn'));
  const { source } = await hookSource(t, f);
  let release, held, once = false; const ready = new Promise(r => { held = r; }), gate = new Promise(r => { release = r; });
  traceBodies(t, async name => { if (!once && fold(name) === fold(file)) { once = true; held(); await gate; } });
  const old = source.poll().catch(error => error); await ready; await fs.writeFile(file, hookRecord('new-turn'));
  await source.poll(); release(); await old; assert.equal(source.state.turnId, 'new-turn');
});
const endpoint = 'ws://127.0.0.1:4511/', rpcRef = sessionRef('rpc:' + endpoint, 'rpc-a');
async function rpcClient(t, options = {}) {
  const f = fakeRpc(t), access = new SessionAccess(); await access.change(rpcRef, { origin: 'codex', content: true }, access.revision);
  const source = new AppServerSource(endpoint, { access, timeoutMs: 150, ...options });
  t.after(() => source.close()); await source.connect(); await source.select(rpcRef.id); return { f, source, access };
}
test('RPC malformed and oversized frames cannot terminate the native WebSocket listener', async t => {
  const f = await wireHost(); t.after(() => f.close());
  const child = fork(fileURLToPath(new URL('./rpc-live-child.mjs', import.meta.url)), [f.endpoint], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true });
  t.after(() => { if (child.exitCode === null) child.kill(); }); let stdout = '', stderr = '';
  child.stdout.on('data', b => { stdout += b; }); child.stderr.on('data', b => { stderr += b; });
  const closed = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', code => resolve({ code, stdout, stderr })); });
  await Promise.race([new Promise(resolve => child.on('message', message => { if (message.ready) resolve(); })), closed.then(result => { throw new Error('Synthetic child closed before ready: ' + result.code); })]);
  for (const params of [{ threadId: 'A'.repeat(9000), turnId: 'turn-one', plan: [] }, { threadId: 'rpc-fixture', turnId: 'A'.repeat(9000), plan: [] }, { threadId: 'rpc-fixture', turnId: 'turn-one', plan: [null] }]) f.send({ method: 'turn/plan/updated', params });
  f.send({ method: 'turn/plan/updated', params: { threadId: 'rpc-fixture', turnId: 'turn-one', plan: [{ step: 'LEGITIMATE_AFTER_MALFORMED', status: 'pending' }] } });
  const result = await closed; assert.equal(result.code, 0, 'Malformed synthetic frame must not exit the process: ' + result.stderr.slice(0, 1000)); assert.match(result.stdout, /"survived":true/);
});
test('RPC rejected normalization leaves state, retired turns, and notification revision unchanged', async t => {
  const { source } = await rpcClient(t); source.state.turnId = null;
  const before = structuredClone(source.state), retired = [...source.retiredTurns], revision = source.notificationSeq;
  assert.doesNotThrow(() => source.receiveWire(JSON.stringify({ method: 'turn/plan/updated', params: { threadId: rpcRef.id, turnId: 'turn-new', plan: [null] } })));
  assert.deepEqual(source.state, before); assert.deepEqual([...source.retiredTurns], retired); assert.equal(source.notificationSeq, revision);
  source.receiveWire(JSON.stringify({ method: 'turn/plan/updated', params: { threadId: rpcRef.id, turnId: 'turn-new', plan: [{ step: 'LEGITIMATE_PLAN', status: 'pending' }] } }));
  assert.equal(source.state.plan[0].step, 'LEGITIMATE_PLAN');
});
for (const variant of ['thread-id', 'error-code', 'discovery-id']) {
  test('RPC malformed correlated ' + variant + ' rejects its pending request without escaping', async t => {
    const { f, source } = await rpcClient(t); f.reply = () => undefined;
    const method = variant === 'discovery-id' ? 'thread/loaded/list' : 'thread/read';
    const pending = source.request(method, { threadId: rpcRef.id, includeTurns: true }); pending.catch(() => {});
    const id = f.sent.at(-1).id;
    const frame = variant === 'error-code' ? { id, error: { code: 'A'.repeat(9000) } } : variant === 'discovery-id' ? { id, result: { data: ['A'.repeat(9000)] } } : { id, result: { thread: { id: 'A'.repeat(9000) } } };
    assert.doesNotThrow(() => source.receiveWire(JSON.stringify(frame)));
    await assert.rejects(pending, /malformed/i); assert.equal(source.pending.size, 0);
  });
}
test('PAGING stable default denies experimental requests before send and retains full history', async t => {
  const { f, source } = await rpcClient(t), before = f.sent.length;
  assert.equal(f.sent.find(request => request.method === 'initialize').params.capabilities.experimentalApi, false);
  for (const method of ['thread/turns/list', 'thread/items/list']) await assert.rejects(source.request(method, { threadId: rpcRef.id, turnId: 'turn-one' }), /EXPERIMENTAL_API_DISABLED/);
  assert.equal(f.sent.length, before); await source.poll(); assert.equal(source.state.title, 'AUTHORIZED_HISTORY');
  f.history.turns[0].itemsView = 'summary'; await source.poll();
  assert.match(source.diagnostics.historyPaging, /UNSUPPORTED: EXPERIMENTAL_API_DISABLED/);
  assert.equal(f.sent.some(request => ['thread/turns/list', 'thread/items/list'].includes(request.method)), false);
});
test('PAGING explicit opt-in declares capability and scopes turn/item pages', async t => {
  const { f, source } = await rpcClient(t, { experimentalApi: true }); f.history.turns[0].itemsView = 'summary';
  const original = f.reply; let enabled = false;
  f.reply = request => {
    if (request.method === 'initialize') { enabled = request.params.capabilities.experimentalApi === true; return {}; }
    if (['thread/turns/list', 'thread/items/list'].includes(request.method) && !enabled) return { error: { code: -32601 } };
    if (request.method === 'thread/turns/list') return { data: [{ id: 'turn-one', status: 'inProgress', itemsView: 'notLoaded', items: [] }], nextCursor: null };
    if (request.method === 'thread/items/list') return { data: [{ turnId: 'turn-one', item: { id: 'legitimate-tool', type: 'commandExecution', command: 'synthetic', status: 'completed', exitCode: 0 } }], nextCursor: null };
    return original(request);
  };
  source.disconnect(); await source.poll();
  assert.equal(enabled, true); assert.deepEqual(source.state.tools.map(tool => tool.id), ['legitimate-tool']);
  assert.equal(source.diagnostics.historyPaging, 'SUPPORTED'); assert.equal(source.diagnostics.itemPaging, 'SUPPORTED');
  const turnRequest = f.sent.find(request => request.method === 'thread/turns/list'), itemRequest = f.sent.find(request => request.method === 'thread/items/list');
  assert.equal(turnRequest.params.itemsView, 'full'); assert.equal(turnRequest.params.sortDirection, 'desc');
  assert.equal(itemRequest.params.turnId, 'turn-one');
});
