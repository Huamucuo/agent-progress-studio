import { lstat, readdir, open } from 'node:fs/promises';
import path from 'node:path';
import { createState, reduceEvent } from '../core/engine.mjs';
import { sessionKey } from '../core/session-access.mjs';
import { ResourceRegistry, canonicalPath, within } from '../core/resource-registry.mjs';
const folded = value => process.platform === 'win32' ? value.toLowerCase() : value;
const sameIdentity = (a, b) => a.dev === b.dev && a.ino === b.ino;

const phases = { SessionStart: 'session_observed', UserPromptSubmit: 'prompt_observed', PreToolUse: 'tool_start_observed', PostToolUse: 'tool_observed', Stop: 'stop_observed' };
const filenamePattern = /^\d{13}-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\.json$/;
export const validHookId = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value);
const fields = ['event_type', 'session_id', 'timestamp', 'turn_id'];
const toolFields = ['event_type', 'session_id', 'timestamp', 'tool_name', 'tool_status', 'turn_id'];
function validRecord(value) {
  const keys = value && typeof value === 'object' ? JSON.stringify(Object.keys(value).sort()) : '';
  const metadataOnly = keys === JSON.stringify(fields);
  const toolMetadata = keys === JSON.stringify(toolFields) && ['PreToolUse', 'PostToolUse'].includes(value.event_type)
    && (value.tool_name === null || (typeof value.tool_name === 'string' && /^[A-Za-z][A-Za-z0-9_.:/-]{0,159}$/.test(value.tool_name)))
    && (value.event_type === 'PreToolUse' ? value.tool_status === 'started' : ['succeeded', 'failed', 'unknown'].includes(value.tool_status));
  return value && typeof value === 'object' && !Array.isArray(value)
    && (metadataOnly || toolMetadata)
    && Object.hasOwn(phases, value.event_type) && validHookId(value.session_id)
    && (value.turn_id === null || validHookId(value.turn_id))
    && typeof value.timestamp === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value.timestamp)
    && Number.isFinite(Date.parse(value.timestamp));
}

