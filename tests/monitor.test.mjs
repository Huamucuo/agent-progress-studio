import test from 'node:test';
import assert from 'node:assert/strict';
import * as engine from '../src/core/engine.mjs';

const now = Date.parse('2026-10-09T00:00:30.000Z');
const event = (kind, extra = {}) => ({ id: 'event', kind, at: '2026-10-09T00:00:29.000Z', ...extra });
const observe = (events, options = {}) => engine.monitorTask?.(events.reduce(engine.reduceEvent, engine.createState('s')), { now, connected: true, ...options });

test('overall completion stays unknown even when plan and acceptance reach 100 percent', () => {
  const state = engine.reduceEvent(engine.createState('s'), event('plan', { plan: [{ step: 'done', status: 'completed' }] }));
  assert.deepEqual(engine.progressSummary?.(state, { percent: 100, met: 2, total: 2 }), {
    overall: { percent: null }, plan: { completed: 1, total: 1, inProgress: 0, pending: 0, unknown: 0, percent: 100 },
    acceptance: { percent: 100, met: 2, total: 2 }
  });
});
test('plan step counts and acceptance use separate denominators and preserve absent data', () => {
  const state = engine.reduceEvent(engine.createState('s'), event('plan', { plan: [{ step: 'a', status: 'completed' }, { step: 'b', status: 'pending' }] }));
  const progress = engine.progressSummary?.(state, { percent: 25, met: 1, total: 3 });
  assert.equal(progress?.plan.percent, 50); assert.equal(progress.acceptance.percent, 25); assert.equal(progress.overall.percent, null);
  assert.equal(engine.progressSummary(engine.createState(), { percent: null, met: 0, total: 0 }).plan.percent, null);
});
test('tool start is an observation with a timestamp, and expires without claiming a heartbeat', () => {
  const start = event('hook', { name: 'PreToolUse', metadata: { tool_name: 'Bash', tool_status: 'started' } });
  const fresh = observe([start]);
  assert.equal(fresh?.status, 'tool_running'); assert.equal(fresh.toolName, 'Bash'); assert.equal(fresh.at, start.at);
  assert.equal(observe([start], { now: now + 31000 }).status, 'no_recent_evidence');
  assert.equal(observe([start], { connected: false }).status, 'source_unavailable');
});
test('PostToolUse never implies success and Stop never implies overall completion', () => {
  const post = event('hook', { name: 'PostToolUse', metadata: { tool_name: 'Bash', tool_status: 'unknown' } });
  assert.equal(observe([post])?.status, 'tool_finished'); assert.equal(observe([post]).outcome, 'unknown');
  assert.equal(observe([{ ...post, metadata: { tool_name: 'Bash', tool_status: 'failed' } }]).status, 'tool_failed');
  const stop = event('hook', { id: 'stop', name: 'Stop' });
  assert.equal(observe([post, stop]).status, 'turn_stopped');
  assert.equal(observe([post, stop], { now: now + 60000 }).status, 'turn_stopped');
});
test('tool observations do not pair concurrent Hooks without a call ID or carry old tools into a new turn', () => {
  const hooks = [event('hook', { id: 'a', name: 'PreToolUse', metadata: { tool_name: 'Bash', tool_status: 'started', turn_id: 'one' } }),
    event('hook', { id: 'b', name: 'PreToolUse', metadata: { tool_name: 'Bash', tool_status: 'started', turn_id: 'one' } }),
    event('hook', { id: 'c', name: 'PostToolUse', metadata: { tool_name: 'Bash', tool_status: 'unknown', turn_id: 'one' } })];
  assert.equal(observe(hooks)?.status, 'tool_finished');
  const prompt = event('hook', { id: 'd', name: 'UserPromptSubmit', metadata: { turn_id: 'two' } });
  assert.equal(observe([...hooks, prompt]).toolName, null);
  assert.equal(observe([...hooks, prompt]).status, 'prompt_received');
});
test('Codex tool output retains the call name and a completed turn clears running state', () => {
  const call = event('tool', { toolId: 'call', name: 'exec_command', status: 'inProgress' });
  const out = event('tool', { id: 'out', toolId: 'call', status: 'completed', exitCode: 0 });
  assert.equal(observe([call, out])?.toolName, 'exec_command');
  assert.equal(observe([call, out]).outcome, 'succeeded');
  assert.equal(observe([call, event('turn', { id: 'done', status: 'completed' })]).status, 'turn_completed');
});
test('demo review phase and timestamp-free app-server terminal state remain represented', () => {
  assert.equal(observe([event('phase', { phase: 'reviewing' })], { mode: 'demo' }).status, 'reviewing');
  const state = { ...engine.createState('rpc'), phase: 'completed', events: [event('tool', { at: null, status: 'completed', name: 'shell' })] };
  const result = engine.monitorTask(state, { mode: 'app-server', now });
  assert.equal(result.status, 'turn_completed'); assert.equal(result.at, null);
});
