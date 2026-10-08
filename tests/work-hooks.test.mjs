import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, copyFile, writeFile, readdir, readFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WorkHookSource } from '../src/adapters/work-hooks.mjs';
import { createApplication } from '../src/server.mjs';
const recorder = fileURLToPath(new URL('../experiments/work-hooks/plugin/hooks/record-event.js', import.meta.url));
const { projectEvent } = createRequire(import.meta.url)(recorder);
const session = '00000000-0000-4000-8000-000000000001';
const turn = '00000000-0000-4000-8000-000000000002';
const privateFixture = { prompt: 'PRIVATE_PROMPT_SENTINEL', transcript_path: 'PRIVATE_TRANSCRIPT_SENTINEL', tool_response: { password: 'PRIVATE_PASSWORD_SENTINEL' }, reasoning: 'PRIVATE_REASONING_SENTINEL' };

test('projection keeps only four metadata fields and never supplies a missing turn ID', () => {
  const event = projectEvent({ hook_event_name: 'SessionStart', session_id: session, ...privateFixture });
  assert.ok(event, 'supported event should project to metadata');
  assert.deepEqual(Object.keys(event).sort(), ['event_type', 'session_id', 'timestamp', 'turn_id']);
  assert.equal(event.event_type, 'SessionStart'); assert.equal(event.session_id, session); assert.equal(event.turn_id, null);
  assert.ok(Number.isFinite(Date.parse(event.timestamp)));
  assert.doesNotMatch(JSON.stringify(event), /PRIVATE_/);
});

