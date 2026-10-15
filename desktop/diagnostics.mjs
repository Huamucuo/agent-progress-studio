import { mkdir, open, lstat, rename } from 'node:fs/promises';
import path from 'node:path';
import { ownedDirectory } from './owned-files.mjs';
const codes = new Set(['APP_START','APP_EXIT','APP_PAUSE','APP_RESUME','SECOND_INSTANCE','WINDOW_HIDDEN','WINDOW_SHOWN','SETTINGS_RECOVERED','COLLECTOR_TRANSIENT_FAILURE','IPC_DENIED','OPERATION_FAILED','RENDERER_FAILED','MAIN_FAILED','HOOK_INSTALL_FAILED','HOOK_REMOVE_FAILED','CACHE_CLEANED','CACHE_CLEAN_FAILED','POWER_SIMULATED','SHORTCUT_UNAVAILABLE']);
/** Diagnostics deliberately have no caller-supplied message/stack/payload field. */
export class Diagnostics {
  constructor(directory) { this.directory = directory; this.file = path.join(directory, 'desktop.log'); this.queue = Promise.resolve(); }
  record(code) {
    if (!codes.has(code)) code = 'OPERATION_FAILED';
    const entry = JSON.stringify({ timestamp: new Date().toISOString(), code }) + '\n';
    const task = async () => {
      await ownedDirectory(this.directory);
      try { const info = await lstat(this.file); if (!info.isFile() || info.isSymbolicLink() || info.nlink > 1) return; if (info.size > 256 * 1024) await rename(this.file, this.file + '.previous'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
      const h = await open(this.file, 'a', 0o600); try { const stat=await h.stat(),named=await lstat(this.file);if(!named.isSymbolicLink()&&stat.isFile()&&stat.nlink<=1&&stat.dev===named.dev&&stat.ino===named.ino)await h.writeFile(entry); } finally { await h.close(); }
    };
    this.queue = this.queue.then(task).catch(() => {}); return this.queue;
  }
  async read() {
    await this.queue; let h;
    try { await ownedDirectory(this.directory);const info = await lstat(this.file); if (!info.isFile() || info.isSymbolicLink() || info.nlink > 1 || info.size > 300000) return ''; h = await open(this.file, 'r'); const actual = await h.stat(); if (actual.ino !== info.ino || actual.dev !== info.dev || actual.nlink>1) return ''; const b = Buffer.alloc(300001), result = await h.read(b, 0, b.length, 0); return result.bytesRead <= 300000 ? b.subarray(0, result.bytesRead).toString('utf8') : ''; }
    catch { return ''; } finally { await h?.close(); }
  }
}
