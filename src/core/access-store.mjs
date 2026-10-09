import { mkdir, readFile, open, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

/** Policy metadata only. Body/review data must never be passed to this store. */
export class AccessStore {
  constructor(directory) { this.directory = path.resolve(directory); this.failed = false; }
  async open() {
    await mkdir(this.directory, { recursive: true });
    const lock = path.join(this.directory, 'authority.lock');
    try { this.lock = await open(lock, 'wx', 0o600); }
    catch (e) {
      if (e.code !== 'EEXIST') throw e;
      let pid; try { pid = Number(await readFile(lock, 'utf8')); } catch { throw new Error('Authority directory already open or lock requires inspection'); }
      if (!Number.isSafeInteger(pid) || pid < 1) throw new Error('Authority directory already open or lock requires inspection');
      try { process.kill(pid, 0); throw new Error('Authority directory already open'); }
      catch (error) { if (error.code !== 'ESRCH') throw error; }
      await unlink(lock); this.lock = await open(lock, 'wx', 0o600);
    }
    await this.lock.writeFile(String(process.pid)); await this.lock.sync();
    try {
      let unclean = false, saved;
      try { await readFile(path.join(this.directory, 'running.json')); unclean = true; } catch (e) { if (e.code !== 'ENOENT') unclean = true; }
      try { saved = JSON.parse(await readFile(path.join(this.directory, 'session-access.json'), 'utf8')); } catch (e) { saved = e.code === 'ENOENT' ? undefined : {}; }
      const marker = await open(path.join(this.directory, 'running.json'), 'w', 0o600);
      try { await marker.writeFile(JSON.stringify({ pid: process.pid, instance: randomUUID() })); await marker.sync(); } finally { await marker.close(); }
      if (unclean && saved?.version === 2) {
        saved.revision++;
        for (const entry of Object.values(saved.entries || {})) for (const cap of ['content', 'evidence', 'observe']) {
          if (entry[cap]) { entry[cap].allowed = false; entry[cap].generation++; }
        }
        saved.recovery = 'Unclean shutdown: confirm access again';
        // Recovery itself must be durable before a later clean stop can remove
        // the dirty marker; otherwise the following restart would restore grants.
        const recovered = await this.stage(saved); await this.commit(recovered);
      }
      return saved;
    } catch (e) { await this.close(false); throw e; }
  }
  async stage(value) {
    const file = path.join(this.directory, `policy-${randomUUID()}.tmp`), handle = await open(file, 'wx', 0o600);
    try { await handle.writeFile(JSON.stringify(value, null, 2)); await handle.sync(); } finally { await handle.close(); }
    return file;
  }
  async commit(file) { await rename(file, path.join(this.directory, 'session-access.json')); }
  async discard(file) { await unlink(file).catch(() => {}); }
  async close(clean) {
    if (!this.lock) return;
    if (clean && !this.failed) await unlink(path.join(this.directory, 'running.json')).catch(() => { this.failed = true; });
    await this.lock.close(); this.lock = null;
    await unlink(path.join(this.directory, 'authority.lock')).catch(e => { if (e.code !== 'ENOENT') throw e; });
  }
}
