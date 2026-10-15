import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';

export const canonicalUuid = value => typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value) ? value.toLowerCase() : null;
export const sessionKey = value => canonicalUuid(value) || (typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value) ? value : null);
export const filenameSessionId = name => canonicalUuid(/^(?:rollout-(?:.+-)?)?([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\.jsonl$/i.exec(name)?.[1]);
export function sessionRef(backend, value) {
  const id = sessionKey(value);
  if (typeof backend !== 'string' || !/^(local:|rpc:|hooks:|demo:|cli:)/.test(backend) || backend.length > 4096 || !id || (backend.startsWith('local:') && !canonicalUuid(id))) throw new Error('Invalid session scope');
  return Object.freeze({ backend, id });
}
export const refKey = ref => JSON.stringify(sessionRef(ref.backend, ref.id));
const caps = ['content', 'evidence', 'observe', 'reply'];
const blank = () => ({ origin: 'unknown', content: { allowed: false, generation: 0 }, evidence: { allowed: false, generation: 0, root: null }, observe: { allowed: false, generation: 0 }, reply:{allowed:false,generation:0} });

/** Sole capability authority. Permits are opaque, instance-bound, and never renewed. */
export class SessionAccess extends EventEmitter {
  #permits = new WeakMap(); #entries = Object.create(null); #queue = Promise.resolve();
  constructor(saved, legacy = {}, store = null) {
    super(); this.instanceId = randomUUID(); this.store = store; this.revision = 0; this.closed = false; this.labels = Object.create(null);
    for (const [id, origin] of Object.entries(saved?.legacyLabels || {})) if (canonicalUuid(id) === id && ['codex', 'work-local', 'unknown'].includes(origin)) this.labels[id] = origin;
    if (saved?.version === 2 && Number.isSafeInteger(saved.revision) && saved.revision >= 0) {
      this.revision = saved.revision;
      for (const [key, value] of Object.entries(saved.entries || {})) {
        try {
          const ref = JSON.parse(key); if (refKey(ref) !== key || !['codex', 'work-local', 'unknown'].includes(value.origin)) continue;
          const entry = blank(); entry.origin = value.origin;
          for (const cap of caps) if (value[cap] && Number.isSafeInteger(value[cap].generation) && value[cap].generation >= 0) entry[cap] = { allowed: value[cap].allowed === true, generation: value[cap].generation, ...(cap === 'evidence' ? { root: typeof value[cap].root === 'string' ? value[cap].root : null } : {}) };
          if (entry.origin !== 'codex' || ref.backend.startsWith('hooks:')) entry.content.allowed = false;
          if(entry.origin!=='codex'||!entry.content.allowed||!ref.backend.startsWith('local:'))entry.reply.allowed=false;
          if (!entry.evidence.root) entry.evidence.allowed = false;
          this.#entries[key] = entry;
        } catch { /* corrupt or ambiguous policy entry denies access */ }
      }
    } else {
      const labels = saved?.version === 1 ? saved.sessions : saved === undefined ? Object.fromEntries(Object.entries(legacy).map(([id, origin]) => [id, { origin }])) : {};
      for (const [id, entry] of Object.entries(labels || {})) {
        const key = sessionKey(id); if (!key || !['codex', 'work-local', 'unknown'].includes(entry?.origin)) continue;
        this.labels[key] = this.labels[key] && this.labels[key] !== entry.origin ? 'work-local' : entry.origin;
      }
    }
    this.durableRevision = this.revision;
  }
  entry(ref) { return structuredClone(this.#entries[refKey(ref)] || { ...blank(), origin: ref.backend.startsWith('local:') ? this.labels[ref.id] || 'unknown' : 'unknown' }); }
  origin(ref) { return this.entry(ref).origin; }
  can(ref, capability, root) {
    try { const e = this.entry(ref); return !this.closed && caps.includes(capability) && e[capability].allowed && (capability !== 'content' || e.origin === 'codex') && (capability!=='reply'||(e.origin==='codex'&&e.content.allowed&&ref.backend.startsWith('local:'))) && (capability !== 'evidence' || (!!root && e.evidence.root === root)); } catch { return false; }
  }
  issue(ref, capability, root) {
    if (!this.can(ref, capability, root)) throw new Error('Access denied');
    const dependency = Object.freeze({ key: refKey(ref), capability, generation: this.entry(ref)[capability].generation, root: root || null });
    const permit = Object.freeze({ dependency }); this.#permits.set(permit, dependency); return permit;
  }
  valid(permit) { const dep = this.#permits.get(permit); return !!dep && this.validDependency(dep); }
  validDependency(dep) {
    try { const ref = JSON.parse(dep.key); return this.can(ref, dep.capability, dep.root) && this.entry(ref)[dep.capability].generation === dep.generation; } catch { return false; }
  }
  check(permit) { if (!this.valid(permit)) throw new Error('Access revoked or scope changed'); }
  list(backend) { return Object.keys(this.#entries).map(k => JSON.parse(k)).filter(r => r.backend === backend); }
  toJSON() { return { version: 2, revision: this.revision, entries: structuredClone(this.#entries), legacyLabels: { ...this.labels } }; }
  async change(ref, change, expectedRevision) {
    const key = refKey(ref);
    if (this.closed || expectedRevision !== this.revision) throw new Error('Stale policy revision; refresh and retry');
    if (change.origin !== undefined && !['codex', 'work-local', 'unknown'].includes(change.origin)) throw new Error('Invalid origin');
    const old = this.entry(ref), next = structuredClone(old);
    if (change.origin !== undefined) next.origin = change.origin;
    for (const cap of caps) if (change[cap] !== undefined) {
      if (typeof change[cap] !== 'boolean') throw new Error('Invalid capability');
      next[cap].allowed = change[cap]; next[cap].generation++;
    }
    if (change.root !== undefined) { if (typeof change.root !== 'string') throw new Error('Invalid evidence root'); next.evidence.root = change.root; }
    if (next.content.allowed && (next.origin !== 'codex' || ref.backend.startsWith('hooks:'))) throw new Error('Only confirmed Codex content can be granted');
    if(change.reply===true&&(next.origin!=='codex'||!next.content.allowed||!ref.backend.startsWith('local:')))throw Error('Reply requires confirmed local Codex content');
    if(change.content===false||(change.origin!==undefined&&change.origin!==old.origin)){next.reply.allowed=change.reply===true&&change.content!==false;next.reply.generation++;}
    if (next.evidence.allowed && !next.evidence.root) throw new Error('Explicit workspace required');
    const restrictive = caps.some(c => change[c] === false) || (change.origin !== undefined && change.origin !== old.origin);
    if (change.origin !== undefined && change.origin !== old.origin) { next.content.generation++; if (change.content !== true) next.content.allowed = false; }
    const revision = ++this.revision;
    if (restrictive) {
      const barrier = structuredClone(next);
      for (const c of caps) if (change[c] === true) barrier[c].allowed = false;
      this.#entries[key] = barrier; this.emit('invalidate', { revision, ref });
    }
    const commit = async () => {
      if (this.revision !== revision) throw new Error('Stale policy transaction');
      const saved = this.toJSON(); saved.entries[key] = next;
      let file;
      try {
        if (this.store) file = await this.store.stage(saved);
        if (this.revision !== revision) throw new Error('Stale policy transaction');
        if (file) { await this.store.commit(file); file = null; }
        // Revokes can arrive during the OS rename; the immediate deny barrier and
        // dirty-run marker prevent an older disk grant being trusted after a crash.
        if (this.revision !== revision) throw new Error('Stale policy transaction');
        this.#entries[key] = next; this.durableRevision = revision; this.emit('invalidate', { revision, ref }); return this.entry(ref);
      } catch (e) { if (this.store) this.store.failed = true; throw e; }
      finally { if (file) await this.store.discard(file); }
    };
    const result = this.#queue.then(commit); this.#queue = result.catch(() => {}); return result;
  }
  async close() { if (this.closed) return; this.closed = true; this.emit('invalidate', { revision: this.revision }); await this.#queue; await this.store?.close(this.durableRevision === this.revision); this.removeAllListeners(); }
}
