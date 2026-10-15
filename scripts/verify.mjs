import { spawn } from 'node:child_process';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { sourceFingerprint } from '../src/collectors/evidence.mjs';
import { SessionAccess, sessionRef } from '../src/core/session-access.mjs';
import { ResourceRegistry } from '../src/core/resource-registry.mjs';
import { DataGateway } from '../src/collectors/data-gateway.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
// Explicit invocation of this CLI authorizes this repository only. It cannot
// fingerprint another directory, a session store, or a manifest-selected root.
const authority = new SessionAccess(), registry = new ResourceRegistry(), canonical = await registry.workspace(root), ref = sessionRef('cli:' + canonical, 'verify');
await authority.change(ref, { evidence: true, root: canonical }, authority.revision);
const context = await new DataGateway(authority, registry).evidence(ref, canonical), options = { context };
const before = await sourceFingerprint(root, options);
const jobs = [
  ['pet-boundaries', ['--test','tests/pet-assets.test.mjs','tests/pet-activity.test.mjs','tests/pet-renderer.test.mjs','tests/pet-controller.test.mjs','tests/pet-state.test.mjs','tests/pet-host.test.mjs','tests/pet-window-state.test.mjs','tests/pet-progression.test.mjs','tests/pet-pack.test.mjs','tests/managed-spool.test.mjs','tests/hook-status-contract.test.mjs','tests/async-test-wait.test.mjs']],
  ['desktop-boundaries', ['--test','tests/desktop-host.test.mjs','tests/desktop-hooks.test.mjs','tests/desktop-ingress.test.mjs']],
  ['desktop-floating-boundaries', ['--test','tests/floating-state.test.mjs','tests/monitor-model.test.mjs','tests/sidebar-chat.test.mjs','tests/ipc-policy.test.mjs','tests/notices.test.mjs','tests/maintenance.test.mjs','tests/reply-authority.test.mjs','tests/reply.test.mjs','tests/local-rpc.test.mjs','tests/background-status.test.mjs','tests/power.test.mjs','tests/power-manager.test.mjs','tests/hook-directory.test.mjs']],
  ['authority', ['--test', 'tests/authority.test.mjs']],
  ['public-preview-boundaries', ['--test', 'tests/public-boundaries.test.mjs', 'tests/public-boundary-alternates.test.mjs']],
  ['boundary', ['--test', 'tests/resource-boundary.test.mjs']],
  ['publication', ['--test', 'tests/publication.test.mjs']],
  ['baseline-regression', ['--test', 'tests/rc4-baseline.test.mjs']],
  ['http-ordering', ['--test', 'tests/http-ordering.test.mjs']],
  ['version-boundary', ['--test', 'tests/version-boundary.test.mjs']],
  ['privacy', ['--test', 'tests/privacy.test.mjs']],
  ['engine', ['--test', 'tests/core.test.mjs']],
  ['monitor', ['--test', 'tests/monitor.test.mjs']],
  ['collectors', ['--test', 'tests/collectors.test.mjs']],
  ['protocol', ['--test', 'tests/app-server.test.mjs']],
  ['service', ['--test', 'tests/server.test.mjs']],
  ['work-hooks', ['--test', 'tests/work-hooks.test.mjs']]
];
if (process.argv.includes('--browser')) jobs.push(['browser', ['tests/browser.mjs']], ['browser-privacy', ['tests/browser-privacy.mjs']]);
const tests = [], startedAt = new Date().toISOString(); let detail = '';
for (const [id, args] of jobs) {
  let output = '';
  const exitCode = await new Promise(resolve => {
    const child = spawn(process.execPath, args, { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const collect = chunk => { output = (output + chunk.toString()).slice(-50000); };
    child.stdout.on('data', collect); child.stderr.on('data', collect); child.on('error', e => { output += e.message; resolve(-1); }); child.on('close', code => resolve(code));
  });
  const status = exitCode === 0 ? 'passed' : 'failed'; tests.push({ id, status, exitCode, command: [process.execPath, ...args] });
  detail += `\n[${id}] ${status}\n${output}`; console.log(`${id}: ${status}`);
}
const after = await sourceFingerprint(root, options), stable = before.hash && before.hash === after.hash;
await mkdir(path.join(root, '.agent-progress'), { recursive: true });
const report = { version: 1, generatedAt: new Date().toISOString(), startedAt, sourceFingerprint: stable ? after.hash : null, stableSource: !!stable,
  runner: 'APS verify (local Node process exit results)', tests, detail: detail.slice(-180000) };
await writeFile(path.join(root, '.agent-progress/results.tmp'), JSON.stringify(report, null, 2));
await rename(path.join(root, '.agent-progress/results.tmp'), path.join(root, '.agent-progress/results.json'));
if (!stable) console.error('Source changed or exceeded fingerprint limits while tests ran; report is not current.');
console.log('Report: .agent-progress/results.json');
if (!stable || tests.some(t => t.status !== 'passed')) process.exitCode = 1;
