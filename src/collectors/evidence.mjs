import { createHash } from 'node:crypto';
import { validateManifest } from '../core/acceptance.mjs';
import { safeText } from '../core/engine.mjs';
import { ResourceRegistry, sensitivePath } from '../core/resource-registry.mjs';
import { filenameSessionId } from '../core/session-access.mjs';
import { DataGateway } from './data-gateway.mjs';
import path from 'node:path';
import { ScopedState } from '../core/scoped-state.mjs';
const cached = new ScopedState();
const ignored = new Set(['.git', 'node_modules', '.aps-data', 'test-results', '.venv', '__pycache__', 'coverage']);
export const digest = value => createHash('sha256').update(value).digest('hex');
export const emptyEvidence = (errors = []) => ({ manifest: null, files: [], report: null, git: { available: false, files: [], commits: [], diff: '' }, fingerprint: null, manifestHash: null, errors });
function context(root, options) {
  const c = options?.context;
  const normalize = value => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
  if (!(c?.gateway instanceof DataGateway) || !root || normalize(c.root) !== normalize(root)) throw new Error('Evidence access requires an explicit workspace capability');
  c.gateway.check(c); return c;
}
export async function evidenceWorkspaceAllowed(root, options = {}) {
  if (!root) return false;
  try { await (options.registry || new ResourceRegistry(options)).workspace(root); return true; } catch { return false; }
}
export async function confinedFile(root, relative, options = {}) { const c = context(root, options); return (await c.gateway.file(c, relative)).file; }
const read = async (c, name) => (await c.gateway.read(c, name)).toString('utf8');
const denyFile = file => sensitivePath(file) || filenameSessionId(file.split(/[\\/]/).at(-1));
async function walkFiles(c, visit) {
  let complete = true, count = 0;
  async function walk(prefix = '', depth = 0) {
    if (depth > 20 || count >= 3000) { complete = false; return; }
    const entries = await c.gateway.list(c, prefix); entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries) {
      if (count >= 3000) { complete = false; break; }
      const relative = prefix + e.name;
      if (ignored.has(e.name) || denyFile(relative) || relative === '.agent-progress/results.json' || /\.log$/i.test(e.name)) continue;
      if (e.isSymbolicLink()) { complete = false; continue; }
      if (e.isDirectory()) await walk(relative + '/', depth + 1);
      else if (e.isFile()) { count++; try { await visit(relative); } catch { complete = false; } }
    }
  }
  try { await walk(); } catch { complete = false; }
  c.gateway.check(c); return complete;
}
export async function sourceFingerprint(root, options = {}) {
  let c; try { c = context(root, options); await c.gateway.registry.workspace(root); c.gateway.check(c); } catch { return { hash: null, complete: false, files: 0, bytes: 0 }; }
  const hash = createHash('sha256'); let bytes = 0, files = 0;
  let complete = await walkFiles(c, async file => {
    if (bytes > 40 * 1024 * 1024) throw new Error('Fingerprint limit');
    const data = await c.gateway.read(c, file); bytes += data.length; files++;
    hash.update(file).update('\0').update(data).update('\0');
  });
  try {
    const manifest = validateManifest(JSON.parse(await read(c, '.agent-progress/acceptance.json')));
    for (const file of [...new Set(manifest.criteria.flatMap(x => x.files || []))].sort()) {
      hash.update('declared\0' + file + '\0');
      try { const data = await c.gateway.read(c, file); hash.update(data); bytes += data.length; }
      catch (e) { if (e.code === 'ENOENT') hash.update('missing'); else complete = false; }
      hash.update('\0'); if (bytes > 40 * 1024 * 1024) complete = false;
    }
  } catch (e) { if (e.code !== 'ENOENT') complete = false; }
  c.gateway.check(c); return { hash: complete ? hash.digest('hex') : null, complete, files, bytes };
}
async function gitEvidence(c) {
  try {
    const candidates = new Set((await c.gateway.git(c, 'index')).split('\0').filter(Boolean));
    await walkFiles(c, async p => { candidates.add(p); });
    const allowed = [];
    for (const file of candidates) { try { if (denyFile(file)) continue; await c.gateway.file(c, file, { missing: true }); allowed.push(file); } catch { /* metadata is not a file grant */ } }
    const limited = allowed.slice(0, 200);
    const [status, log, branch] = await Promise.all([
      c.gateway.git(c, 'status', limited), c.gateway.git(c, 'log').catch(() => ''), c.gateway.git(c, 'branch').catch(() => '')
    ]);
    c.gateway.check(c); const parts = status.split('\0').filter(Boolean), files = [];
    for (let i = 0; i < parts.length; i++) {
      const state = parts[i].slice(0, 2), name = parts[i].slice(3), oldName = /[RC]/.test(state) ? parts[++i] : null;
      if (limited.includes(name) && (!oldName || limited.includes(oldName))) files.push({ status: state, path: name });
    }
    const diffPaths = files.filter(f => f.status !== '??').map(f => f.path);
    const diff = await c.gateway.git(c, 'diff', diffPaths).catch(() => ''); c.gateway.check(c);
    return { available: true, branch: branch.trim(), files, paths: limited, truncated: allowed.length > 200 || diff.length > 120000, diff: safeText(diff, 120000),
      commits: log.trim().split('\n').filter(Boolean).map(l => { const [hash, at, ...title] = l.split('\t'); return { hash, at, title: safeText(title.join('\t'), 300) }; }) };
  } catch { c.gateway.check(c); return { available: false, reason: 'Git evidence unavailable or unsafe configuration', files: [], commits: [], diff: '' }; }
}
export async function collectEvidence(root, options = {}) {
  let c; try { c = context(root, options); await c.gateway.registry.workspace(root); c.gateway.check(c); } catch { return emptyEvidence(root ? ['Evidence workspace is not authorized or overlaps protected data'] : []); }
  const errors = []; let manifest = null, manifestHash = null, report = null;
  try { const contents = await read(c, '.agent-progress/acceptance.json'); manifest = validateManifest(JSON.parse(contents)); manifestHash = digest(contents); } catch (e) { if (e.code !== 'ENOENT') errors.push('Acceptance unavailable or invalid'); }
  const files = [];
  for (const file of new Set(manifest?.criteria.flatMap(x => x.files || []) || [])) { try { await c.gateway.file(c, file); files.push(file); } catch { /* no implementation evidence */ } }
  const fp = manifest ? await sourceFingerprint(root, options) : { hash: null, complete: true }; let reportHash = '';
  try {
    const contents = await read(c, '.agent-progress/results.json'), parsed = JSON.parse(contents);
    if (parsed.version !== 1 || !Array.isArray(parsed.tests) || parsed.tests.length > 1000 || !parsed.tests.every(t => typeof t.id === 'string' && ['passed', 'failed', 'skipped'].includes(t.status)) || new Set(parsed.tests.map(t => t.id)).size !== parsed.tests.length) throw new Error('Invalid report format');
    reportHash = digest(contents); report = { ...parsed, current: !!fp.hash && parsed.sourceFingerprint === fp.hash, detail: safeText(parsed.detail, 60000) };
  } catch (e) { if (e.code !== 'ENOENT') errors.push('Test report unavailable or invalid'); }
  if (!fp.complete) errors.push('Source fingerprint incomplete; verification is unknown');
  const git = await gitEvidence(c); c.gateway.check(c);
  return cached.remember({ manifest, manifestHash, files, report, fingerprint: fp.hash ? digest(fp.hash + ':' + reportHash) : null, sourceFingerprint: fp.hash, git, errors }, c);
}
export async function readEvidence(root, kind, id, evidence, options = {}) {
  const c = context(root, options); cached.check(evidence, c);
  if (kind === 'diff') return evidence.git.diff || '';
  if (kind === 'report') return JSON.stringify(evidence.report, null, 2);
  if (kind === 'commit') {
    if (!evidence.git.commits.some(x => x.hash === id)) throw new Error('Unknown commit');
    return safeText(await c.gateway.git(c, 'commit', [id, ...(evidence.git.paths || [])]), 120000);
  }
  if (kind === 'file') {
    if (!evidence.files.includes(id) && !evidence.git.files.some(f => f.path === id)) throw new Error('File is not in evidence index');
    return safeText(await read(c, id), 60000);
  }
  throw new Error('Unsupported evidence kind');
}
