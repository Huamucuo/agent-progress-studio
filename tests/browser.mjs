import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApplication } from '../src/server.mjs';

const dir = await mkdtemp(path.join(tmpdir(), 'aps-browser-'));
const app = await createApplication({ port: 0, mode: 'demo', dataDir: dir, interval: 400 });
const browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { channel: 'msedge' } : {}) });
const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, acceptDownloads: true });
const page = await context.newPage(); const errors = [], outbound = [], results = [];
page.on('pageerror', e => errors.push(e.message));
page.on('request', req => { if (!req.url().startsWith(app.url)) outbound.push(req.url()); });
async function check(name, run) { await run(); results.push({ id: name, status: 'passed' }); console.log(`PASS ${name}`); }
try {
  await page.goto(app.url);
  await check('dashboard', async () => { await page.getByTestId('coverage-value').waitFor(); assert.equal(await page.getByTestId('coverage-value').innerText(), '33.3%'); });
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
  assert.deepEqual(errors, []); assert.deepEqual(outbound, []);
  await writeFile('test-results/browser-results.json', JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), tests: results, pageErrors: errors, externalRequests: outbound }, null, 2));
  console.log(`${results.length} browser flows passed; no page errors or external requests.`);
} finally { await browser.close(); await app.close(); await rm(dir, { recursive: true, force: true }); }