test('unsupported events and invalid identifiers produce no record', () => {
  for (const input of [null, {}, { hook_event_name: 'PreToolUse', session_id: session }, { hook_event_name: 'Stop', session_id: '../private' }, { hook_event_name: 'Stop', session_id: session, turn_id: { secret: 'PRIVATE_' } }]) assert.equal(projectEvent(input), null);
});

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'aps-hook-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'hooks'));
  await copyFile(recorder, path.join(root, 'hooks/record-event.js'));
  const eventsDir = path.join(root, 'events');
  await writeFile(path.join(root, 'settings.json'), JSON.stringify({ eventsDir }));
  return { root, eventsDir };
}
async function invoke(root, payload) {
  const child = spawn(process.execPath, [path.join(root, 'hooks/record-event.js')], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', b => { stdout += b; }); child.stderr.on('data', b => { stderr += b; });
  const exit = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
  child.stdin.on('error', () => {}); child.stdin.end(payload);
  return { code: await exit, stdout, stderr };
}

test('real recorder process writes all four event types without private content or injected instructions', async t => {
  const { root, eventsDir } = await fixture(t);
  for (const type of ['SessionStart', 'UserPromptSubmit', 'PostToolUse', 'Stop']) {
    const result = await invoke(root, JSON.stringify({ hook_event_name: type, session_id: session, turn_id: turn, ...privateFixture }));
    assert.equal(result.code, 0); assert.equal(result.stderr, ''); assert.equal(result.stdout, '{}');
  }
  const names = await readdir(eventsDir); assert.equal(names.length, 4);
  const events = await Promise.all(names.map(async name => JSON.parse(await readFile(path.join(eventsDir, name), 'utf8'))));
  assert.deepEqual(events.map(e => e.event_type).sort(), ['PostToolUse', 'SessionStart', 'Stop', 'UserPromptSubmit']);
  for (const e of events) { assert.deepEqual(Object.keys(e).sort(), ['event_type', 'session_id', 'timestamp', 'turn_id']); assert.equal(e.session_id, session); assert.equal(e.turn_id, turn); }
  assert.doesNotMatch(JSON.stringify(events), /PRIVATE_/);
});

test('concurrent callbacks preserve independent complete records', async t => {
  const { root, eventsDir } = await fixture(t);
  const results = await Promise.all(Array.from({ length: 12 }, (_, i) => invoke(root, JSON.stringify({ hook_event_name: 'PostToolUse', session_id: session, turn_id: `turn_${i}` }))));
  assert.ok(results.every(r => r.code === 0));
  const names = await readdir(eventsDir); assert.equal(names.length, 12);
  const ids = new Set(await Promise.all(names.map(async name => JSON.parse(await readFile(path.join(eventsDir, name), 'utf8')).turn_id)));
  assert.equal(ids.size, 12);
});

test('malformed or oversized input leaves no event and cannot steer the model', async t => {
  const { root, eventsDir } = await fixture(t);
  for (const payload of ['{malformed', JSON.stringify({ hook_event_name: 'Stop', session_id: session, prompt: 'x'.repeat(300000) })]) {
    const r = await invoke(root, payload); assert.equal(r.code, 0); assert.equal(r.stderr, ''); assert.ok(['', '{}'].includes(r.stdout));
  }
  assert.deepEqual(await readdir(eventsDir).catch(() => []), []);
});

async function callback(dir, event, index) {
  await mkdir(dir, { recursive: true });
  const filename = `1791494400000-00000000-0000-4000-8000-${String(index).padStart(12, '0')}.json`;
  await writeFile(path.join(dir, filename), JSON.stringify(event));
}
const metadata = (type, id = session, at = '2026-10-09T00:00:00.000Z') => ({ event_type: type, session_id: id, turn_id: turn, timestamp: at });

test('empty Hook source never claims a connected Work or supplies simulated activity', async t => {
  const { eventsDir } = await fixture(t); const source = new WorkHookSource(eventsDir);
  const state = await source.poll();
  assert.equal(source.received, false); assert.deepEqual(source.sessions, []);
  assert.deepEqual(state.events, []); assert.equal(state.usage.total, null);
});

test('new Hook sessions are discovered while the explicit selected session remains stable', async t => {
  const { eventsDir } = await fixture(t); const source = new WorkHookSource(eventsDir);
  await callback(eventsDir, metadata('UserPromptSubmit'), 1); await source.poll();
  assert.equal(source.sessions.length, 1); assert.equal(source.state.id, session);
  const other = '00000000-0000-4000-8000-000000000003';
  await callback(eventsDir, metadata('SessionStart', other, '2026-10-09T00:00:01.000Z'), 2);
  await source.poll(); assert.equal(source.sessions.length, 2); assert.equal(source.state.id, session);
  const selected = new WorkHookSource(eventsDir, other); await selected.poll();
  assert.equal(selected.state.id, other); assert.equal(selected.state.events.length, 1);
});

test('Hook reader rejects extra content and Stop cannot certify task completion', async t => {
  const { eventsDir } = await fixture(t);
  await callback(eventsDir, { ...metadata('PostToolUse'), prompt: 'PRIVATE_PROMPT_SENTINEL' }, 1);
  await callback(eventsDir, metadata('UserPromptSubmit'), 2);
  await callback(eventsDir, metadata('Stop', session, '2026-10-09T00:00:02.000Z'), 3);
  const source = new WorkHookSource(eventsDir); const state = await source.poll();
  assert.equal(state.events.length, 2); assert.equal(source.diagnostics.rejected, 1);
  assert.equal(state.phase, 'stop_observed'); assert.deepEqual(state.tools, []);
  assert.deepEqual(state.plan, []); assert.equal(state.usage.total, null);
  assert.doesNotMatch(JSON.stringify(state), /PRIVATE_/);
  assert.ok(state.events.every(e => e.metadata?.session_id === session));
});

test('collector delay excludes startup history and measures only newly arriving callbacks', async t => {
  const { eventsDir } = await fixture(t);
  await callback(eventsDir, metadata('SessionStart', session, '2020-01-01T00:00:00.000Z'), 1);
  const source = new WorkHookSource(eventsDir); await source.poll();
  assert.equal(source.state.events[0].ingestDelayMs, null);
  await callback(eventsDir, metadata('UserPromptSubmit', session, new Date().toISOString()), 2);
  await source.poll(); const live = source.state.events.at(-1);
  assert.ok(live.ingestDelayMs >= 0 && live.ingestDelayMs < 5000);
  assert.equal(live.ingestDelayMs, Date.parse(live.receivedAt) - Date.parse(live.at));
  await source.poll(); assert.equal(source.state.events.at(-1).receivedAt, live.receivedAt);
});

test('a callback without a turn ID does not inherit an earlier turn', async t => {
  const { eventsDir } = await fixture(t);
  await callback(eventsDir, metadata('Stop'), 1);
  await callback(eventsDir, { ...metadata('SessionStart', session, '2026-10-09T00:01:00.000Z'), turn_id: null }, 2);
  const source = new WorkHookSource(eventsDir); await source.poll();
  assert.equal(source.state.turnId, null); assert.equal(source.state.phase, 'session_observed');
});

test('partial, malformed, oversized and changed records never leak into Hook state', async t => {
  const { eventsDir } = await fixture(t); await mkdir(eventsDir);
  await writeFile(path.join(eventsDir, 'unfinished.pending'), '{');
  await callback(eventsDir, metadata('Stop'), 1);
  const source = new WorkHookSource(eventsDir); await source.poll(); assert.equal(source.state.events.length, 1);
  await callback(eventsDir, { ...metadata('Stop'), private: 'PRIVATE_' + 'x'.repeat(1500) }, 1);
  await callback(eventsDir, metadata('Stop', 'constructor'), 2);
  await source.poll(); assert.equal(source.received, false); assert.deepEqual(source.state.events, []);
  assert.equal(source.diagnostics.rejected, 1); assert.equal(source.sessions[0].id, 'constructor');
});

test('live service separates Hook metadata from Codex evidence and persists explicit source attribution', async t => {
  const { root, eventsDir } = await fixture(t);
  const codexHome = path.join(root, 'codex'); await mkdir(path.join(codexHome, 'sessions'), { recursive: true });
  const log = [
    { type: 'session_meta', payload: { id: 'codex-fixture', cwd: root } },
    { type: 'event_msg', payload: { type: 'user_message', message: 'Codex fixture still works' } }
  ].map(value => JSON.stringify({ timestamp: '2026-10-09T00:00:00Z', ...value })).join('\n') + '\n';
  await writeFile(path.join(codexHome, 'sessions/rollout-fixture.jsonl'), log);
  const options = { port: 0, mode: 'demo', dataDir: path.join(root, 'data'), workHooksDir: eventsDir, workspace: root, codexHome, interval: 0 };
  const server = await createApplication(options);
  t.after(() => server.close());
  const boot = await (await fetch(server.url + '/api/bootstrap')).json();
  const post = (url, data) => fetch(server.url + url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-APS-Token': boot.token }, body: JSON.stringify(data) });
  const connected = await post('/api/source', { mode: 'work-hooks' }); assert.equal(connected.status, 200);
  const empty = await connected.json(); assert.equal(empty.source.connected, false); assert.equal(empty.acceptance.percent, null);
  await callback(eventsDir, metadata('UserPromptSubmit'), 1); await server.service.tick();
  const s = server.service.snapshot;
  assert.equal(s.source.mode, 'work-hooks'); assert.equal(s.source.origin, 'unknown');
  assert.equal(s.hookSessions.length, 1); assert.equal(s.workspace, null); assert.equal(s.acceptance.percent, null);
  assert.equal(s.evidence.git.available, false); assert.equal(s.task.usage.total, null);
  assert.equal((await post('/api/hook-origin', { sessionId: session, origin: 'work-local' })).status, 200);
  assert.equal(server.service.snapshot.source.origin, 'work-local'); assert.equal(server.service.snapshot.source.attribution, 'user-confirmed');
  const persisted = JSON.parse(await readFile(path.join(root, 'data/hook-origins.json'), 'utf8')); assert.equal(persisted[session], 'work-local');
  const restarted = await createApplication({ ...options, mode: 'work-hooks' }); t.after(() => restarted.close());
  assert.equal(restarted.service.snapshot.source.origin, 'work-local');
  assert.equal((await post('/api/hook-origin', { sessionId: 'not-found', origin: 'codex' })).status, 400);
  assert.equal((await post('/api/source', { mode: 'local', id: 'codex-fixture' })).status, 200);
  assert.equal(server.service.snapshot.task.title, 'Codex fixture still works');
  assert.equal(server.service.snapshot.source.origin, 'codex'); assert.equal(server.service.snapshot.workspace, root);
  assert.deepEqual(server.service.snapshot.hookSessions, []);
  assert.equal((await post('/api/source', { mode: 'work-hooks', id: session })).status, 200);
  assert.equal(server.service.snapshot.workspace, null); assert.equal(server.service.snapshot.source.origin, 'work-local');
  assert.equal((await post('/api/source', { mode: 'demo', scenario: 'showcase' })).status, 200);
  assert.equal(server.service.snapshot.source.mode, 'demo'); assert.equal(server.service.snapshot.acceptance.percent, 33.3);
});
