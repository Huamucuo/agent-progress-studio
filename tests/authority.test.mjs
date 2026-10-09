import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { SessionAccess, sessionRef } from '../src/core/session-access.mjs';
import { AccessStore } from '../src/core/access-store.mjs';
const id = 'abcdef12-abcd-4abc-8abc-abcdef123456';
const ref = sessionRef('rpc:ws://127.0.0.1:4567/', id);
const grant = (a, change) => a.change(ref, change, a.revision);
async function authority(t) {
  const dir = await fs.mkdtemp(path.join(tmpdir(), 'aps-authority-'));
  const store = new AccessStore(dir), saved = await store.open();
  const access = new SessionAccess(saved, {}, store);
  t.after(async () => { await access.close(); await fs.rm(dir, { recursive: true, force: true }); });
  return { access, store, dir };
}
test('authority denies unknown, separates backend, canonicalizes UUID and never inherits child grants', async t => {
  const { access: a } = await authority(t);
  assert.throws(() => a.issue(ref, 'content'));
  await grant(a, { origin: 'codex', content: true });
  const p = a.issue(ref, 'content'); assert.ok(a.valid(p));
  assert.ok(a.can(sessionRef(ref.backend, id.toUpperCase()), 'content'));
  assert.equal(a.can(sessionRef('rpc:ws://127.0.0.1:4568/', id), 'content'), false);
  assert.equal(a.can(sessionRef(ref.backend, 'child'), 'content'), false);
  await grant(a, { content: false }); await grant(a, { origin: 'codex', content: true });
  assert.equal(a.valid(p), false, 'regrant never renews old permits');
  assert.equal(a.valid({ ...a.issue(ref, 'content') }), false, 'permits are not forgeable');
});
test('T-02 old grant save held across revoke cannot overwrite deny', async t => {
  const { access: a, store } = await authority(t);
  let release, entered; const waiting = new Promise(r => { entered = r; });
  const original = store.stage.bind(store);
  store.stage = async (...args) => { const p = await original(...args); entered(); await new Promise(r => { release = r; }); return p; };
  const old = grant(a, { origin: 'codex', content: true });
  await waiting; const deny = grant(a, { content: false });
  assert.equal(a.can(ref, 'content'), false); store.stage = original; release();
  await assert.rejects(old, /stale/i); await deny;
  assert.equal(a.can(ref, 'content'), false);
  assert.equal(JSON.parse(await fs.readFile(path.join(store.directory, 'session-access.json'), 'utf8')).entries[JSON.stringify(ref)].content.allowed, false);
});
test('T-02 persistence failure keeps revoke denied; unclean and normal failure shutdown cannot revive grants', async t => {
  const { access: a, store, dir } = await authority(t);
  await grant(a, { origin: 'codex', content: true });
  store.stage = async () => { throw new Error('synthetic disk failure'); };
  await assert.rejects(grant(a, { content: false }), /disk failure/);
  assert.equal(a.can(ref, 'content'), false); await a.close();
  const s2 = new AccessStore(dir), b = new SessionAccess(await s2.open(), {}, s2);
  assert.equal(b.can(ref, 'content'), false); await b.close();
});
test('v1 migrates labels only; normal v2 restart preserves grants and single writer rejects a second owner', async t => {
  const old = new SessionAccess({ version: 1, sessions: { [id]: { origin: 'codex', bodyRead: true } } });
  assert.equal(old.can(ref, 'content'), false);
  const { access: a, store, dir } = await authority(t); await grant(a, { origin: 'codex', content: true });
  await assert.rejects(new AccessStore(dir).open(), /already open/);
  await a.close(); const s2 = new AccessStore(dir), b = new SessionAccess(await s2.open(), {}, s2);
  assert.equal(b.can(ref, 'content'), true); await b.close();
});

test('T-02 shutdown during pending revoke cannot clear the dirty barrier before durable denial', async t => {
  const { access: a, store, dir } = await authority(t); await grant(a, { origin: 'codex', content: true });
  let entered, release; const ready = new Promise(r => { entered = r; }), original = store.stage.bind(store);
  store.stage = async value => { const file = await original(value); entered(); await new Promise(r => { release = r; }); return file; };
  const revoke = grant(a, { content: false }); await ready; const close = a.close(); release(); await revoke.catch(() => {}); await close;
  for (let count = 0; count < 2; count++) {
    const s = new AccessStore(dir), b = new SessionAccess(await s.open(), {}, s); assert.equal(b.can(ref, 'content'), false); await b.close();
  }
});
test('A07 recovery deny survives a second clean restart even without a user mutation', async t => {
  const { access: a, store, dir } = await authority(t); await grant(a, { origin: 'codex', content: true });
  store.failed = true; await a.close();
  for (let count = 0; count < 2; count++) {
    const s = new AccessStore(dir), b = new SessionAccess(await s.open(), {}, s); assert.equal(b.can(ref, 'content'), false, 'Recovered deny must be durable'); await b.close();
  }
});
