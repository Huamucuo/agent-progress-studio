import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApplication } from '../src/server.mjs';

const dir = await mkdtemp(path.join(tmpdir(), 'aps-browser-'));
const app = await createApplication({ port: 0, mode: 'demo', dataDir: dir, codexHome: path.join(dir, 'codex'), interval: 400 });
const browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { channel: 'msedge' } : {}) });
const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, acceptDownloads: true });
const page = await context.newPage(); const errors = [], outbound = [], results = [];
page.on('pageerror', e => errors.push(e.message));
page.on('request', req => { if (!req.url().startsWith(app.url)) outbound.push(req.url()); });
async function check(name, run) { await run(); results.push({ id: name, status: 'passed' }); console.log(`PASS ${name}`); }
try {
  await page.goto(app.url);
  await check('dashboard', async () => { await page.getByTestId('coverage-value').waitFor(); assert.equal(await page.getByTestId('coverage-value').innerText(), '33.3%'); });
  await check('monitor-first-and-three-distinct-progress-measures', async () => {
    await page.getByTestId('monitor-status').waitFor();
    assert.equal(await page.getByTestId('overall-progress').innerText(), '未知');
    assert.match(await page.getByTestId('plan-progress').innerText(), /\d+ \/ \d+/);
    assert.equal(await page.getByTestId('coverage-value').innerText(), '33.3%');
    const monitor = await page.getByTestId('monitor-status').boundingBox(), acceptance = await page.getByTestId('coverage-value').boundingBox();
    assert.ok(monitor.y < acceptance.y);
  });
  await check('language-theme-persistence', async () => {
    await page.getByTestId('language-toggle').click(); await page.getByRole('heading', { name: 'Run overview', exact: true }).waitFor();
    await page.getByTestId('theme-toggle').click(); await page.reload();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  });
  await check('evidence-details', async () => {
    await page.getByTestId('nav-evidence').click(); await page.getByTestId('open-diff').click();
    assert.match(await page.getByRole('dialog').innerText(), /SIMULATED/); await page.getByTestId('dialog-close').click();
  });
  await check('human-review-and-reload', async () => {
    await page.getByTestId('nav-acceptance').click(); await page.getByTestId('criterion-review').click();
    await page.getByTestId('review-note').fill('Reviewed UI fixture in browser test.'); await page.getByTestId('review-accept').click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' }); await page.reload();
    await page.getByTestId('criterion-review').waitFor(); assert.match(await page.getByTestId('criterion-review').innerText(), /Accepted/);
  });
  await check('report-export', async () => {
    const downloadPromise = page.waitForEvent('download'); await page.getByTestId('export').click(); const download = await downloadPromise;
    await download.saveAs(path.join(dir, 'report.json')); const { readFile } = await import('node:fs/promises'); const report = JSON.parse(await readFile(path.join(dir, 'report.json'), 'utf8'));
    assert.equal(report.acceptance.percent, 50); assert.equal(report.source.mode, 'demo');
  });
  await check('no-plan-no-fake-progress', async () => {
    await page.getByTestId('nav-connection').click(); await page.getByTestId('demo-no-plan').click(); await page.getByTestId('nav-overview').click();
    await page.getByTestId('coverage-value').waitFor(); assert.equal(await page.getByTestId('coverage-value').innerText(), '—');
    assert.match(await page.locator('main').innerText(), /No reported plan/);
  });
  await check('replay-and-responsive-layout', async () => {
    await page.getByTestId('nav-connection').click(); await page.getByTestId('demo-showcase').click(); await page.getByTestId('nav-overview').click();
    await page.getByTestId('replay-restart').click(); await page.getByTestId('replay-pause').click(); await page.getByTestId('replay-finish').click();
    await page.getByTestId('theme-toggle').click(); await page.getByTestId('language-toggle').click();
    await mkdir('test-results', { recursive: true }); await page.screenshot({ path: 'test-results/dashboard-dark-zh.png', fullPage: true });
    await page.getByTestId('theme-toggle').click(); await page.getByTestId('language-toggle').click();
    await page.screenshot({ path: 'test-results/dashboard-light-en.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: 'test-results/dashboard-mobile.png', fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.getByTestId('nav-acceptance').click(); await page.getByTestId('criterion-review').click();
    const bounds = await page.getByTestId('review-accept').boundingBox(); assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 844);
    await page.getByTestId('dialog-close').click();
  });
  await check('hooks-empty-is-not-connected', async () => {
    await page.setViewportSize({ width: 1440, height: 1050 });
    await page.getByTestId('nav-connection').click(); await page.getByTestId('connect-hooks').click();
    await page.getByText('Waiting for real Hook events', { exact: true }).waitFor();
    await page.getByTestId('nav-overview').click();
    assert.equal(await page.getByTestId('coverage-value').innerText(), '—');
  });
  await check('hooks-live-discovery-selection-and-attribution', async () => {
    // Isolated browser fixtures: never written into a user's live Hook spool.
    const eventsDir = path.join(dir, 'work-hooks/events'), id = 'browser-fixture-session';
    await mkdir(eventsDir, { recursive: true });
    const writeEvent = (index, sessionId, eventType) => writeFile(path.join(eventsDir, `1791494400000-00000000-0000-4000-8000-${String(index).padStart(12, '0')}.json`), JSON.stringify({ event_type: eventType, session_id: sessionId, turn_id: 'browser-fixture-turn', timestamp: new Date().toISOString() }));
    await page.getByTestId('nav-connection').click();
    await writeEvent(1, id, 'UserPromptSubmit'); await page.getByTestId(`session-${id}`).waitFor();
    await page.getByTestId('origin-work-local').click();
    await page.getByTestId('hook-origin').getByText('Work locally · user confirmed', { exact: true }).waitFor();
    await page.locator('#endpoint').fill('ws://127.0.0.1:4501');
    await writeEvent(2, 'second-fixture-session', 'SessionStart');
    await page.locator('#endpoint').blur(); await page.getByTestId('session-second-fixture-session').waitFor();
    assert.equal(await page.getByTestId('selected-hook-session').innerText(), id);
    await page.getByTestId('nav-events').click();
    await writeEvent(3, id, 'Stop'); await page.getByTestId('hook-Stop').waitFor();
    await page.getByTestId('hook-Stop').click();
    assert.match(await page.getByRole('dialog').innerText(), /"turn_id": "browser-fixture-turn"/);
    await page.getByTestId('dialog-close').click();
    await page.getByTestId('nav-overview').click();
    assert.equal(await page.getByTestId('coverage-value').innerText(), '—');
    await page.reload(); await page.getByTestId('nav-connection').click();
    await page.getByTestId('hook-origin').getByText('Work locally · user confirmed', { exact: true }).waitFor();
    await page.screenshot({ path: 'test-results/hooks-fixture-light-en.png', fullPage: true });
    await page.getByTestId('nav-connection').click(); await page.getByTestId('demo-showcase').click();
    await page.getByTestId('nav-overview').click();
    assert.match(await page.locator('main').innerText(), /Demo workspace/);
  });
  await check('home-observes-tool-name-and-unknown-result-without-private-content', async () => {
    await page.getByTestId('monitor-source').selectOption('work-hooks');
    await page.getByTestId('monitor-session').selectOption('browser-fixture-session');
    const payload = { event_type: 'PreToolUse', session_id: 'browser-fixture-session', turn_id: 'next-turn', timestamp: new Date().toISOString(), tool_name: 'Bash', tool_status: 'started' };
    const file = path.join(dir, 'work-hooks/events/1791494400001-00000000-0000-4000-8000-000000000004.json');
    await writeFile(file, JSON.stringify(payload));
    await page.getByTestId('monitor-status').filter({ hasText: 'Tool start observed' }).waitFor();
    assert.match(await page.getByTestId('monitor-activity').innerText(), /Bash/);
    await writeFile(file.replace('000000000004', '000000000005'), JSON.stringify({ ...payload, event_type: 'PostToolUse', timestamp: new Date().toISOString(), tool_status: 'unknown' }));
    await page.getByTestId('monitor-status').filter({ hasText: 'Tool output observed' }).waitFor();
    assert.match(await page.getByTestId('monitor-activity').innerText(), /Unknown/);
    assert.equal(await page.getByTestId('overall-progress').innerText(), 'Unknown');
  });
  await check('home-discovers-new-Codex-tasks-and-streams-selected-log-without-reload', async () => {
    await page.getByTestId('monitor-source').selectOption('local');
    const logDir = path.join(dir, 'codex/sessions'); await mkdir(logDir, { recursive: true });
    const row = (type, payload) => JSON.stringify({ type, payload, timestamp: new Date().toISOString() }) + '\n';
    await writeFile(path.join(logDir, 'abcdef12-abcd-4abc-8abc-abcdef123456.jsonl'), row('session_meta', { id: 'abcdef12-abcd-4abc-8abc-abcdef123456', cwd: dir }));
    await page.getByTestId('monitor-session').locator('option[value="abcdef12-abcd-4abc-8abc-abcdef123456"]').waitFor({ state: 'attached' });
    await writeFile(path.join(logDir, 'feedbeef-abcd-4abc-8abc-abcdef123456.jsonl'), row('session_meta', { id: 'feedbeef-abcd-4abc-8abc-abcdef123456', cwd: dir }));
    await page.getByTestId('monitor-session').locator('option[value="feedbeef-abcd-4abc-8abc-abcdef123456"]').waitFor({ state: 'attached' });
    assert.equal(await page.getByTestId('monitor-session').inputValue(), 'abcdef12-abcd-4abc-8abc-abcdef123456');
    await page.getByTestId('monitor-session').selectOption('feedbeef-abcd-4abc-8abc-abcdef123456');
    await page.getByTestId('allow-content-access').click();
    await page.getByTestId('confirm-content-access').click();
    await appendFile(path.join(logDir, 'feedbeef-abcd-4abc-8abc-abcdef123456.jsonl'), row('event_msg', { type: 'user_message', message: 'New selected Codex task' }) + row('event_msg', { type: 'task_started', turn_id: 'codex-turn' }));
    await page.getByRole('heading', { name: 'New selected Codex task', exact: true }).waitFor();
    await page.getByTestId('monitor-status').filter({ hasText: 'Turn execution observed' }).waitFor();
    assert.equal(await page.getByTestId('overall-progress').innerText(), 'Unknown');
  });
  await check('content-revocation-clears-monitor-and-export-and-survives-reload', async () => {
    await page.getByTestId('revoke-content-access').click();
    await page.getByTestId('allow-content-access').waitFor();
    assert.doesNotMatch(await page.locator('main').innerText(), /New selected Codex task/);
    const report = await (await page.request.get(app.url + '/api/export')).json();
    assert.equal(report.task.title, ''); assert.equal(report.workspace, null);
    await page.reload(); await page.getByTestId('allow-content-access').waitFor();
    await page.screenshot({ path: 'test-results/content-permission-light-en.png', fullPage: true });
  });
  await check('manual-discovery-from-demo-remains-usable', async () => {
    await page.getByTestId('monitor-source').selectOption('demo');
    await page.getByTestId('nav-connection').click();
    await page.getByRole('button', { name: 'Discover sessions', exact: true }).first().click();
    await page.getByTestId('session-feedbeef-abcd-4abc-8abc-abcdef123456').waitFor();
  });
  await check('delayed-evidence-response-cannot-reopen-an-old-source-dialog', async () => {
    let captured, release, fulfilled;
    const ready = new Promise(resolve => { captured = resolve; }), delivery = new Promise(resolve => { release = resolve; }), done = new Promise(resolve => { fulfilled = resolve; });
    await page.route('**/api/evidence?*', async route => {
      const response = await route.fetch(); captured(); await delivery; await route.fulfill({ response }); fulfilled();
    });
    await page.getByTestId('nav-evidence').click(); await page.getByTestId('open-diff').click(); await ready;
    const { token } = await (await page.request.get(app.url + '/api/bootstrap')).json();
    await page.request.post(app.url + '/api/source', { headers: { 'X-APS-Token': token }, data: { mode: 'local' } });
    await page.getByTestId('nav-overview').click();
    await page.waitForFunction(() => document.querySelector('#monitor-source')?.value === 'local');
    release(); await done; await page.waitForTimeout(250);
    assert.equal(await page.getByRole('dialog').count(), 0); await page.unroute('**/api/evidence?*');
  });
  await check('scope-change-clears-a-focused-evidence-dialog', async () => {
    await page.getByTestId('monitor-source').selectOption('demo');
    await page.getByTestId('nav-acceptance').click(); await page.getByTestId('criterion-review').click();
    await page.getByTestId('review-note').fill('Focused review must close when its source loses scope');
    const { token } = await (await page.request.get(app.url + '/api/bootstrap')).json();
    const changed = await page.request.post(app.url + '/api/source', { headers: { 'X-APS-Token': token }, data: { mode: 'local' } });
    assert.equal(changed.status(), 200);
    await page.getByRole('dialog').waitFor({ state: 'hidden', timeout: 3000 });
  });
  await check('browser-expires-cached-running-state-and-exposes-feed-loss', async () => {
    await page.getByTestId('nav-overview').click(); await page.getByTestId('monitor-source').selectOption('work-hooks');
    await page.getByTestId('monitor-session').selectOption('browser-fixture-session');
    await writeFile(path.join(dir, 'work-hooks/events/1791494400001-00000000-0000-4000-8000-000000000006.json'), JSON.stringify({ event_type: 'PreToolUse', session_id: 'browser-fixture-session', turn_id: 'next-turn', timestamp: new Date().toISOString(), tool_name: 'Bash', tool_status: 'started' }));
    await page.getByTestId('monitor-status').filter({ hasText: 'Tool start observed' }).waitFor();
    // Keep the feed open but stop snapshots; expiry must use the browser's clock,
    // including when a selector keeps focus. No virtual timers or fake host events.
    await page.getByTestId('monitor-session').focus();
    app.service.removeAllListeners('snapshot');
    await page.getByTestId('monitor-status').filter({ hasText: 'Current activity unknown' }).waitFor({ timeout: 40000 });
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'monitor-session');
    await app.close();
    await page.getByTestId('monitor-status').filter({ hasText: 'Live updates disconnected' }).waitFor();
  });
  assert.deepEqual(errors, []); assert.deepEqual(outbound, []);
  await writeFile('test-results/browser-results.json', JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), tests: results, pageErrors: errors, externalRequests: outbound }, null, 2));
  console.log(`${results.length} browser flows passed; no page errors or external requests.`);
} finally { await browser.close(); await app.close(); await rm(dir, { recursive: true, force: true }); }
