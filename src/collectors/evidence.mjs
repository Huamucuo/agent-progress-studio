import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { validateManifest } from '../core/acceptance.mjs';
import { safeText } from '../core/engine.mjs';
const exec = promisify(execFile);
const ignored = new Set(['.git', 'node_modules', '.aps-data', 'test-results', '.venv', '__pycache__', 'coverage']);
const sensitive = p => /(^|[\\/])(?:\.env(?:\..*)?|auth\.json|credentials(?:\.json)?|id_rsa|id_ed25519|\.ssh|\.aws|\.codex)(?:[\\/]|$)/i.test(p) || /\.(pem|key|pfx)$/i.test(p);
export const digest = value => createHash('sha256').update(value).digest('hex');

export async function confinedFile(root, relative) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative) || relative.includes('\0') || relative.split(/[\\/]/).some(p => p === '..' || p === '.git') || sensitive(relative)) throw new Error('Evidence path denied');
  const base = await realpath(root), target = await realpath(path.resolve(base, relative));
  const rel = path.relative(base, target);
  if (rel.startsWith('..') || path.isAbsolute(rel) || !rel) throw new Error('Evidence path escapes workspace');
  const info = await stat(target);
  if (!info.isFile() || info.size > 2 * 1024 * 1024) throw new Error('Evidence file unavailable or exceeds 2 MiB');
  return target;
}

export async function sourceFingerprint(root) {
  const hash = createHash('sha256'); let files = 0, bytes = 0, complete = true;
  async function walk(dir, prefix = '', depth = 0) {
    if (depth > 20) { complete = false; return; }
    const entries = await readdir(dir, { withFileTypes: true }); entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries) {
      const relative = prefix + e.name;
      if (ignored.has(e.name) || sensitive(relative) || relative === '.agent-progress/results.json' || /\.log$/i.test(e.name)) continue;
      if (e.isSymbolicLink()) { complete = false; continue; }
      if (files >= 3000 || bytes > 40 * 1024 * 1024) { complete = false; return; }
      if (e.isDirectory()) await walk(path.join(dir, e.name), relative + '/', depth + 1);
      else if (e.isFile()) {
        const info = await stat(path.join(dir, e.name));
        if (info.size > 2 * 1024 * 1024) { complete = false; continue; }
        const data = await readFile(path.join(dir, e.name)); bytes += data.length; files++;
        hash.update(relative).update('\0').update(data).update('\0');
      }
    }
  }
  try { await walk(root); } catch { complete = false; }
  // Declared evidence must be fingerprinted even when it lives in an ignored
  // output directory or has a log extension. Missing files get a stable marker.
  try {
    const manifest = validateManifest(JSON.parse(await readFile(await confinedFile(root, '.agent-progress/acceptance.json'), 'utf8')));
    for (const file of [...new Set(manifest.criteria.flatMap(c => c.files || []))].sort()) {
      hash.update('declared\0' + file + '\0');
      try { const data = await readFile(await confinedFile(root, file)); hash.update(data); bytes += data.length; }
      catch (e) { if (e.code === 'ENOENT') hash.update('missing'); else complete = false; }
      hash.update('\0');
      if (bytes > 40 * 1024 * 1024) complete = false;
    }
  } catch (e) { if (e.code !== 'ENOENT') complete = false; }
  return { hash: complete ? hash.digest('hex') : null, complete, files, bytes };
}

