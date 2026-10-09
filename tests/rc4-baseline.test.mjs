import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { sourceFingerprint } from '../src/collectors/evidence.mjs';
import { AppServerSource } from '../src/adapters/app-server.mjs';

test('RC4 P-02: archived session cannot be fingerprinted through evidence without authority', async t => {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'aps-rc4-red-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const archive = path.join(root, 'archived_sessions'); await fs.mkdir(archive);
  const file = path.join(archive, 'abcdef12-abcd-4abc-8abc-abcdef123456.jsonl');
  await fs.writeFile(file, 'SYNTHETIC_UNAUTHORIZED_ARCHIVE');
  const read = fs.readFile; let reads = 0;
  t.mock.method(fs, 'readFile', (...args) => { if (String(args[0]) === file) reads++; return read(...args); });
  syncBuiltinESMExports(); t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  await sourceFingerprint(archive, { protectedRoots: [path.join(root, 'sessions')] });
  assert.equal(reads, 0, 'Denied body readFile must never run');
});

test('RC4 F-02: response envelope supports result-before-id and a typed string ID', () => {
  const source = new AppServerSource('ws://127.0.0.1:4500'); let result;
  source.channel = { connection: 0, selection: 0 };
  source.pending.set('s:rpc-1', { channel: source.channel, method: 'initialize', resolve: value => { result = value; }, reject: assert.fail });
  source.receiveWire('{"result":{"ok":true},"id":"rpc-1"}');
  assert.deepEqual(result, { ok: true });
});
