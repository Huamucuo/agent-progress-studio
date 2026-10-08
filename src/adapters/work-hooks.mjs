import { lstat, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createState, reduceEvent } from '../core/engine.mjs';

const phases = { SessionStart: 'session_observed', UserPromptSubmit: 'prompt_observed', PostToolUse: 'tool_observed', Stop: 'stop_observed' };
const filenamePattern = /^\d{13}-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\.json$/;
export const validHookId = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value);
const fields = ['event_type', 'session_id', 'timestamp', 'turn_id'];
function validRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify(fields)
    && Object.hasOwn(phases, value.event_type) && validHookId(value.session_id)
    && (value.turn_id === null || validHookId(value.turn_id))
    && typeof value.timestamp === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value.timestamp)
    && Number.isFinite(Date.parse(value.timestamp));
}

/** Reads only the opt-in probe's four-field spool. Product origin is never inferred. */
export class WorkHookSource {
  constructor(directory, id = '') {
    this.directory = directory; this.id = id; this.state = createState(id); this.sessions = [];
    this.records = new Map(); this.received = false; this.error = null; this.diagnostics = {};
    this.startedAt = Date.now(); this.initial = true;
  }
  async poll() {
    let entries = [];
    this.error = null;
    try {
      const root = await lstat(this.directory);
      if (!root.isDirectory() || root.isSymbolicLink()) throw new Error('Invalid spool');
      entries = await readdir(this.directory, { withFileTypes: true });
    } catch (error) {
      if (error.code !== 'ENOENT') this.error = 'Hook event directory cannot be read safely';
    }
    const candidates = entries.filter(e => filenamePattern.test(e.name)).sort((a, b) => a.name.localeCompare(b.name)).slice(-10000);
    const present = new Set(candidates.map(e => e.name));
    for (const name of this.records.keys()) if (!present.has(name)) this.records.delete(name);
    let rejected = 0;
    for (const entry of candidates) {
      try {
        if (!entry.isFile() || entry.isSymbolicLink()) throw new Error('Not a regular file');
        const file = path.join(this.directory, entry.name), stat = await lstat(file);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024) throw new Error('Invalid record size or type');
        const signature = `${stat.size}:${stat.mtimeMs}`;
        if (this.records.get(entry.name)?.signature === signature) continue;
        const raw = await readFile(file);
        if (raw.length > 1024) throw new Error('Record grew');
        const record = JSON.parse(raw.toString('utf8'));
        if (!validRecord(record)) throw new Error('Unexpected fields');
        const receivedAt = new Date().toISOString(), timestamp = Date.parse(record.timestamp);
        const live = !this.initial && timestamp >= this.startedAt && timestamp <= Date.parse(receivedAt);
        this.records.set(entry.name, { signature, record, receivedAt, ingestDelayMs: live ? Date.parse(receivedAt) - timestamp : null });
      } catch {
        rejected++; this.records.delete(entry.name);
      }
    }
    this.initial = false;
    const records = [...this.records.entries()].sort((a, b) => a[1].record.timestamp.localeCompare(b[1].record.timestamp) || a[0].localeCompare(b[0]));
    const groups = new Map();
    for (const [, { record }] of records) {
      const previous = groups.get(record.session_id);
      groups.set(record.session_id, { id: record.session_id, updatedAt: record.timestamp, count: (previous?.count || 0) + 1, origin: 'unknown' });
    }
    this.sessions = [...groups.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
    if (!this.id && this.sessions.length) this.id = this.sessions[0].id;
    const selected = records.filter(([, value]) => value.record.session_id === this.id);
    this.received = selected.length > 0;
    this.state = createState(this.id);
    for (const [filename, { record, receivedAt, ingestDelayMs }] of selected.slice(-160)) {
      this.state = reduceEvent(this.state, { id: filename, kind: 'hook', name: record.event_type, at: record.timestamp,
        phase: phases[record.event_type], metadata: record, receivedAt, ingestDelayMs });
    }
    this.diagnostics = { received: selected.length, total: records.length, rejected, limitReached: entries.length >= 10000,
      lastIngestDelayMs: selected.map(([, value]) => value.ingestDelayMs).filter(value => value !== null).at(-1) ?? null };
    return this.state;
  }
  close() {}
}