/** Reads only the opt-in probe's metadata allowlist. Product origin is never inferred. */
export class WorkHookSource {
  constructor(directory, id = '', { access, ref, registry = new ResourceRegistry({ hooksDir: directory }) } = {}) {
    if (!(registry instanceof ResourceRegistry)) throw new Error('Resource registry required');
    this.access = access; this.ref = ref; this.registry = registry;
    this.directory = directory; this.id = id; this.state = createState(id); this.sessions = [];
    this.records = new Map(); this.received = false; this.error = null; this.diagnostics = {};
    this.startedAt = Date.now(); this.initial = true; this.pollRevision = 0;
  }
  async poll() {
    if (this.access && !this.access.can(this.ref, 'observe')) { this.close(); this.error = 'Hook observation revoked'; return this.state; }
    // A permit belongs to this run; close, regrant, or a newer run cannot renew it.
    const revision = ++this.pollRevision, permit = this.access?.issue(this.ref, 'observe');
    const valid = () => {
      if (revision !== this.pollRevision) throw new Error('Hook poll superseded or closed');
      if (this.access) this.access.check(permit);
    };
    const cacheValid = !this.access || (this.permit && this.access.valid(this.permit));
    const recordsByName = new Map(cacheValid ? this.records : []), initial = this.initial;
    let entries = [], directory, root, error = null;
    const validDirectory = async () => {
      valid(); const current = await lstat(this.directory); valid();
      if (!current.isDirectory() || current.isSymbolicLink() || !sameIdentity(root, current)) throw new Error('Spool identity changed');
      const canonical = await canonicalPath(this.directory); valid();
      if (canonical !== directory) throw new Error('Spool alias changed');
    };
    try {
      valid(); root = await lstat(this.directory); valid();
      if (!root.isDirectory() || root.isSymbolicLink()) throw new Error('Invalid spool');
      directory = await canonicalPath(this.directory); valid();
      if (directory !== folded(path.resolve(this.directory)) || (this.access && this.ref.backend !== 'hooks:' + directory)) throw new Error('Spool scope or alias mismatch');
      // A hook directory is its own metadata scope, never a Codex body store.
      for (const home of this.registry.homes) for (const name of ['sessions', 'archived_sessions']) {
        const store = await canonicalPath(path.join(home, name), true); valid();
        if (within(store, directory) || within(directory, store)) throw new Error('Spool overlaps protected session store');
      }
      await validDirectory(); entries = await readdir(directory, { withFileTypes: true }); valid(); await validDirectory();
    } catch (failure) {
      valid();
      if (failure.code !== 'ENOENT') error = 'Hook event directory cannot be read safely';
    }
    const candidates = entries.filter(e => filenamePattern.test(e.name)).sort((a, b) => a.name.localeCompare(b.name)).slice(-10000);
    const present = new Set(candidates.map(e => e.name));
    for (const name of recordsByName.keys()) if (!present.has(name)) recordsByName.delete(name);
    let rejected = 0;
    for (const entry of candidates) {
      try {
        valid();
        if (!entry.isFile() || entry.isSymbolicLink()) throw new Error('Not a regular file');
        const named = await this.registry.regular(directory, entry.name, { log: true }); valid();
        const stat = named.info;
        if (stat.size > 1024) throw new Error('Invalid record size');
        await validDirectory();
        const signature = [stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs].join(':');
        if (recordsByName.get(entry.name)?.signature === signature) continue;
        valid(); const handle = await open(named.file, 'r'); let raw;
        try {
          valid(); const actual = await handle.stat(); valid();
          if (!sameIdentity(stat, actual) || !actual.isFile() || actual.nlink > 1 || actual.size !== stat.size || actual.size > 1024) throw new Error('Record identity changed');
          await validDirectory(); valid();
          const data = Buffer.alloc(actual.size + 1), { bytesRead } = await handle.read(data, 0, data.length, 0); valid();
          if (bytesRead !== actual.size) throw new Error('Record changed during read');
          const final = await handle.stat(); valid();
          if (!sameIdentity(actual, final) || final.nlink > 1 || final.size !== actual.size || final.mtimeMs !== actual.mtimeMs || final.ctimeMs !== actual.ctimeMs) throw new Error('Record changed during read');
          await validDirectory(); raw = data.subarray(0, bytesRead);
        } finally { await handle.close(); }
        valid(); const record = JSON.parse(raw.toString('utf8'));
        if (!validRecord(record)) throw new Error('Unexpected fields');
        record.session_id = sessionKey(record.session_id);
        const receivedAt = new Date().toISOString(), timestamp = Date.parse(record.timestamp);
        const live = !initial && timestamp >= this.startedAt && timestamp <= Date.parse(receivedAt);
        recordsByName.set(entry.name, { signature, record, receivedAt, ingestDelayMs: live ? Date.parse(receivedAt) - timestamp : null });
      } catch {
        valid(); rejected++; recordsByName.delete(entry.name);
      }
    }
    valid();
    const records = [...recordsByName.entries()].sort((a, b) => a[1].record.timestamp.localeCompare(b[1].record.timestamp) || a[0].localeCompare(b[0]));
    const groups = new Map();
    for (const [, { record }] of records) {
      const previous = groups.get(record.session_id);
      groups.set(record.session_id, { id: record.session_id, updatedAt: record.timestamp, count: (previous?.count || 0) + 1, origin: 'unknown' });
    }
    const sessions = [...groups.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
    const id = this.id || sessions[0]?.id || '', selected = records.filter(([, value]) => value.record.session_id === id);
    let state = createState(id);
    for (const [filename, { record, receivedAt, ingestDelayMs }] of selected.slice(-160)) {
      state = reduceEvent(state, { id: filename, kind: 'hook', name: record.event_type, at: record.timestamp,
        phase: phases[record.event_type], metadata: record, receivedAt, ingestDelayMs });
    }
    const diagnostics = { received: selected.length, total: records.length, rejected, limitReached: entries.length >= 10000,
      lastIngestDelayMs: selected.map(([, value]) => value.ingestDelayMs).filter(value => value !== null).at(-1) ?? null };
    valid();
    this.permit = permit; this.records = recordsByName; this.initial = false; this.id = id;
    this.sessions = sessions; this.received = selected.length > 0; this.state = state; this.error = error; this.diagnostics = diagnostics;
    return state;
  }
  close() { this.pollRevision++; this.records.clear(); this.sessions = []; this.state = createState(this.id); this.received = false; this.permit = null; this.initial = true; this.error = null; this.diagnostics = {}; }
}
