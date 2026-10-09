import test from 'node:test';
import assert from 'node:assert/strict';
import { StateReceiver } from '../public/state-receiver.mjs';
import { Publication } from '../src/core/publication.mjs';
import { SessionAccess, sessionRef } from '../src/core/session-access.mjs';
const meta = (revision = 1, seq = 1, instance = 'server-one', selection = 1) => ({ authorityInstanceId: instance, policyRevision: revision, publicationSeq: seq, selectionRevision: selection, dependencies: [], sessionRef: null });
const payload = (r, s, i, select) => ({ task: { title: 'SYNTHETIC_PRIVATE' }, access: meta(r, s, i, select) });
function start(receiver, instance = 'server-one') { const ticket = receiver.begin(); assert.ok(receiver.bootstrap({ access: meta(1, 0, instance), freshnessMs: 10000 }, ticket)); return receiver.ticket('snapshot'); }
test('T-01/T-04 old bootstrap, instance, SSE and connection error cannot roll back new authority', () => {
  const r = new StateReceiver(); const old = r.begin(), newer = r.begin();
  assert.ok(r.bootstrap({ access: meta(1, 0, 'new'), freshnessMs: 10000 }, newer));
  assert.equal(r.bootstrap({ access: meta(1, 99, 'old') }, old), false);
  assert.equal(r.accept(payload(1, 100, 'old'), r.ticket('snapshot')), false);
  assert.equal(r.isCurrent(old), false); assert.equal(r.instance, 'new');
});
test('T-03 newer SSE does not starve valid same-scope detail/export; revoke invalidates both', () => {
  const r = new StateReceiver(); start(r);
  const detail = r.ticket('detail'), exported = r.ticket('export'), stream = r.ticket('snapshot');
  assert.ok(r.accept(payload(1, 10), stream));
  assert.ok(r.accept(payload(1, 5), detail)); assert.ok(r.accept(payload(1, 6), exported));
  assert.ok(r.accept(payload(1, 9), r.ticket('control')), 'A mutation already observed by SSE can complete without applying its old snapshot');
  const late = r.ticket('export'); r.invalidate(); start(r);
  assert.equal(r.accept(payload(1, 100), late), false);
  const oldStream = r.ticket('snapshot'); start(r);
  assert.equal(r.accept(payload(1, 101), oldStream), false, 'An old connection cannot write even when instance, policy and selection are unchanged');
});
test('T-04 stale A-B-A snapshots and expired authority never resurrect cached data', () => {
  let now = 0; const r = new StateReceiver(() => now); start(r);
  const ticket = r.ticket('snapshot'); assert.ok(r.accept(payload(1, 4), ticket));
  assert.ok(r.accept(payload(1, 5, 'server-one', 3), ticket));
  assert.equal(r.accept(payload(1, 6, 'server-one', 1), ticket), false);
  now = 10001; assert.equal(r.fresh(), false); assert.equal(r.accept(payload(1, 7, 'server-one', 3), ticket), false);
});
test('P-03 final serialization and write reject old lineage after revoke/regrant', async () => {
  const a = new SessionAccess(), ref = sessionRef('rpc:ws://127.0.0.1:1234/', 'a');
  await a.change(ref, { origin: 'codex', content: true }, a.revision);
  const p = new Publication(a, () => 1), value = p.seal({ text: 'PRIVATE' }, { permits: [a.issue(ref, 'content')], ref });
  await a.change(ref, { content: false }, a.revision); await a.change(ref, { content: true }, a.revision);
  let writes = 0; assert.throws(() => p.write(value, () => writes++)); assert.equal(writes, 0);
  assert.throws(() => p.write({ ...value }, () => writes++));
});

test('T-02 late revoke response cannot roll back explicit newer grant; stale controls cannot change instance', () => {
  const r = new StateReceiver(); start(r); const revoke = r.ticket('control');
  assert.ok(r.accept(payload(3, 8), r.ticket('snapshot')));
  assert.equal(r.accept(payload(2, 4), revoke), false);
  const pending = r.ticket('control'); start(r, 'restarted');
  assert.equal(r.accept(payload(5, 200), pending), false); assert.equal(r.instance, 'restarted');
});
