import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { StudioService } from './service.mjs';
import { VERSION } from './version.mjs';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const assets = new Map([['/', 'index.html'], ['/index.html', 'index.html'], ['/app.mjs', 'app.mjs'], ['/state-receiver.mjs', 'state-receiver.mjs'], ['/components.mjs', 'components.mjs'], ['/i18n.mjs', 'i18n.mjs'], ['/styles.css', 'styles.css'], ['/logo.svg', 'logo.svg']]);
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
  const capture = () => ({ instance: service.access.instanceId, revision: service.access.revision, selection: service.selectionRevision });
  const current = c => c.instance === service.access.instanceId && c.revision === service.access.revision && c.selection === service.selectionRevision;
  const respond = (res, value, captured) => {
    if (captured && !current(captured)) throw new Error('Stale request; refresh and retry');
    service.publication.write(value, text => { res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(text); });
  };
  service.on('invalidate', () => { for (const stream of streams) stream.destroy(); streams.clear(); });
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
        if (input.authorityInstanceId !== service.access.instanceId || input.expectedPolicyRevision !== service.access.revision || input.selectionRevision !== service.selectionRevision) return json(res, 409, { error: 'Stale scope; refresh and retry' });
        if (url.pathname === '/api/source') return respond(res, await service.select(input));
        if (url.pathname === '/api/demo') return respond(res, await service.demo(input.action));
        if (url.pathname === '/api/review') return respond(res, await service.review(input));
        if (url.pathname === '/api/hook-origin') return respond(res, await service.attributeHook(input));
        if (url.pathname === '/api/session-access') return respond(res, await service.sessionAccess(input));
        return json(res, 404, { error: 'Not found' });
      }
      if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
      if (url.pathname === '/api/bootstrap') return respond(res, service.publication.seal({ token, version: VERSION, freshnessMs: 10000 }));
      const captured = capture();
      if (url.pathname === '/api/snapshot') return respond(res, await service.refresh(), captured);
      if (url.pathname === '/api/sessions') {
        const snapshot = await service.refresh();
        return respond(res, service.publication.seal({ sessions: service.mode === 'demo' ? snapshot.localSessions : snapshot.sessions, localSessions: snapshot.localSessions }, { ref: snapshot.access.sessionRef }), captured);
      }
      if (url.pathname === '/api/evidence') return respond(res, await service.detail(url.searchParams.get('kind'), url.searchParams.get('id')), captured);
      if (url.pathname === '/api/export') {
        const result = await service.refresh();
        res.setHeader('Content-Disposition', 'attachment; filename="agent-progress-report.json"'); return respond(res, result, captured);
      }
      if (url.pathname === '/api/stream') {
        // Last-Event-ID is intentionally ignored: always a fresh, currently permitted snapshot.
        const snapshot = await service.refresh(); if (!current(captured)) throw new Error('Stale stream');
        service.publication.write(snapshot, text => {
          res.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
          res.write(`event: snapshot
data: ${text}

`); streams.add(res);
        });
        req.on('close', () => streams.delete(res)); return;
      }      const asset = assets.get(url.pathname);
      if (asset) { const content = await readFile(path.join(projectRoot, 'public', asset)); res.writeHead(200, { 'Content-Type': types[path.extname(asset)] }); return res.end(content); }
      json(res, 404, { error: 'Not found' });
    } catch (e) { if (!res.headersSent) json(res, 400, { error: e.message || 'Request failed' }); else res.end(); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(options.port ?? 4317, '127.0.0.1', resolve); });
  port = server.address().port;
  service.on('snapshot', snapshot => {
    for (const stream of streams) {
      if (stream.writableLength > 256 * 1024) { stream.destroy(); streams.delete(stream); continue; }
      try { service.publication.write(snapshot, text => stream.write(`event: snapshot
data: ${text}

`)); } catch { stream.destroy(); streams.delete(stream); }
    }
  });  let busy = false;
  const timer = options.interval === 0 ? null : setInterval(async () => { if (busy) return; busy = true; try { await service.tick(); } catch { /* Retain last known state on a transient collector failure. */ } finally { busy = false; } }, options.interval || 2000);
  const heartbeat = setInterval(() => { const meta = { authorityInstanceId: service.access.instanceId, policyRevision: service.access.revision, selectionRevision: service.selectionRevision }; for (const stream of streams) stream.write(`event: authority
data: ${JSON.stringify(meta)}

`); }, 3000);
  return { url: `http://127.0.0.1:${port}`, service, close: async () => { clearInterval(timer); clearInterval(heartbeat); for (const stream of streams) stream.destroy(); await service.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2), option = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const portText = option('--port') || process.env.APS_PORT || '4317', port = Number(portText);
  if (!Number.isInteger(port) || port < 1 || port > 65535) { console.error('Invalid --port'); process.exit(1); }
  try {
    const app = await createApplication({ port, mode: args.includes('--demo') ? 'demo' : args.includes('--work-hooks') ? 'work-hooks' : 'local', workspace: option('--workspace'), codexHome: option('--codex-home'), dataDir: option('--data-dir'), workHooksDir: option('--work-hooks-dir') });
    console.log(`Agent Progress Studio ${VERSION}\nLocal dashboard: ${app.url}\nLocal event observer. Press Ctrl+C to stop.`);
    const stop = async () => { await app.close(); process.exit(0); };
    process.on('SIGINT', stop); process.on('SIGTERM', stop);
  } catch (e) { console.error(e.code === 'EADDRINUSE' ? `Port ${port} is in use. Try --port ${port + 1}.` : e.message); process.exitCode = 1; }
}
