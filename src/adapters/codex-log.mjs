import { readdir, lstat } from 'node:fs/promises';
import { DataGateway } from '../collectors/data-gateway.mjs';
import path from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { createState, reduceEvent } from '../core/engine.mjs';
import { canonicalUuid, filenameSessionId } from '../core/session-access.mjs';
import { normalizeRecord } from './normalize.mjs';

/** Filename/stat discovery only. Even an empty exclusion set never opens logs. */
export async function discoverSessions(codexHome, limit = 60, excludedIds = new Set(), priorityId) {
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
  await walk(path.join(codexHome, 'archived_sessions'), 0);
  // A selected old task can still be active after newer directories exhaust
  // ordinary discovery. Resolve only its filename, never its body. Scan both
  // stores to reject duplicate UUID aliases; an incomplete scan defaults deny.
  const priority=canonicalUuid(priorityId),matches=[];let examined=0,incomplete=false;
  async function locate(dir,depth){
    if(incomplete)return;if(depth>4){incomplete=true;return;}
    let entries;try{entries=await readdir(dir,{withFileTypes:true});}catch(e){if(e.code!=='ENOENT')incomplete=true;return;}
    for(const entry of entries){
      if(++examined>10000){incomplete=true;return;}
      if(entry.isSymbolicLink())continue;
      const file=path.join(dir,entry.name);
      if(entry.isDirectory())await locate(file,depth+1);
      else if(entry.isFile()&&filenameSessionId(entry.name)===priority)matches.push({id:priority,path:file});
      if(incomplete)return;
    }
  }
  if(priority&&!excluded.has(priority)){
    await locate(path.join(codexHome,'sessions'),0);await locate(path.join(codexHome,'archived_sessions'),0);
    for(let i=files.length-1;i>=0;i--)if(files[i].id===priority)files.splice(i,1);
    if(!incomplete&&matches.length===1)files.push(matches[0]);
  }
  const sessions = [];
  for (const file of files) {
    try {
      const info = await lstat(file.path);
      if (info.isFile() && !info.isSymbolicLink()) sessions.push({ ...file, cwd: '', updatedAt: info.mtime.toISOString(), version: null, title: file.id });
    } catch { /* Removed candidates contain no readable state. */ }
  }
  const counts = new Map(); for (const s of sessions) counts.set(s.id, (counts.get(s.id) || 0) + 1);
  const unique=sessions.filter(s=>counts.get(s.id)===1).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)),recent=unique.slice(0,limit),selected=priority&&unique.find(s=>s.id===priority);
  if(selected&&!recent.some(s=>s.id===priority))recent.push(selected);
  return recent;
}

export class LogSource {
  constructor(file, id, maxRead = 8 * 1024 * 1024, { gateway, ref } = {}) {
    this.file = file; this.id = canonicalUuid(id) || id; this.maxRead = maxRead; this.gateway = gateway; this.ref = ref;
    this.diagnostics = { malformed: 0, truncated: false, rotated: false }; this.reset();
  }
  reset() {
    this.offset = 0; this.pending = ''; this.decoder = new StringDecoder('utf8'); this.line = 0;
    this.state = createState(this.id); this.ino = undefined; this.mtime = undefined; this.permit = null;
  }
  deny(reason = 'Session content is not authorized') {
    this.reset(); this.error = reason; this.diagnostics.accessDenied = true; return this.state;
  }
  async poll() {
    if (!(this.gateway instanceof DataGateway) || !this.ref || !this.gateway.access.can(this.ref, 'content')) return this.deny();
    let handle;
    try {
      handle = await this.gateway.openLog(this.ref, this.file);
      const info = handle.info, header = { row: handle.header, bytes: handle.headerBytes };
      if (this.permit && !this.gateway.access.valid(this.permit)) this.reset();
      this.error = null; this.diagnostics.accessDenied = false;
      if (info.size < this.offset || (this.ino !== undefined && this.ino !== info.ino) || (info.size === this.offset && this.mtime && this.mtime !== info.mtimeMs)) {
        this.reset(); this.diagnostics.rotated = true;
      }
      this.permit = handle.permit; this.ino = info.ino; this.mtime = info.mtimeMs;
      if (!this.offset) { this.offset = header.bytes; this.line = 1; this.state = reduceEvent(this.state, { id: this.id + ':header', kind: 'task', cwd: header.row.payload.cwd }); }
      if (info.size === this.offset) return this.state;
      let start = this.offset, skipFirst = false;
      if (info.size - start > this.maxRead) {
        start = Math.max(header.bytes, info.size - this.maxRead); skipFirst = start > header.bytes;
        this.pending = ''; this.decoder = new StringDecoder('utf8'); this.diagnostics.truncated = true;
        this.state = createState(this.id); this.line = 1;
      }
      const buf = await handle.read(start, Math.max(0, info.size - start)), bytesRead = buf.length;
      this.gateway.access.check(handle.permit); this.offset = start + bytesRead;
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
