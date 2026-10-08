import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, copyFile, writeFile, readdir, readFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