async function git(root, args) {
  const { stdout } = await exec('git', ['--no-optional-locks', '-C', root, ...args], { windowsHide: true, timeout: 5000, maxBuffer: 1024 * 1024,
    env: { ...process.env, GIT_PAGER: 'cat', GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' } });
  return stdout;
}
async function gitEvidence(root) {
  try {
    const top = (await git(root, ['rev-parse', '--show-toplevel'])).trim();
    if (path.resolve(top).toLowerCase() !== path.resolve(root).toLowerCase()) return { available: false, reason: 'Selected workspace is not the repository root', files: [], commits: [], diff: '' };
    const [status, log, branch] = await Promise.all([
      git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=normal']),
      git(root, ['log', '-5', '--format=%H%x09%aI%x09%s']).catch(() => ''),
      git(root, ['branch', '--show-current']).catch(() => '')
    ]);
    const parts = status.split('\0').filter(Boolean), files = [];
    for (let i = 0; i < parts.length; i++) {
      const state = parts[i].slice(0, 2), name = parts[i].slice(3), oldName = /[RC]/.test(state) ? parts[++i] : null;
      if (!sensitive(name) && (!oldName || !sensitive(oldName))) files.push({ status: state, path: name });
    }
    const paths = files.slice(0, 200).filter(f => f.status !== '??').map(f => `:(literal)${f.path}`);
    let diff = '';
    if (paths.length) diff = await git(root, ['diff', '--no-ext-diff', '--no-textconv', 'HEAD', '--', ...paths])
      .catch(async () => (await git(root, ['diff', '--no-ext-diff', '--no-textconv', '--cached', '--', ...paths])) + (await git(root, ['diff', '--no-ext-diff', '--no-textconv', '--', ...paths])));
    return { available: true, branch: branch.trim(), files: files.slice(0, 200), truncated: files.length > 200 || diff.length > 120000, diff: safeText(diff, 120000),
      commits: log.trim().split('\n').filter(Boolean).map(l => { const [hash, at, ...title] = l.split('\t'); return { hash, at, title: safeText(title.join('\t'), 300) }; }) };
  } catch (e) { return { available: false, reason: e.code === 'ENOENT' ? 'Git is not installed' : 'Git evidence unavailable', files: [], commits: [], diff: '' }; }
}
export async function collectEvidence(root) {
  if (!root) return { manifest: null, files: [], report: null, git: { available: false, files: [], commits: [], diff: '' }, fingerprint: null, manifestHash: null, errors: [] };
  const errors = []; let manifest = null, manifestHash = null, report = null;
  try { const contents = await readFile(await confinedFile(root, '.agent-progress/acceptance.json'), 'utf8'); manifest = validateManifest(JSON.parse(contents)); manifestHash = digest(contents); }
  catch (e) { if (e.code !== 'ENOENT') errors.push(`Acceptance: ${e.message}`); }
  const files = [];
  for (const file of new Set(manifest?.criteria.flatMap(c => c.files || []) || [])) { try { await confinedFile(root, file); files.push(file); } catch { /* no implementation evidence */ } }
  const fp = manifest ? await sourceFingerprint(root) : { hash: null, complete: true };
  let reportHash = '';
  try {
    const contents = await readFile(await confinedFile(root, '.agent-progress/results.json'), 'utf8'); const parsed = JSON.parse(contents);
    if (parsed.version !== 1 || !Array.isArray(parsed.tests) || parsed.tests.length > 1000 || !parsed.tests.every(t => typeof t.id === 'string' && ['passed', 'failed', 'skipped'].includes(t.status)) || new Set(parsed.tests.map(t => t.id)).size !== parsed.tests.length) throw new Error('Invalid report format');
    reportHash = digest(contents);
    report = { ...parsed, current: !!fp.hash && parsed.sourceFingerprint === fp.hash, detail: safeText(parsed.detail, 60000) };
  } catch (e) { if (e.code !== 'ENOENT') errors.push(`Report: ${e.message}`); }
  if (!fp.complete) errors.push('Source fingerprint incomplete (file/size limit or symlink); verification is unknown');
  return { manifest, manifestHash, files, report, fingerprint: fp.hash ? digest(fp.hash + ':' + reportHash) : null, sourceFingerprint: fp.hash, git: await gitEvidence(root), errors };
}

export async function readEvidence(root, kind, id, evidence) {
  if (kind === 'diff') return evidence.git.diff || '';
  if (kind === 'report') return JSON.stringify(evidence.report, null, 2);
  if (kind === 'commit') {
    if (!evidence.git.commits.some(c => c.hash === id) || !/^[a-f0-9]{40,64}$/.test(id)) throw new Error('Unknown commit');
    return safeText(await git(root, ['show', '--no-ext-diff', '--no-textconv', '--format=fuller', '--stat', id, '--']), 120000);
  }
  if (kind === 'file') {
    if (!evidence.files.includes(id) && !evidence.git.files.some(f => f.path === id)) throw new Error('File is not in the evidence index');
    return safeText(await readFile(await confinedFile(root, id), 'utf8'), 60000);
  }
  throw new Error('Unsupported evidence kind');
}
