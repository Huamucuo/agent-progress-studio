import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { StudioService } from './service.mjs';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const assets = new Map([['/', 'index.html'], ['/index.html', 'index.html'], ['/app.mjs', 'app.mjs'], ['/components.mjs', 'components.mjs'], ['/i18n.mjs', 'i18n.mjs'], ['/styles.css', 'styles.css'], ['/logo.svg', 'logo.svg']]);
const types = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
const json = (res, code, data) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
async function body(req) {
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw new Error('JSON body required');
  let text = ''; for await (const chunk of req) { text += chunk.toString(); if (text.length > 16384) throw new Error('Request too large'); }
  return JSON.parse(text);
}

export async function createApplication(options = {}) {
  const token = randomBytes(32).toString('hex');
  const service = new StudioService({ ...options, dataDir: options.dataDir || path.join(projectRoot, '.aps-data') });
  await service.init();
  const streams = new Set(); let port;
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    const allowedHost = `127.0.0.1:${port}`, allowedLocalhost = `localhost:${port}`;
    if (![allowedHost, allowedLocalhost].includes(req.headers.host) || (req.headers.origin && ![`http://${allowedHost}`, `http://${allowedLocalhost}`].includes(req.headers.origin)) || req.headers['sec-fetch-site'] === 'cross-site') return json(res, 403, { error: 'Local same-origin access only' });
    try {
      const url = new URL(req.url, `http://${allowedHost}`);
      if (req.method === 'POST') {
        const supplied = Buffer.from(String(req.headers['x-aps-token'] || '')), expected = Buffer.from(token);
        if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return json(res, 403, { error: 'Invalid local mutation token' });
        const input = await body(req);
        if (url.pathname === '/api/source') return json(res, 200, await service.select(input));
        if (url.pathname === '/api/demo') return json(res, 200, await service.demo(input.action));
        if (url.pathname === '/api/review') return json(res, 200, await service.review(input));
        return json(res, 404, { error: 'Not found' });
      }
      if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
      if (url.pathname === '/api/bootstrap') return json(res, 200, { token, version: '0.1.0' });
      if (url.pathname === '/api/snapshot') return json(res, 200, service.snapshot);
      if (url.pathname === '/api/sessions') return json(res, 200, { sessions: service.mode === 'app-server' ? service.source.sessions : await service.discover() });
      if (url.pathname === '/api/evidence') return json(res, 200, { text: await service.detail(url.searchParams.get('kind'), url.searchParams.get('id')) });
      if (url.pathname === '/api/export') { res.setHeader('Content-Disposition', 'attachment; filename="agent-progress-report.json"'); return json(res, 200, service.snapshot); }
      if (url.pathname === '/api/stream') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
        res.write(`event: snapshot\ndata: ${JSON.stringify(service.snapshot)}\n\n`); streams.add(res);
        req.on('close', () => streams.delete(res)); return;
      }
      const asset = assets.get(url.pathname);
      if (asset) { const content = await readFile(path.join(projectRoot, 'public', asset)); res.writeHead(200, { 'Content-Type': types[path.extname(asset)] }); return res.end(content); }
      json(res, 404, { error: 'Not found' });
    } catch (e) { if (!res.headersSent) json(res, 400, { error: e.message || 'Request failed' }); else res.end(); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(options.port ?? 4317, '127.0.0.1', resolve); });
  port = server.address().port;
  service.on('snapshot', snapshot => { const event = `event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`; for (const stream of streams) { if (stream.writableLength > 2 * 1024 * 1024) { stream.end(); streams.delete(stream); } else stream.write(event); } });
  let busy = false;
  const timer = options.interval === 0 ? null : setInterval(async () => { if (busy) return; busy = true; try { await service.tick(); } catch { /* Retain last known state on a transient collector failure. */ } finally { busy = false; } }, options.interval || 2000);
  const heartbeat = setInterval(() => { for (const stream of streams) stream.write(': heartbeat\n\n'); }, 15000);
  return { url: `http://127.0.0.1:${port}`, service, close: async () => { clearInterval(timer); clearInterval(heartbeat); service.close(); for (const stream of streams) stream.end(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2), option = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const portText = option('--port') || process.env.APS_PORT || '4317', port = Number(portText);
  if (!Number.isInteger(port) || port < 1 || port > 65535) { console.error('Invalid --port'); process.exit(1); }
  try {
    const app = await createApplication({ port, mode: args.includes('--demo') ? 'demo' : 'local', workspace: option('--workspace'), codexHome: option('--codex-home'), dataDir: option('--data-dir') });
    console.log(`Agent Progress Studio 0.1.0\nLocal dashboard: ${app.url}\nRead-only Codex observer. Press Ctrl+C to stop.`);
    const stop = async () => { await app.close(); process.exit(0); };
    process.on('SIGINT', stop); process.on('SIGTERM', stop);
  } catch (e) { console.error(e.code === 'EADDRINUSE' ? `Port ${port} is in use. Try --port ${port + 1}.` : e.message); process.exitCode = 1; }
}
