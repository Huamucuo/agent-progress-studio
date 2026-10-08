import { createState, reduceEvent } from '../core/engine.mjs';
export const demoManifest = {
  version: 1, taskId: 'demo-session', title: 'A trustworthy local progress dashboard',
  criteria: [
    { id: 'discovery', title: '只读发现本地会话', titleEn: 'Discover local sessions without mutation', files: ['src/adapters/codex-log.mjs'], checks: ['discovery'] },
    { id: 'honesty', title: '进度由验收条件计算', titleEn: 'Calculate progress from acceptance criteria', files: ['src/core/acceptance.mjs'], checks: ['honesty'] },
    { id: 'review', title: '人工确认界面与交互', titleEn: 'Review the interface and interactions', files: ['public/app.mjs'], checks: ['review'], requiresHuman: true },
    { id: 'export', title: '导出可复查的验收报告', titleEn: 'Export a reviewable acceptance report', files: ['src/service.mjs'], checks: ['export'] },
    { id: 'reconnect', title: '断线后恢复事件流', titleEn: 'Recover the event stream after disconnect', files: ['src/server.mjs'], checks: ['reconnect'] },
    { id: 'compatibility', title: '旧版 Codex 兼容性', titleEn: 'Compatibility with older Codex versions', checks: ['compatibility'] }
  ]
};
const events = [
  { kind: 'task', title: '构建可信的本地 Agent 仪表盘', titleEn: 'Build a trustworthy local agent dashboard', cwd: 'C:\\Projects\\agent-progress-studio', model: 'Demo model (simulated)' },
  { kind: 'turn', turnId: 'demo-turn', status: 'inProgress' },
  { kind: 'plan', plan: [{ step: '研究真实接口 / Research integration boundaries', status: 'completed' }, { step: '实现采集与状态引擎 / Build collectors & state engine', status: 'completed' }, { step: '验证交互与断线恢复 / Verify interactions & recovery', status: 'inProgress' }, { step: '人工验收与交付 / Human review & release', status: 'pending' }] },
  { kind: 'tool', toolId: 'demo-read', name: 'read_file', status: 'completed', text: 'Read adapter contract. No credentials accessed.' },
  { kind: 'tool', toolId: 'demo-tests', name: 'run_tests', status: 'inProgress', text: 'node --test tests/*.test.mjs' },
  { kind: 'usage', total: 38420, input: 31200, cached: 18000, output: 7220, last: 14500, contextWindow: 128000 },
  { kind: 'tool', toolId: 'demo-tests', name: 'run_tests', status: 'failed', exitCode: 1, text: 'PASS discovery\nPASS honesty\nPASS review\nFAIL reconnect: expected replay after disconnect\nExport: not yet tested\nAll values are simulated.' },
  { kind: 'message', text: '核心逻辑已实现。断线恢复测试失败，界面交互等待人工验收。 / Core logic implemented; recovery test failed; interface awaiting human review.' },
  { kind: 'phase', phase: 'reviewing' }
];
export class DemoSource {
  constructor(scenario = 'showcase') { this.scenario = scenario; this.index = scenario === 'no-plan' ? 2 : events.length; this.playing = false; this.rebuild(); }
  rebuild() {
    this.state = createState(`demo-${this.scenario}`);
    const rows = this.scenario === 'no-plan' ? [events[0], events[1]] : events;
    for (let i = 0; i < Math.min(this.index, rows.length); i++) this.state = reduceEvent(this.state, { ...rows[i], id: `demo:${i}`, at: new Date(Date.UTC(2026, 9, 9, 2, 0, i * 5)).toISOString(), source: 'demo' });
    this.state.titleEn = events[0].titleEn;
    if (this.scenario === 'no-plan') this.state.phase = 'executing';
  }
  control(action) {
    if (action === 'restart') { this.index = 0; this.playing = true; }
    else if (action === 'play') { if (this.index >= events.length) this.index = 0; this.playing = true; }
    else if (action === 'pause') this.playing = false;
    else if (action === 'step') { this.playing = false; this.index = Math.min(events.length, this.index + 1); }
    else if (action === 'finish') { this.playing = false; this.index = events.length; }
    else throw new Error('Unknown replay action');
    this.rebuild();
  }
  async poll() { if (this.playing) { this.index++; if (this.index >= events.length) this.playing = false; this.rebuild(); } return this.state; }
  evidence() {
    if (this.scenario === 'no-plan') return { manifest: null, files: [], report: null, git: { available: false, files: [], commits: [], diff: '' }, fingerprint: 'no-plan', errors: [] };
    const ready = this.index >= 7;
    return { manifest: demoManifest, manifestHash: 'demo-v1', fingerprint: `demo-v1:${ready}`, files: this.index >= 4 ? demoManifest.criteria.flatMap(c => c.files || []) : [],
      report: ready ? { current: true, generatedAt: '2026-10-09T02:00:30.000Z', tests: [{ id: 'discovery', status: 'passed' }, { id: 'honesty', status: 'passed' }, { id: 'review', status: 'passed' }, { id: 'reconnect', status: 'failed', detail: 'Expected reconnect replay; received no snapshot.' }], detail: 'SIMULATED fixture. 3 passed, 1 failed. Export and compatibility have no test results.' } : null,
      git: { available: true, branch: 'feature/evidence-dashboard', files: [{ status: ' M', path: 'src/core/acceptance.mjs' }, { status: '??', path: 'public/app.mjs' }],
        commits: [{ hash: '0'.repeat(40), at: '2026-10-09T01:59:00Z', title: '[SIMULATED] Define evidence-based acceptance' }],
        diff: 'SIMULATED — not your repository\n--- a/src/core/acceptance.mjs\n+++ b/src/core/acceptance.mjs\n+const earned = criteria.filter(isAccepted);\n+const coverage = earnedWeight / totalWeight;\n' }, errors: [] };
  }
  close() {}
}
