import { readdir, open, stat } from 'node:fs/promises';
import path from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { createState, reduceEvent } from '../core/engine.mjs';
import { normalizeRecord } from './normalize.mjs';

/** Bounded metadata discovery. Never opens auth.json, configuration or arbitrary databases. */
export async function discoverSessions(codexHome, limit = 60) {
  const files = [];
  async function walk(dir, depth) {
    if (depth > 4 || files.length >= 300) return;
    let entries; try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    entries.sort((a, b) => b.name.localeCompare(a.name));
    for (const entry of entries) {
      if (files.length >= 300) break;
      const file = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) await walk(file, depth + 1);
      else if (entry.isFile() && entry.name.endsWith('.jsonl')) files.push(file);
    }
  }
  await walk(path.join(codexHome, 'sessions'), 0);
  const sessions = [];
  for (const file of files) {
    let handle;
    try {
      handle = await open(file, 'r'); const buf = Buffer.alloc(256 * 1024);
      const { bytesRead } = await handle.read(buf, 0, buf.length, 0);
      const first = buf.subarray(0, bytesRead).toString('utf8').split('\n')[0];
      const row = JSON.parse(first);
      if (row.type !== 'session_meta' || !row.payload?.id) continue;
      const info = await handle.stat();
      sessions.push({ id: row.payload.id, cwd: row.payload.cwd || '', path: file, updatedAt: info.mtime.toISOString(), version: row.payload.cli_version || null, title: path.basename(row.payload.cwd || file) });
    } catch { /* A partial/unreadable metadata line is not a session. */ }
    finally { await handle?.close(); }
  }
  return sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, limit);
}

export class LogSource {
  constructor(file, id, maxRead = 8 * 1024 * 1024) {
    this.file = file; this.id = id; this.maxRead = maxRead; this.offset = 0; this.pending = ''; this.decoder = new StringDecoder('utf8');
    this.state = createState(id); this.diagnostics = { malformed: 0, truncated: false, rotated: false }; this.line = 0;
  }
  async poll() {
    const info = await stat(this.file);
    if (info.size < this.offset || (this.ino !== undefined && this.ino !== info.ino) || (info.size === this.offset && this.mtime && this.mtime !== info.mtimeMs)) {
      this.offset = 0; this.pending = ''; this.decoder = new StringDecoder('utf8'); this.line = 0; this.state = createState(this.id); this.diagnostics.rotated = true;
    }
    this.ino = info.ino; this.mtime = info.mtimeMs;
    if (info.size === this.offset) return this.state;
    let start = this.offset, skipFirst = false;
    if (info.size - start > this.maxRead) {
      start = info.size - this.maxRead; skipFirst = true; this.pending = ''; this.decoder = new StringDecoder('utf8'); this.diagnostics.truncated = true;
      this.state = createState(this.id); this.line = 0;
    }
    const handle = await open(this.file, 'r');
    try {
      const buf = Buffer.alloc(info.size - start); const { bytesRead } = await handle.read(buf, 0, buf.length, start);
      this.offset = start + bytesRead;
      let text = this.pending + this.decoder.write(buf.subarray(0, bytesRead));
      if (skipFirst) text = text.slice(text.indexOf('\n') + 1);
      const lines = text.split('\n'); this.pending = lines.pop() || '';
      for (const line of lines) {
        this.line++;
        if (!line.trim()) continue;
        try {
          for (const event of normalizeRecord(JSON.parse(line), `${this.id}:${this.line}`)) this.state = reduceEvent(this.state, event);
        } catch { this.diagnostics.malformed++; }
      }
      if (this.pending.length > 2 * 1024 * 1024) { this.pending = ''; this.diagnostics.truncated = true; }
    } finally { await handle.close(); }
    return this.state;
  }
  close() {}
}
