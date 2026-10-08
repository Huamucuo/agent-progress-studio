import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, reduceEvent } from '../src/core/engine.mjs';
import { evaluateAcceptance, validateManifest } from '../src/core/acceptance.mjs';

const criterion = (id, extra = {}) => ({ id, title: id, weight: 1, ...extra });
const manifest = { version: 1, taskId: 'task', criteria: [criterion('a', { checks: ['a'] }), criterion('b', { checks: ['b'], requiresHuman: true }), criterion('c', { weight: 2 })] };
const evidence = { fingerprint: 'rev1', manifestHash: 'm1', files: [], report: { current: true, tests: [{ id: 'a', status: 'passed' }, { id: 'b', status: 'passed' }] } };

test('only met criteria contribute weighted progress; pending human review is distinct', () => {
  const r = evaluateAcceptance(manifest, evidence, {});
  assert.deepEqual(r.criteria.map(c => c.status), ['auto_verified', 'awaiting_human', 'unknown']);
  assert.equal(r.percent, 25);
  assert.equal(r.earnedWeight, 1);
  assert.equal(r.totalWeight, 4);
});
test('human decision is scoped to current evidence and definition', () => {
  const reviews = { b: { decision: 'accept', fingerprint: 'rev1', manifestHash: 'm1' } };
  assert.equal(evaluateAcceptance(manifest, evidence, reviews).percent, 50);
  assert.equal(evaluateAcceptance(manifest, { ...evidence, fingerprint: 'rev2' }, reviews).percent, 25);
  assert.equal(evaluateAcceptance(manifest, { ...evidence, manifestHash: 'm2' }, reviews).percent, 25);
});
test('failed tests dominate human acceptance and implementation', () => {
  const e = { ...evidence, report: { current: true, tests: [{ id: 'a', status: 'failed' }] } };
  assert.equal(evaluateAcceptance(manifest, e, { a: { decision: 'accept', fingerprint: 'rev1', manifestHash: 'm1' } }).criteria[0].status, 'failed');
});
test('stale reports and missing checks cannot verify implementation', () => {
  const m = { ...manifest, criteria: [criterion('a', { checks: ['a', 'absent'], files: ['app.js'] })] };
  assert.equal(evaluateAcceptance(m, { ...evidence, files: ['app.js'] }, {}).criteria[0].status, 'implemented');
  assert.equal(evaluateAcceptance(manifest, { ...evidence, report: { ...evidence.report, current: false } }, {}).percent, 0);
});
test('passing checks cannot bypass a declared missing implementation file', () => {
  const m = { ...manifest, criteria: [criterion('a', { checks: ['a'], files: ['missing.js'] })] };
  assert.equal(evaluateAcceptance(m, evidence, {}).criteria[0].status, 'unknown');
});
test('no criteria means unknown progress, not zero or tool-based progress', () => {
  assert.equal(evaluateAcceptance(null, {}, {}).percent, null);
  let s = createState('x');
  for (let n = 0; n < 100; n++) s = reduceEvent(s, { id: String(n), kind: 'tool', name: 'shell', toolId: String(n), status: 'completed' });
  assert.equal(s.progress, undefined);
  assert.equal(s.plan.length, 0);
});
test('manifest rejects duplicated IDs, invalid weights and traversal paths', () => {
  assert.throws(() => validateManifest({ ...manifest, criteria: [criterion('a'), criterion('a')] }));
  assert.throws(() => validateManifest({ ...manifest, criteria: [criterion('a', { weight: 0 })] }));
  assert.throws(() => validateManifest({ ...manifest, criteria: [criterion('a', { files: ['../secret'] })] }));
});
test('metrics preserve unknown and use last request rather than lifetime total for context', () => {
  let s = createState('x');
  assert.equal(s.usage.total, null);
  s = reduceEvent(s, { id: 'u', kind: 'usage', total: 500000, last: 42000, contextWindow: 128000 });
  assert.equal(s.usage.last, 42000);
  assert.equal(s.usage.total, 500000);
  assert.equal(s.usage.contextWindow, 128000);
});
test('event IDs are deduplicated and a new turn clears transient tool and plan state', () => {
  let s = createState('x');
  s = reduceEvent(s, { id: 'p', kind: 'plan', plan: [{ step: 'test', status: 'completed' }] });
  s = reduceEvent(s, { id: 't', kind: 'tool', toolId: 't', name: 'exec', status: 'inProgress' });
  s = reduceEvent(s, { id: 't', kind: 'tool', toolId: 't', name: 'exec', status: 'inProgress' });
  assert.equal(s.events.length, 2);
  s = reduceEvent(s, { id: 'start', kind: 'turn', status: 'inProgress', turnId: 'next' });
  assert.equal(s.tools.length, 0);
  assert.equal(s.plan.length, 0);
});
