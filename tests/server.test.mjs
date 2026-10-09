import { scope } from './access-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApplication } from '../src/server.mjs';

async function app(t, dataDir) {
  const dir = dataDir || await mkdtemp(path.join(tmpdir(), 'aps-http-'));
  const server = await createApplication({ port: 0, mode: 'demo', dataDir: dir, interval: 0 });
  t.after(async () => { await server.close(); if (!dataDir) await rm(dir, { recursive: true, force: true }); });
  const base = server.url, boot = await (await fetch(base + '/api/bootstrap')).json();
  const post = (url, body, token = boot.token) => fetch(base + url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-aps-token': token }, body: JSON.stringify({ ...body, ...scope(server) }) });
  return { base, post, server, dir };
}
test('snapshot exposes deterministic demo, separate acceptance and replay controls', async t => {
  const a = await app(t);
  const snapshot = await (await fetch(a.base + '/api/snapshot')).json();
  assert.equal(snapshot.acceptance.percent, 33.3);
  assert.equal(snapshot.acceptance.counts.failed, 1);
  assert.equal(snapshot.source.mode, 'demo');
  assert.equal((await a.post('/api/demo', { action: 'restart' })).status, 200);
  const empty = await (await fetch(a.base + '/api/snapshot')).json();
  assert.equal(empty.task.plan.length, 0);
});
test('unsafe origins, invalid CSRF tokens and traversal requests are rejected', async t => {
  const a = await app(t);
  assert.equal((await a.post('/api/demo', { action: 'restart' }, 'bad')).status, 403);
  assert.equal((await fetch(a.base + '/api/snapshot', { headers: { Origin: 'https://evil.invalid' } })).status, 403);
  assert.equal((await fetch(a.base + '/api/evidence?kind=file&id=../secret')).status, 400);
  assert.equal((await fetch(a.base + '/src/server.mjs')).status, 404);
});
test('human acceptance is durable and exports retain source labels', async t => {
  const a = await app(t);
  const snapshot = await (await fetch(a.base + '/api/snapshot')).json();
  const response = await a.post('/api/review', { criterionId: 'review', decision: 'accept', note: 'Reviewed fixture', fingerprint: snapshot.evidence.fingerprint, manifestHash: snapshot.evidence.manifestHash });
  assert.equal(response.status, 200);
  const updated = await (await fetch(a.base + '/api/export')).json();
  assert.equal(updated.acceptance.percent, 50);
  assert.equal(updated.acceptance.criteria[2].status, 'accepted');
  assert.equal(updated.source.mode, 'demo');
  await a.server.close(); const b = await app(t, a.dir);
  assert.equal((await (await fetch(b.base + '/api/snapshot')).json()).acceptance.criteria[2].status, 'accepted');
});
test('source change to no-plan clears acceptance and metrics', async t => {
  const a = await app(t);
  assert.equal((await a.post('/api/source', { mode: 'demo', scenario: 'no-plan' })).status, 200);
  const s = await (await fetch(a.base + '/api/snapshot')).json();
  assert.equal(s.acceptance.percent, null); assert.equal(s.task.usage.total, null); assert.equal(s.task.plan.length, 0);
});
test('SSE sends an initial authoritative snapshot for reconnect recovery', async t => {
  const a = await app(t); const controller = new AbortController();
  const response = await fetch(a.base + '/api/stream', { signal: controller.signal });
  const reader = response.body.getReader(); const chunk = await reader.read(); controller.abort();
  const text = new TextDecoder().decode(chunk.value);
  assert.match(text, /event: snapshot/); assert.match(text, /"schemaVersion":1/);
});

test('Codex discovery runs during observation, follows the first arrival, and preserves explicit selection', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'aps-discovery-'));
  const logDir = path.join(dir, 'codex/sessions'); await mkdir(logDir, { recursive: true });
  const app = await createApplication({ port: 0, mode: 'local', dataDir: path.join(dir, 'data'), codexHome: path.join(dir, 'codex'), interval: 0 });
  t.after(async () => { await app.close(); await rm(dir, { recursive: true, force: true }); });
  const row = (type, payload) => JSON.stringify({ timestamp: new Date().toISOString(), type, payload }) + '\n';
  await writeFile(path.join(logDir, 'abcdef12-abcd-4abc-8abc-abcdef123456.jsonl'), row('session_meta', { id: 'abcdef12-abcd-4abc-8abc-abcdef123456', cwd: dir }));
  await app.service.tick();
  assert.equal(app.service.snapshot.task.id, 'abcdef12-abcd-4abc-8abc-abcdef123456');
  await writeFile(path.join(logDir, 'feedbeef-abcd-4abc-8abc-abcdef123456.jsonl'), row('session_meta', { id: 'feedbeef-abcd-4abc-8abc-abcdef123456', cwd: dir }));
  await app.service.tick();
  assert.deepEqual(app.service.snapshot.sessions.map(s => s.id).sort(), ['abcdef12-abcd-4abc-8abc-abcdef123456', 'feedbeef-abcd-4abc-8abc-abcdef123456']);
  assert.equal(app.service.snapshot.task.id, 'abcdef12-abcd-4abc-8abc-abcdef123456');
  assert.equal(app.service.snapshot.sessions[0].path, undefined);
  await app.service.select({ mode: 'local', id: 'feedbeef-abcd-4abc-8abc-abcdef123456' });
  assert.equal(app.service.snapshot.source.origin, 'unknown');
  assert.equal(app.service.snapshot.task.title, '');
  await app.service.sessionAccess({ sessionId: 'feedbeef-abcd-4abc-8abc-abcdef123456', decision: 'allow-codex' });
  await appendFile(path.join(logDir, 'feedbeef-abcd-4abc-8abc-abcdef123456.jsonl'), row('event_msg', { type: 'user_message', message: 'Selected fixture live update' }));
  await app.service.tick();
  assert.equal(app.service.snapshot.task.title, 'Selected fixture live update');
  assert.equal(app.service.snapshot.source.origin, 'codex');
});
