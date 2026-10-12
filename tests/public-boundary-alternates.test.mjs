import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { syncBuiltinESMExports } from 'node:module';
import { WorkHookSource } from '../src/adapters/work-hooks.mjs';
import { AppServerSource } from '../src/adapters/app-server.mjs';
import { SessionAccess, sessionRef } from '../src/core/session-access.mjs';
import { scanEnvelope } from '../src/adapters/rpc-envelope.mjs';
import { fakeRpc } from './rpc-fixture.mjs';
const name = '1791494400000-00000000-0000-4000-8000-000000000001.json';
const record = turn => JSON.stringify({ event_type: 'Stop', session_id: 'fixture-session', timestamp: '2026-10-09T00:00:00.000Z', turn_id: turn });
const fold = file => process.platform === 'win32' ? String(file).toLowerCase() : String(file);
async function spool(t) { const root = await fs.mkdtemp(path.join(tmpdir(), 'aps-alternate-')); t.after(() => fs.rm(root, { recursive: true, force: true })); return root; }
test('HOOK replacement with identical size and mtime cannot retain cached old identity', async t => {
  const root = await spool(t), file = path.join(root, name), source = new WorkHookSource(root, 'fixture-session'); t.after(() => source.close());
  await fs.writeFile(file, record('old-turn')); const stamp = new Date(1791494400000); await fs.utimes(file, stamp, stamp); await source.poll();
  const replacement = file + '.replacement'; await fs.writeFile(replacement, record('new-turn')); await fs.utimes(replacement, stamp, stamp);
  await fs.rename(file, file + '.old'); await fs.rename(replacement, file); await source.poll();
  assert.equal(source.state.turnId, 'new-turn', 'Same-size/time rename must not reuse a different inode cache');
});
test('HOOK body allocation stays bounded when input grows after metadata validation', async t => {
  const root = await spool(t), file = path.join(root, name); await fs.writeFile(file, record('normal-turn'));
  const source = new WorkHookSource(root, 'fixture-session'); t.after(() => source.close()); const lstat = fs.lstat, readFile = fs.readFile, open = fs.open;
  let grown = false; const lengths = [];
  t.mock.method(fs, 'lstat', async (...args) => {
    const info = await lstat(...args);
    if (!grown && fold(args[0]) === fold(file)) { grown = true; await fs.appendFile(file, 'X'.repeat(2 * 1024 * 1024)); }
    return info;
  });
  t.mock.method(fs, 'readFile', async (...args) => { const result = await readFile(...args); if (fold(args[0]) === fold(file)) lengths.push(result.length); return result; });
  t.mock.method(fs, 'open', async (...args) => {
    const handle = await open(...args); if (fold(args[0]) === fold(file)) {
      const read = handle.read.bind(handle), readAll = handle.readFile.bind(handle);
      t.mock.method(handle, 'read', async (...parameters) => { const result = await read(...parameters); lengths.push(result.bytesRead); assert.ok(parameters[2] <= 1025, 'Bounded read allocation'); return result; });
      t.mock.method(handle, 'readFile', async (...parameters) => { const result = await readAll(...parameters); lengths.push(result.length); return result; });
    } return handle;
  });
  syncBuiltinESMExports(); t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  await source.poll(); assert.ok(lengths.every(length => length <= 1025), 'Rejecting after an unbounded read is too late'); assert.equal(source.records.size, 0);
});
test('RPC routing keys are bounded while long ungranted payload text stays skippable', () => {
  assert.throws(() => scanEnvelope(JSON.stringify({ ['K'.repeat(5000)]: true })), /routing scalar limit/);
  const frame = scanEnvelope(JSON.stringify({ method: 'item/agentMessage/delta', params: { threadId: 'other', delta: 'X'.repeat(20000) } }));
  assert.equal(frame.method, 'item/agentMessage/delta');
});
test('RPC malformed authorized history cannot retire the current turn before normalization succeeds', async t => {
  const endpoint = 'ws://127.0.0.1:4512/', ref = sessionRef('rpc:' + endpoint, 'rpc-a'), f = fakeRpc(t), access = new SessionAccess();
  await access.change(ref, { origin: 'codex', content: true }, access.revision);
  const source = new AppServerSource(endpoint, { access, timeoutMs: 150 }); t.after(() => source.close()); await source.connect(); await source.select(ref.id);
  const previous = structuredClone(source.state), retired = [...source.retiredTurns];
  f.history.turns = [{ id: 'new-turn', status: 'inProgress', items: [{ id: 'bad-message', type: 'userMessage', content: [null] }] }];
  await assert.rejects(source.poll()); assert.deepEqual(source.state, previous); assert.deepEqual([...source.retiredTurns], retired);
  f.history.turns[0].items[0].content = [{ type: 'input_text', text: 'LEGITIMATE_AFTER_BAD_HISTORY' }];
  await source.poll(); assert.equal(source.state.title, 'LEGITIMATE_AFTER_BAD_HISTORY'); assert.equal(source.state.turnId, 'new-turn');
});
