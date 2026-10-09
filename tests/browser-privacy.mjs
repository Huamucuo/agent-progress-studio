import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mock } from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createApplication } from '../src/server.mjs';
import { fakeRpc } from './rpc-fixture.mjs';
const id = 'abcdef12-abcd-4abc-8abc-abcdef123456', sentinel = 'SYNTHETIC_RC4_PRIVATE_TASK';
const root = await fs.mkdtemp(path.join(tmpdir(), 'aps-edge-privacy-'));
const options = { port: 0, mode: 'local', codexHome: root + '/codex', dataDir: root + '/data', interval: 200 };
await fs.mkdir(options.codexHome + '/sessions', { recursive: true });
await fs.writeFile(options.codexHome + '/sessions/' + id + '.jsonl', [
  { type: 'session_meta', payload: { id, cwd: root + '/project' } },
  { type: 'event_msg', payload: { type: 'user_message', message: sentinel } },
  { type: 'response_item', payload: { type: 'function_call', name: 'update_plan', arguments: JSON.stringify({ plan: [{ step: 'PRIVATE_PLAN', status: 'in_progress' }] }) } }
].map(x => JSON.stringify(x) + '\n').join(''));
let app = await createApplication(options);
const browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { channel: 'msedge' } : {}) });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
await context.addInitScript(() => {
  // Hold actual production SSE callbacks from the real local HTTP service.
  const original = EventSource.prototype.addEventListener;
  window.__apsTest = { hold: false, frames: [] };
  EventSource.prototype.addEventListener = function (type, listener, opts) {
    if (type !== 'snapshot') return original.call(this, type, listener, opts);
    return original.call(this, type, event => {
      if (window.__apsTest.hold && event.data.includes('SYNTHETIC_RC4_PRIVATE_TASK')) { window.__apsTest.frames.push(() => listener.call(this, event)); return; }
      listener.call(this, event);
    }, opts);
  };
});
const page = await context.newPage(), second = await context.newPage(), errors = [], network = [], results = [];
for (const p of [page, second]) { p.on('pageerror', e => errors.push(e.message)); p.on('request', r => network.push({ method: r.method(), url: r.url() })); }
const check = async (name, action) => { await action(); results.push({ name, passed: true }); console.log('PASS ' + name); };
const ready = p => p.getByTestId('monitor-session').waitFor();
const grant = async () => { await app.service.sessionAccess({ sessionId: id, decision: 'allow-codex' }); };
const deny = async () => { await app.service.sessionAccess({ sessionId: id, decision: 'revoke' }); };
try {
  await grant(); await page.goto(app.url); await second.goto(app.url); await ready(page); await ready(second);
  await check('O01 two Edge tabs: old SSE delivered after revoke and regrant never restores old epoch', async () => {
    await page.evaluate(() => { window.__apsTest.hold = true; }); await page.waitForFunction(() => window.__apsTest.frames.length > 0);
    const started = performance.now(); await deny();
    await second.getByTestId('allow-content-access').waitFor();
    await page.getByTestId('allow-content-access').waitFor(); const delay = performance.now() - started;
    assert.doesNotMatch(await page.locator('#app').innerText(), /SYNTHETIC_RC4_PRIVATE_TASK|PRIVATE_PLAN/);
    assert.doesNotMatch(JSON.stringify(await (await page.request.get(app.url + '/api/export')).json()), /SYNTHETIC_RC4_PRIVATE_TASK|PRIVATE_PLAN/);
    const log = options.codexHome + '/sessions/' + id + '.jsonl';
    await fs.writeFile(log, (await fs.readFile(log, 'utf8')).replace(sentinel, 'CURRENT_REGRANT_TASK').replace('PRIVATE_PLAN', 'CURRENT_REGRANT_PLAN'));
    await grant(); await page.getByTestId('revoke-content-access').waitFor();
    await page.getByText('CURRENT_REGRANT_PLAN', { exact: true }).waitFor();
    await page.evaluate(() => { window.__apsTest.hold = false; window.__apsTest.frames.splice(0).forEach(f => f()); });
    assert.doesNotMatch(await page.locator('#app').innerText(), /SYNTHETIC_RC4_PRIVATE_TASK|PRIVATE_PLAN/);
    assert.match(await page.locator('#app').innerText(), /CURRENT_REGRANT_PLAN/);
    results.push({ metric: 'twoTabsRevokeObservedMs', value: delay, synthetic: true });
  });
  await check('O02 delayed authorized export cannot download after revocation', async () => {
    let release, captured; const waiting = new Promise(r => { captured = r; }), gate = new Promise(r => { release = r; }); let downloads = 0;
    const listener = () => downloads++; page.on('download', listener);
    await page.route('**/api/export', async route => { const response = await route.fetch(); captured(); await gate; await route.fulfill({ response }); });
    await page.getByTestId('export').click(); await waiting; await deny(); await page.getByTestId('allow-content-access').waitFor(); release(); await page.waitForTimeout(250);
    assert.equal(downloads, 0); page.off('download', listener); await page.unroute('**/api/export');
  });
  await check('T-03 final browser consumption cannot cross an asynchronous authority invalidation', async () => {
    await grant(); await page.getByTestId('revoke-content-access').waitFor();
    await page.evaluate(async () => {
      const { StateReceiver } = await import('/state-receiver.mjs'), accept = StateReceiver.prototype.accept, click = HTMLAnchorElement.prototype.click;
      let triggered = false; window.__applyTrace = { invalidated: false, clicks: [] };
      StateReceiver.prototype.accept = function (value, ticket) {
        const allowed = accept.call(this, value, ticket);
        if (allowed && ticket.kind === 'export' && !triggered) {
          triggered = true; queueMicrotask(() => { window.__applyTrace.invalidated = true; window.dispatchEvent(new Event('offline')); });
        }
        return allowed;
      };
      HTMLAnchorElement.prototype.click = function () { if (this.download) window.__applyTrace.clicks.push(window.__applyTrace.invalidated); return click.call(this); };
      window.__restoreApply = () => { StateReceiver.prototype.accept = accept; HTMLAnchorElement.prototype.click = click; };
    });
    await page.getByTestId('export').click(); await page.waitForFunction(() => window.__applyTrace.invalidated);
    const trace = await page.evaluate(() => window.__applyTrace); assert.deepEqual(trace.clicks, [false], 'Valid export completes before invalidation, never after it');
    await page.evaluate(() => { window.__restoreApply(); window.dispatchEvent(new Event('online')); }); await page.getByTestId('revoke-content-access').waitFor();
    await deny(); await page.getByTestId('allow-content-access').waitFor();
  });
  await check('O03 restart and old bootstrap cannot replace new authority instance', async () => {
    let entered, release; const captured = new Promise(r => { entered = r; }), gate = new Promise(r => { release = r; }); let hold = true;
    await page.route('**/api/bootstrap', async route => {
      if (!hold) return route.continue(); hold = false;
      const response = await route.fetch(); entered(); await gate; await route.fulfill({ response });
    });
    const old = await (await page.request.get(app.url + '/api/bootstrap')).json(); const port = Number(new URL(app.url).port);
    await page.evaluate(() => window.dispatchEvent(new Event('online'))); await captured;
    await app.close(); app = await createApplication({ ...options, port });
    await page.evaluate(() => window.dispatchEvent(new Event('online'))); await page.getByTestId('allow-content-access').waitFor();
    const next = await (await page.request.get(app.url + '/api/bootstrap')).json(); assert.notEqual(old.access.authorityInstanceId, next.access.authorityInstanceId);
    release(); await page.waitForTimeout(250); await page.unroute('**/api/bootstrap');
    assert.ok(await page.getByTestId('allow-content-access').isVisible());
    assert.doesNotMatch(await page.locator('#app').innerText(), /SYNTHETIC_RC4_PRIVATE_TASK|CURRENT_REGRANT_TASK/);
  });
  await check('O04 background/offline restoration requires fresh bootstrap before private display', async () => {
    await grant(); await page.getByTestId('revoke-content-access').waitFor();
    await context.setOffline(true); await page.waitForFunction(() => !document.querySelector('[data-testid="revoke-content-access"]'));
    await deny(); await context.setOffline(false); await page.getByTestId('allow-content-access').waitFor();
    assert.doesNotMatch(await page.locator('#app').innerText(), /SYNTHETIC_RC4_PRIVATE_TASK|PRIVATE_PLAN/);
  });
  await check('R03/R04 RPC-only discovery, explicit UI grant, actual wire notification to Edge', async () => {
    const f = fakeRpc({ mock }); await app.service.select({ mode: 'app-server', endpoint: 'ws://127.0.0.1:4500/' });
    await page.getByTestId('allow-content-access').waitFor(); assert.equal(f.sent.some(x => x.method === 'thread/read'), false);
    await page.getByTestId('allow-content-access').click(); await page.getByTestId('confirm-content-access').click();
    await page.getByTestId('revoke-content-access').waitFor();
    f.emit('turn/plan/updated', { threadId: 'rpc-a', turnId: 'turn-one', plan: [{ step: 'RPC_WIRE_PLAN_FIXTURE', status: 'inProgress' }] });
    await page.getByText('RPC_WIRE_PLAN_FIXTURE', { exact: true }).waitFor();
    f.emit('thread/tokenUsage/updated', { threadId: 'rpc-a', turnId: 'turn-one', tokenUsage: { total: { totalTokens: 9876 }, last: { totalTokens: 123 }, modelContextWindow: 1000 } });
    await page.getByText('9,876', { exact: true }).waitFor();
    assert.equal(f.sent.some(x => ['thread/list', 'thread/resume', 'turn/start'].includes(x.method)), false);
  });
  assert.deepEqual(errors, []); assert.ok(network.every(x => x.url.startsWith(app.url) || x.url.startsWith('blob:')));
  await fs.mkdir('test-results', { recursive: true }); await page.screenshot({ path: 'test-results/rc4-rpc-synthetic.png', fullPage: true });
  await fs.writeFile('test-results/browser-privacy-results.json', JSON.stringify({ syntheticOnly: true, results, pageErrors: errors, network: network.map(x => ({ method: x.method, route: new URL(x.url).pathname })) }, null, 2));
} finally { await browser.close(); await app.close(); mock.restoreAll(); await fs.rm(root, { recursive: true, force: true }); }
