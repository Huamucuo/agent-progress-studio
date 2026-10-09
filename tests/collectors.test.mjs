import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, appendFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { normalizeRecord, normalizeNotification } from '../src/adapters/normalize.mjs';
import { LogSource, discoverSessions } from '../src/adapters/codex-log.mjs';
import { collectEvidence, sourceFingerprint, confinedFile } from '../src/collectors/evidence.mjs';

const line = (type, payload) => JSON.stringify({ timestamp: '2026-10-09T00:00:00Z', type, payload }) + '\n';
async function temp(t) { const dir = await mkdtemp(path.join(tmpdir(), 'aps-test-')); t.after(() => rm(dir, { recursive: true, force: true })); return dir; }
test('Codex reported plan and usage normalize without invented context', () => {
  const p = normalizeRecord({ type: 'response_item', payload: { type: 'function_call', name: 'update_plan', arguments: '{"plan":[{"step":"build","status":"in_progress"}]}' } }, 'p');
  assert.equal(p[0].plan[0].status, 'inProgress');
  const u = normalizeRecord({ type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { total_tokens: 500000 }, last_token_usage: { total_tokens: 12000 } } } }, 'u');
  assert.equal(u[0].last, 12000); assert.equal(u[0].contextWindow, undefined);
});
test('private reasoning and unknown record shapes are ignored', () => {
  assert.deepEqual(normalizeRecord({ type: 'response_item', payload: { type: 'reasoning', encrypted_content: 'private' } }, 'x'), []);
  assert.deepEqual(normalizeRecord({ type: 'unknown', payload: { password: 'hidden' } }, 'x'), []);
});
test('official app-server notifications map command status and plan', () => {
  const r = normalizeNotification({ method: 'item/completed', params: { threadId: 'a', item: { id: 'tool', type: 'commandExecution', command: 'test', exitCode: 1, aggregatedOutput: 'failed', status: 'failed' } } }, 'n');
  assert.equal(r[0].status, 'failed'); assert.equal(r[0].exitCode, 1);
});
test('log discovery, partial UTF-8 append, malformed lines and truncation recover', async t => {
  const dir = await temp(t); await mkdir(path.join(dir, 'sessions/2026/10/09'), { recursive: true });
  const file = path.join(dir, 'sessions/2026/10/09/rollout-abcdef12-abcd-4abc-8abc-abcdef123456.jsonl');
  await writeFile(file, line('session_meta', { id: 'abcdef12-abcd-4abc-8abc-abcdef123456', cwd: dir }) + line('event_msg', { type: 'task_started', turn_id: 'turn' }));
  const sessions = await discoverSessions(dir); assert.equal(sessions[0].id, 'abcdef12-abcd-4abc-8abc-abcdef123456');
  const source = new LogSource(file, 'abcdef12-abcd-4abc-8abc-abcdef123456', undefined, { canRead: () => true }); await source.poll();
  const content = Buffer.from(line('event_msg', { type: 'user_message', message: '中文任务' }));
  await appendFile(file, content.subarray(0, content.length - 3)); await source.poll();
  assert.equal(source.state.title, '');
  await appendFile(file, content.subarray(content.length - 3)); await source.poll();
  assert.equal(source.state.title, '中文任务');
  await appendFile(file, 'not-json\n'); await source.poll(); assert.equal(source.diagnostics.malformed, 1);
  await writeFile(file, line('session_meta', { id: 'abcdef12-abcd-4abc-8abc-abcdef123456', cwd: dir })); await source.poll();
  assert.equal(source.state.title, ''); assert.equal(source.diagnostics.rotated, true);
});
test('test evidence becomes stale when source bytes change and Git diffs are readable', async t => {
  const dir = await temp(t); await mkdir(path.join(dir, '.agent-progress'));
  const m = { version: 1, taskId: 'demo', criteria: [{ id: 'c', title: 'condition', checks: ['suite'], files: ['app.txt'] }] };
  await writeFile(path.join(dir, '.agent-progress/acceptance.json'), JSON.stringify(m));
  await writeFile(path.join(dir, 'app.txt'), 'one');
  execFileSync('git', ['init', '-q', dir]);
  execFileSync('git', ['-C', dir, 'add', 'app.txt']);
  execFileSync('git', ['-C', dir, '-c', 'user.name=APS Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'fixture']);
  const fp = await sourceFingerprint(dir);
  await writeFile(path.join(dir, '.agent-progress/results.json'), JSON.stringify({ version: 1, generatedAt: '2026-10-09T00:00:00Z', sourceFingerprint: fp.hash, tests: [{ id: 'suite', status: 'passed' }] }));
  const before = await collectEvidence(dir); assert.equal(before.report.current, true); assert.equal(before.git.commits.length, 1);
  await writeFile(path.join(dir, 'app.txt'), 'two');
  const after = await collectEvidence(dir); assert.equal(after.report.current, false); assert.match(after.git.diff, /\+two/);
});
test('evidence confinement rejects traversal and sensitive files', async t => {
  const dir = await temp(t); await writeFile(path.join(dir, '.env'), 'SECRET=1');
  await assert.rejects(() => confinedFile(dir, '../outside'));
  await assert.rejects(() => confinedFile(dir, '.env'));
});
test('declared evidence in a normally excluded directory still invalidates the fingerprint', async t => {
  const dir = await temp(t); await mkdir(path.join(dir, '.agent-progress')); await mkdir(path.join(dir, 'test-results'));
  await writeFile(path.join(dir, '.agent-progress/acceptance.json'), JSON.stringify({ version: 1, taskId: 'a', criteria: [{ id: 'a', title: 'Review log', files: ['test-results/build.log'], requiresHuman: true }] }));
  await writeFile(path.join(dir, 'test-results/build.log'), 'first'); const before = await sourceFingerprint(dir);
  await writeFile(path.join(dir, 'test-results/build.log'), 'changed'); const after = await sourceFingerprint(dir);
  assert.notEqual(before.hash, after.hash);
});
test('large skipped log ranges clear stale completion and usage', async t => {
  const dir = await temp(t), file = path.join(dir, 'abcdef12-abcd-4abc-8abc-abcdef123456.jsonl');
  await writeFile(file, line('session_meta', { id: 'abcdef12-abcd-4abc-8abc-abcdef123456', cwd: dir }) + line('event_msg', { type: 'task_complete', turn_id: 'old' }));
  const source = new LogSource(file, 'abcdef12-abcd-4abc-8abc-abcdef123456', 512, { canRead: () => true }); await source.poll(); assert.equal(source.state.phase, 'completed');
  await appendFile(file, line('ignored', { data: 'x'.repeat(2000) }) + line('event_msg', { type: 'agent_message', message: 'Tail only' }));
  await source.poll(); assert.equal(source.state.phase, 'unknown'); assert.equal(source.diagnostics.truncated, true);
});
test('Git diff and indexed paths omit sensitive files at every depth', async t => {
  const dir = await temp(t); await mkdir(path.join(dir, 'nested'));
  for (const file of ['auth.json', 'nested/.env', 'visible.txt']) await writeFile(path.join(dir, file), 'before');
  execFileSync('git', ['init', '-q', dir]); execFileSync('git', ['-C', dir, 'add', '.']);
  execFileSync('git', ['-C', dir, '-c', 'user.name=APS Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'fixture']);
  await writeFile(path.join(dir, 'auth.json'), 'sensitive-auth-value'); await writeFile(path.join(dir, 'nested/.env'), 'sensitive-env-value'); await writeFile(path.join(dir, 'visible.txt'), 'visible-change');
  const result = await collectEvidence(dir);
  assert.doesNotMatch(result.git.diff, /sensitive-/); assert.match(result.git.diff, /visible-change/);
  assert.deepEqual(result.git.files.map(f => f.path), ['visible.txt']);
});
