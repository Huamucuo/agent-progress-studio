/** Product labels are user assertions. Only a separate explicit grant permits content. */
export const canonicalUuid = value => typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value) ? value.toLowerCase() : null;
export const sessionKey = value => canonicalUuid(value) || (typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value) ? value : null);
export const filenameSessionId = name => canonicalUuid(/^(?:rollout-(?:.+-)?)?([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\.jsonl$/i.exec(name)?.[1]);

export class SessionAccess {
  constructor(saved, legacy = {}) {
    this.entries = Object.create(null);
    const entries = saved === undefined ? Object.entries(legacy || {}).map(([id, origin]) => [id, { origin, bodyRead: false }])
      : saved?.version === 1 && saved.sessions && typeof saved.sessions === 'object' && !Array.isArray(saved.sessions) ? Object.entries(saved.sessions) : [];
    for (const [rawId, value] of entries) {
      const id = sessionKey(rawId);
      if (!id || !value || !['codex', 'work-local', 'unknown'].includes(value.origin)) continue;
      const entry = { origin: value.origin, bodyRead: !!canonicalUuid(id) && value.origin === 'codex' && value.bodyRead === true };
      const previous = this.entries[id];
      // Conflicting case aliases never gain access based on object insertion order.
      if (previous) {
        entry.origin = previous.origin === entry.origin ? entry.origin : [previous.origin, entry.origin].includes('work-local') ? 'work-local' : 'unknown';
        entry.bodyRead = entry.origin === 'codex' && previous.bodyRead && entry.bodyRead;
      }
      this.entries[id] = entry;
    }
  }
  origin(id) { return this.entries[sessionKey(id)]?.origin || 'unknown'; }
  canRead(id) { const key = canonicalUuid(id); return !!key && this.entries[key]?.origin === 'codex' && this.entries[key]?.bodyRead === true; }
  allowedIds() { return Object.keys(this.entries).filter(id => this.canRead(id)); }
  set(id, origin, bodyRead = false) {
    const key = sessionKey(id);
    if (!key || !['codex', 'work-local', 'unknown'].includes(origin) || (bodyRead && (!canonicalUuid(key) || origin !== 'codex'))) throw new Error('Invalid session scope');
    this.entries[key] = { origin, bodyRead: bodyRead === true };
  }
  toJSON() { return { version: 1, sessions: this.entries }; }
}
