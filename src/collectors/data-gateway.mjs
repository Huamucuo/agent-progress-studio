import { open, lstat, readdir, mkdir, rename, unlink } from 'node:fs/promises';
import { readSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { SessionAccess, canonicalUuid, refKey } from '../core/session-access.mjs';
import { ResourceRegistry, canonicalPath, within } from '../core/resource-registry.mjs';
const sameFile = (a, b) => a.ino === b.ino && a.dev === b.dev && b.isFile() && b.nlink <= 1;

/** The only business-content I/O boundary. No caller-supplied canRead callbacks. */
export class DataGateway {
  constructor(access, registry) {
    if (!(access instanceof SessionAccess) || !(registry instanceof ResourceRegistry)) throw new Error('Authority and registry required');
    this.access = access; this.registry = registry;
  }
  check(context) { if (context?.gateway !== this || !context.permits?.length) throw new Error('Missing read capability'); for (const p of context.permits) this.access.check(p); }
  async evidence(ref, root, dependencies = []) {
    const canonical = await this.registry.workspace(root), permit = this.access.issue(ref, 'evidence', canonical);
    const context = Object.freeze({ gateway: this, ref, root: canonical, permits: Object.freeze([...dependencies, permit]) }); this.check(context); return context;
  }
  demo(ref) { const permit = this.access.issue(ref, 'observe'); return Object.freeze({ gateway: this, ref, root: 'demo:' + ref.id, permits: Object.freeze([permit]) }); }
  async openLog(ref, file) {
    const permit = this.access.issue(ref, 'content');
    const named = await this.registry.log(ref, file); this.access.check(permit);
    const handle = await open(named.file, 'r');
    try {
      const info = await handle.stat(); this.access.check(permit);
      if (!sameFile(named.info, info)) throw new Error('Log changed before validation');
      const buf = Buffer.alloc(256 * 1024); let size = 0;
      while (size < buf.length) { this.access.check(permit); if (!readSync(handle.fd, buf, size, 1, size)) throw new Error('Incomplete session header'); if (buf[size++] === 10) break; }
      if (buf[size - 1] !== 10) throw new Error('Session header exceeds limit');
      this.access.check(permit); const header = JSON.parse(buf.subarray(0, size).toString('utf8'));
      if (header.type !== 'session_meta' || canonicalUuid(header.payload?.id) !== ref.id) throw new Error('Session header identity mismatch');
      return { permit, info, header, headerBytes: size,
        read: async (start, length) => {
          if (start < size || length > 8 * 1024 * 1024 || length < 0) throw new Error('Invalid log read range');
          this.access.check(permit); const data = Buffer.alloc(length), { bytesRead } = await handle.read(data, 0, length, start);
          this.access.check(permit); return data.subarray(0, bytesRead);
        }, close: () => handle.close() };
    } catch (e) { await handle.close(); throw e; }
  }
  async file(context, relative, options = {}) {
    this.check(context); const named = await this.registry.regular(context.root, relative, options); this.check(context); return named;
  }
  async read(context, relative, max = 2 * 1024 * 1024) {
    const named = await this.file(context, relative); this.check(context);
    const handle = await open(named.file, 'r');
    try {
      const info = await handle.stat(); this.check(context);
      if (!sameFile(named.info, info) || info.size > max) throw new Error('Evidence identity or size rejected');
      const data = Buffer.alloc(info.size + 1); this.check(context);
      const { bytesRead } = await handle.read(data, 0, data.length, 0); this.check(context);
      if (bytesRead > info.size) throw new Error('Evidence changed during read');
      return data.subarray(0, bytesRead);
    } finally { await handle.close(); }
  }
  async list(context, relative = '') {
    this.check(context);
    const dir = path.resolve(context.root, relative), real = await canonicalPath(dir); this.check(context);
    if (!within(context.root, real) || real !== dir) throw new Error('Linked evidence directory denied');
    return readdir(real, { withFileTypes: true });
  }
  async gitConfig(context, file) {
    this.check(context); const canonical = await canonicalPath(file); this.check(context);
    for (const root of this.registry.protected) if (within(await canonicalPath(root, true), canonical)) throw new Error('Protected Git directory');
    const named = await lstat(file); if (named.isSymbolicLink() || named.nlink > 1 || named.size > 256 * 1024) throw new Error('Unsafe Git configuration');
    this.check(context); const handle = await open(file, 'r');
    try { const info = await handle.stat(); this.check(context); if (!sameFile(named, info)) throw new Error('Git configuration changed'); const data = Buffer.alloc(info.size + 1); this.check(context); const { bytesRead } = await handle.read(data, 0, data.length, 0); this.check(context); if (bytesRead > info.size) throw new Error('Git configuration changed'); return data.subarray(0, bytesRead).toString('utf8'); } finally { await handle.close(); }
  }
  async gitMetadata(context, directory) {
    // Git has implicit inputs beyond a requested diff. Validate the metadata
    // graph before starting it; alternates would introduce another object scope.
    this.check(context); const root = await canonicalPath(directory), literal = path.resolve(directory);
    if (root !== (process.platform === 'win32' ? literal.toLowerCase() : literal)) throw new Error('Linked Git metadata denied');
    for (const item of this.registry.protected) {
      const protectedRoot = await canonicalPath(item, true);
      if (within(root, protectedRoot) || within(protectedRoot, root)) throw new Error('Protected Git directory');
    }
    let count = 0;
    const walk = async (dir, depth) => {
      this.check(context); if (depth > 32 || ++count > 50000) throw new Error('Git metadata exceeds validation limits');
      const info = await lstat(dir); this.check(context);
      if (info.isSymbolicLink()) throw new Error('Linked Git metadata denied');
      if (!info.isDirectory()) { if (!info.isFile() || info.nlink > 1) throw new Error('Ambiguous Git metadata'); return; }
      for (const item of await readdir(dir, { withFileTypes: true })) {
        // These commands never inspect hooks, reflogs, other worktrees or
        // submodule repositories; submodule recursion is disabled at dispatch.
        if (depth === 0 && ['hooks', 'logs', 'worktrees', 'modules'].includes(item.name)) continue;
        const file = path.join(dir, item.name), relative = path.relative(root, file).replaceAll('\\', '/');
        if (/^objects\/info\/(?:http-)?alternates$/i.test(relative)) throw new Error('Git object alternates require separate authorization');
        await walk(file, depth + 1);
      }
    };
    await walk(root, 0); this.check(context); return root;
  }
  async gitWorktreeInputs(context, paths) {
    const directories = new Set(['']);
    for (const file of paths) {
      let dir = path.dirname(file);
      while (dir !== '.' && dir !== '') { directories.add(dir); const parent = path.dirname(dir); if (parent === dir) throw new Error('Invalid Git path'); dir = parent; }
    }
    // Literal, regular-file pathspecs constrain traversal to these ancestors.
    // Git can read their attributes/ignores even when they aren't in the diff.
    for (const dir of directories) for (const name of ['.gitattributes', '.gitignore']) await this.file(context, path.join(dir, name), { missing: true });
    await this.file(context, '.mailmap', { missing: true });
  }
  async git(context, operation, args = []) {
    this.check(context);
    if (!['index', 'status', 'log', 'branch', 'diff', 'commit'].includes(operation)) throw new Error('Git method denied');
    const dot = path.join(context.root, '.git'), stat = await lstat(dot); this.check(context);
    if (stat.isSymbolicLink()) throw new Error('Linked Git metadata denied');
    let gitDir = dot;
    if (stat.isFile()) { const pointer = await this.gitConfig(context, dot); const match = /^gitdir: (.+)\r?\n?$/.exec(pointer); if (!match) throw new Error('Invalid Git worktree'); gitDir = path.resolve(context.root, match[1]); }
    gitDir = await this.gitMetadata(context, gitDir); let common = gitDir;
    try { common = await canonicalPath(path.resolve(gitDir, (await this.gitConfig(context, path.join(gitDir, 'commondir'))).trim())); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (common !== gitDir) await this.gitMetadata(context, common);
    for (const file of [path.join(common, 'config'), path.join(gitDir, 'config.worktree')]) {
      let config = ''; try { config = await this.gitConfig(context, file); } catch (e) { if (e.code !== 'ENOENT') throw e; }
      if (/^\s*\[\s*(?:include|includeif|filter)\b/im.test(config)) throw new Error('Git includes and clean filters require separate review');
    }
    const commands = { index: ['ls-files', '-z'], status: ['status', '--porcelain=v1', '-z', '--untracked-files=normal', '--ignore-submodules=all', '--', ...args.map(p => `:(literal)${p}`)], log: ['log', '-5', '--format=%H%x09%aI%x09%s'], branch: ['branch', '--show-current'] };
    let command = commands[operation];
    if (operation === 'status') { if (!args.length) return ''; for (const file of args) await this.file(context, file, { missing: true }); }
    if (operation === 'diff' || operation === 'commit') {
      const paths = operation === 'commit' ? args.slice(1) : args;
      for (const file of paths) await this.file(context, file, { missing: true });
      if (operation === 'commit' && !/^[a-f0-9]{40,64}$/.test(args[0])) throw new Error('Invalid commit');
      command = operation === 'commit' ? ['show', '--no-ext-diff', '--no-textconv', '--ignore-submodules=all', '--format=fuller', '--stat', args[0], '--', ...paths.map(p => `:(literal)${p}`)] : ['diff', '--no-ext-diff', '--no-textconv', '--ignore-submodules=all', 'HEAD', '--', ...paths.map(p => `:(literal)${p}`)];
      if (!paths.length) return '';
    }
    await this.gitWorktreeInputs(context, operation === 'commit' ? args.slice(1) : args);
    // Strip all inherited Git injection knobs. Local extensions are disabled;
    // include/includeIf is rejected above before Git can follow external files.
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(GIT_|GIT_CONFIG|PAGER$)/i.test(key)));
    const nullFile = process.platform === 'win32' ? 'NUL' : '/dev/null';
    Object.assign(env, { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: nullFile, GIT_ATTR_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0', GIT_PAGER: 'cat', GIT_OPTIONAL_LOCKS: '0', GIT_NO_LAZY_FETCH: '1' });
    this.check(context);
    const { stdout } = await promisify(execFile)('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=', '-c', 'core.untrackedCache=false', '-c', 'diff.external=', '-c', 'core.attributesFile=', '-c', 'core.excludesFile=', '-c', `diff.orderFile=${nullFile}`, '-c', 'mailmap.file=', '-c', 'mailmap.blob=', '-c', 'log.mailmap=false', '-c', 'submodule.recurse=false', `--git-dir=${gitDir}`, `--work-tree=${context.root}`, ...command], { cwd: context.root, env, windowsHide: true, timeout: 5000, maxBuffer: 1024 * 1024 });
    this.check(context); return stdout;
  }
  reviewPath(context, dataDir) { this.check(context); return path.join(dataDir, 'reviews', createHash('sha256').update(refKey(context.ref) + ':' + context.root + ':' + JSON.stringify(context.permits.map(p => p.dependency))).digest('hex') + '.json'); }
  async reviewRead(context, dataDir) {
    const file = this.reviewPath(context, dataDir); let handle;
    try { this.check(context); const info = await lstat(file); if (!info.isFile() || info.isSymbolicLink() || info.nlink > 1 || info.size > 256 * 1024) throw new Error('Review unavailable'); this.check(context); handle = await open(file, 'r'); const actual = await handle.stat(); this.check(context); if (!sameFile(info, actual)) throw new Error('Review identity changed'); const data = await handle.readFile(); this.check(context); return JSON.parse(data.toString('utf8')); }
    catch (e) { if (e.code === 'ENOENT') return {}; throw e; } finally { await handle?.close(); }
  }
  async reviewWrite(context, dataDir, value) {
    const file = this.reviewPath(context, dataDir), temp = file + '.' + randomUUID() + '.tmp';
    await mkdir(path.dirname(file), { recursive: true }); this.check(context);
    let handle;
    try { handle = await open(temp, 'wx', 0o600); this.check(context); await handle.writeFile(JSON.stringify(value)); await handle.sync(); await handle.close(); handle = null; this.check(context); await rename(temp, file); this.check(context); }
    finally { await handle?.close(); await unlink(temp).catch(() => {}); }
  }
}
