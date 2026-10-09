import { realpath, lstat } from 'node:fs/promises';
import path from 'node:path';
import { homedir } from 'node:os';
import { filenameSessionId } from './session-access.mjs';
const folded = value => process.platform === 'win32' ? value.toLowerCase() : value;
export const within = (root, target) => { const rel = path.relative(folded(root), folded(target)); return !rel || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel)); };
export const sensitivePath = value => /(^|[\\/])(?:\.env(?:\..*)?|auth\.json|credentials(?:\.json)?|id_rsa|id_ed25519|\.ssh|\.aws|\.codex|\.aps-data)(?:[\\/]|$)/i.test(value) || /\.(pem|key|pfx)$/i.test(value);
export async function canonicalPath(input, reserveMissing = false) {
  let current = path.resolve(input), suffix = [];
  for (;;) {
    try { return folded(path.join(await realpath(current), ...suffix)); }
    catch (e) {
      if (!reserveMissing || e.code !== 'ENOENT') throw Object.assign(new Error('Resource identity cannot be verified'), { code: e.code });
      const parent = path.dirname(current); if (parent === current) throw new Error('Resource identity cannot be verified');
      suffix.unshift(path.basename(current)); current = parent;
    }
  }
}
export class ResourceRegistry {
  constructor({ codexHomes = [], protectedRoots = [], dataDir, hooksDir } = {}) {
    this.homes = [...new Set([path.join(homedir(), '.codex'), process.env.CODEX_HOME, ...codexHomes].filter(Boolean).map(p => path.resolve(p)))];
    this.protected = [...this.homes.flatMap(p => [path.join(p, 'sessions'), path.join(p, 'archived_sessions')]), ...protectedRoots, dataDir, hooksDir].filter(Boolean);
  }
  async workspace(root) {
    const base = await canonicalPath(root);
    for (const item of this.protected) {
      const target = await canonicalPath(item, true);
      if (within(base, target) || within(target, base)) throw new Error('Workspace overlaps a protected data store');
    }
    if (!(await lstat(base)).isDirectory()) throw new Error('Workspace unavailable');
    return base;
  }
  async regular(root, file, { log = false, missing = false, git = false } = {}) {
    const base = await canonicalPath(root), absolute = path.resolve(root, file);
    if (!within(base, absolute) || absolute === base) throw new Error('Path outside authorized resource');
    const parts = path.relative(base, absolute).split(path.sep);
    if (!log && !git && (sensitivePath(file) || parts.includes('.git') || filenameSessionId(path.basename(file)))) throw new Error('Evidence path denied');
    let cursor = base;
    for (const part of parts) {
      cursor = path.join(cursor, part);
      try { if ((await lstat(cursor)).isSymbolicLink()) throw new Error('Linked resource denied'); }
      catch (e) { if (missing && e.code === 'ENOENT') break; throw e; }
    }
    const target = await canonicalPath(absolute, missing);
    if (!within(base, target)) throw new Error('Resource alias escapes scope');
    if (!log) for (const item of this.protected) if (within(await canonicalPath(item, true), target)) throw new Error('Protected resource denied');
    let info;
    try { info = await lstat(target); } catch (e) { if (missing && e.code === 'ENOENT') return { file: target, info: null }; throw e; }
    if (!info.isFile() || info.isSymbolicLink() || info.nlink > 1) throw new Error('Resource identity is ambiguous');
    return { file: target, info };
  }
  async log(ref, file) {
    if (!ref.backend.startsWith('local:') || filenameSessionId(path.basename(file)) !== ref.id) throw new Error('Unknown log resource');
    const home = await canonicalPath(ref.backend.slice(6), true);
    const registered = await Promise.all(this.homes.map(p => canonicalPath(p, true)));
    if (!registered.includes(home)) throw new Error('Unregistered backend');
    const absolute = await canonicalPath(file);
    if (![path.join(home, 'sessions'), path.join(home, 'archived_sessions')].some(p => within(p, absolute))) throw new Error('Log outside registered stores');
    return this.regular(home, path.relative(home, file), { log: true });
  }
}
