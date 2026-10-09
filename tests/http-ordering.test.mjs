import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createApplication } from '../src/server.mjs';
import { scope } from './access-fixture.mjs';
const id = 'abcdef12-abcd-4abc-8abc-abcdef123456';
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'aps-order-')); await fs.mkdir(root + '/codex/sessions', { recursive: true });
  await fs.writeFile(root + '/codex/sessions/' + id + '.jsonl', JSON.stringify({ type: 'session_meta', payload: { id } }) + '\n' + JSON.stringify({ type: 'event_msg', payload: { type: 'user_message', message: 'PRIVATE_ORDER_FIXTURE' } }) + '\n');
  const app = await createApplication({ port: 0, dataDir: root + '/data', codexHome: root + '/codex', interval: 0 });
  t.after(async () => { await app.close(); await fs.rm(root, { recursive: true, force: true }); });
  await app.service.sessionAccess({ sessionId: id, decision: 'allow-codex' });
  const boot = await (await fetch(app.url + '/api/bootstrap')).json();
  return { app, post: data => fetch(app.url + '/api/session-access', { method: 'POST', headers: { 'content-type': 'application/json', 'x-aps-token': boot.token }, body: JSON.stringify(data) }) };
}
test('O02 held export before final write is denied after revoke; stale grant HTTP rejected before reads', async t => {
  const { app, post } = await fixture(t), oldScope = scope(app);
  let entered, release; const ready = new Promise(r => { entered = r; }), gate = new Promise(r => { release = r; });
  const original = app.service.refresh.bind(app.service); let once = true;
  app.service.refresh = async () => { const result = await original(); if (once) { once = false; entered(); await gate; } return result; };
  const result = fetch(app.url + '/api/export'); await ready;
  const revoked = await post({ sessionId: id, decision: 'revoke', ...scope(app) }); assert.equal(revoked.status, 200);
  release(); const response = await result; assert.equal(response.status, 400); assert.doesNotMatch(await response.text(), /PRIVATE_ORDER_FIXTURE/);
  assert.equal((await post({ sessionId: id, decision: 'allow-codex', ...oldScope })).status, 409);
  assert.equal(app.service.snapshot.task.title, '');
});
test('O03 SSE history/Last-Event-ID reconnect reconstructs only current scope', async t => {
  const { app } = await fixture(t); const old = app.service.snapshot; await app.service.sessionAccess({ sessionId: id, decision: 'revoke' });
  let serialized = 0; assert.throws(() => app.service.publication.write(old, () => serialized++)); assert.equal(serialized, 0);
  const controller = new AbortController(), response = await fetch(app.url + '/api/stream', { headers: { 'Last-Event-ID': String(old.access.publicationSeq) }, signal: controller.signal });
  const text = new TextDecoder().decode((await response.body.getReader().read()).value); controller.abort();
  assert.doesNotMatch(text, /PRIVATE_ORDER_FIXTURE/); assert.match(text, /"title":""/);
});
test('O02 revoke barrier is immediate while collection queue remains blocked', async t => {
  const { app } = await fixture(t), source = app.service.source; let release, entered;
  const ready = new Promise(r => { entered = r; }), gate = new Promise(r => { release = r; }), poll = source.poll.bind(source);
  source.poll = async () => { entered(); await gate; return poll(); };
  const refresh = app.service.refresh(); await ready; const ref = app.service.currentRef();
  const revoke = app.service.sessionAccess({ sessionId: id, decision: 'revoke' });
  assert.equal(app.service.access.can(ref, 'content'), false); assert.equal(app.service.snapshot, null);
  release(); await assert.rejects(refresh, /scope changed/); await revoke; assert.equal(app.service.snapshot.task.title, '');
});

test('T-02 delayed revoke HTTP response cannot override a newer explicit grant', async t => {
  const { app, post } = await fixture(t); let entered, release;
  const ready = new Promise(r => { entered = r; }), gate = new Promise(r => { release = r; });
  const original = app.service.sessionAccess.bind(app.service);
  app.service.sessionAccess = async input => {
    const result = await original(input);
    if (input.decision === 'revoke') { entered(); await gate; }
    return result;
  };
  const revoke = post({ sessionId: id, decision: 'revoke', ...scope(app) }); await ready;
  assert.equal(app.service.access.can(app.service.currentRef(), 'content'), false);
  const granted = await post({ sessionId: id, decision: 'allow-codex', ...scope(app) });
  assert.equal(granted.status, 200); assert.match(await granted.text(), /PRIVATE_ORDER_FIXTURE/);
  release(); const stale = await revoke; assert.equal(stale.status, 400);
  assert.equal(app.service.access.can(app.service.currentRef(), 'content'), true);
  assert.match(JSON.stringify(await (await fetch(app.url + '/api/export')).json()), /PRIVATE_ORDER_FIXTURE/);
});
