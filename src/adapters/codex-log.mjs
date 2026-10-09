import { readdir, open, lstat } from 'node:fs/promises';
import { readSync } from 'node:fs';
import path from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { createState, reduceEvent } from '../core/engine.mjs';
import { canonicalUuid, filenameSessionId } from '../core/session-access.mjs';
import { normalizeRecord } from './normalize.mjs';

/** Filename/stat discovery only. Even an empty exclusion set never opens logs. */
export async function discoverSessions(codexHome, limit = 60, excludedIds = new Set()) {
  const excluded = new Set([...excludedIds].map(canonicalUuid).filter(Boolean)), files = [];
  async function walk(dir, depth) {
    if (depth > 4 || files.length >= 300) return;
    let entries; try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    entries.sort((a, b) => b.name.localeCompare(a.name));
    for (const entry of entries) {
      if (files.length >= 300) break;
      const file = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) await walk(file, depth + 1);
      else if (entry.isFile()) {
        const id = filenameSessionId(entry.name);
        if (id && !excluded.has(id)) files.push({ id, path: file });
      }
    }
  }
  await walk(path.join(codexHome, 'sessions'), 0);
  const sessions = [];
  for (const file of files) {
    try {
      const info = await lstat(file.path);
      if (info.isFile() && !info.isSymbolicLink()) sessions.push({ ...file, cwd: '', updatedAt: info.mtime.toISOString(), version: null, title: file.id });
    } catch { /* Removed candidates contain no readable state. */ }
  }
  const counts = new Map(); for (const s of sessions) counts.set(s.id, (counts.get(s.id) || 0) + 1);
  return sessions.filter(s => counts.get(s.id) === 1).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, limit);
}

/** Strict header read: never prefetch a byte beyond its first newline. */
function readHeader(handle) {
  const buf = Buffer.alloc(256 * 1024); let length = 0;
  while (length < buf.length) {
    if (!readSync(handle.fd, buf, length, 1, length)) throw new Error('Incomplete session header');
    if (buf[length++] === 10) return { row: JSON.parse(buf.subarray(0, length).toString('utf8')), bytes: length };
  }
  throw new Error('Session header exceeds limit');
}

export class LogSource {
  constructor(file, id, maxRead = 8 * 1024 * 1024, { canRead = () => false } = {}) {
    this.file = file; this.id = canonicalUuid(id) || id; this.maxRead = maxRead; this.canRead = canRead;
    this.diagnostics = { malformed: 0, truncated: false, rotated: false }; this.reset();
  }
  reset() {
    this.offset = 0; this.pending = ''; this.decoder = new StringDecoder('utf8'); this.line = 0;
    this.state = createState(this.id); this.ino = undefined; this.mtime = undefined;
  }
  deny(reason = 'Session content is not authorized') {
    this.reset(); this.error = reason; this.diagnostics.accessDenied = true; return this.state;
  }
  async poll() {
    if (!canonicalUuid(this.id) || filenameSessionId(path.basename(this.file)) !== this.id || !this.canRead(this.id)) return this.deny();
    let handle;
    try {
      const named = await lstat(this.file);
      if (!named.isFile() || named.isSymbolicLink()) return this.deny('Session file is not a regular file');
      handle = await open(this.file, 'r'); const info = await handle.stat();
      if (!info.isFile() || info.ino !== named.ino || info.dev !== named.dev || !this.canRead(this.id)) return this.deny('Session file changed before validation');
      const header = readHeader(handle);
      if (header.row.type !== 'session_meta' || canonicalUuid(header.row.payload?.id) !== this.id || !this.canRead(this.id)) return this.deny('Session header identity does not match the authorized filename');
      this.error = null; this.diagnostics.accessDenied = false;
      if (info.size < this.offset || (this.ino !== undefined && this.ino !== info.ino) || (info.size === this.offset && this.mtime && this.mtime !== info.mtimeMs)) {
        this.reset(); this.diagnostics.rotated = true;
      }
      this.ino = info.ino; this.mtime = info.mtimeMs;
      if (!this.offset) { this.offset = header.bytes; this.line = 1; this.state = reduceEvent(this.state, { id: this.id + ':header', kind: 'task', cwd: header.row.payload.cwd }); }
      if (info.size === this.offset) return this.state;
      let start = this.offset, skipFirst = false;
      if (info.size - start > this.maxRead) {
        start = Math.max(header.bytes, info.size - this.maxRead); skipFirst = start > header.bytes;
        this.pending = ''; this.decoder = new StringDecoder('utf8'); this.diagnostics.truncated = true;
        this.state = createState(this.id); this.line = 1;
      }
      // Sole body I/O call, after checking scope and header on this same handle.
      if (!this.canRead(this.id)) return this.deny();
      const buf = Buffer.alloc(Math.max(0, info.size - start)); const { bytesRead } = await handle.read(buf, 0, buf.length, start);
      if (!this.canRead(this.id)) return this.deny();
      this.offset = start + bytesRead;
      let text = this.pending + this.decoder.write(buf.subarray(0, bytesRead));
      if (skipFirst) text = text.slice(text.indexOf('\n') + 1);
      const lines = text.split('\n'); this.pending = lines.pop() || '';
      for (const line of lines) {
        this.line++;
        if (!line.trim()) continue;
        try { for (const event of normalizeRecord(JSON.parse(line), this.id + ':' + this.line)) this.state = reduceEvent(this.state, event); }
        catch { this.diagnostics.malformed++; }
      }
      if (this.pending.length > 2 * 1024 * 1024) { this.pending = ''; this.diagnostics.truncated = true; }
      return this.state;
    } catch { return this.deny('Session file cannot be safely validated'); }
    finally { await handle?.close(); }
  }
  close() { this.reset(); }
}
