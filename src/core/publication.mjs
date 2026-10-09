/** All content leaves the service here, after checking its original dependencies. */
export class Publication {
  #objects = new WeakMap();
  constructor(access, selection) { this.access = access; this.selection = selection; this.sequence = 0; }
  seal(payload, { permits = [], ref = null, selectionRevision = this.selection() } = {}) {
    for (const p of permits) this.access.check(p);
    const context = Object.freeze({ permits: Object.freeze([...permits]), selectionRevision, revision: this.access.revision });
    const value = { ...payload, access: { authorityInstanceId: this.access.instanceId, policyRevision: context.revision, publicationSeq: ++this.sequence,
      selectionRevision, sessionRef: ref, dependencies: permits.map(p => p.dependency) } };
    this.#objects.set(value, context); return value;
  }
  valid(value) {
    const c = this.#objects.get(value);
    return !!c && !this.access.closed && c.revision === this.access.revision && c.selectionRevision === this.selection() && c.permits.every(p => this.access.valid(p));
  }
  context(value) { if (!this.valid(value)) throw new Error('Stale output; refresh and retry'); return this.#objects.get(value); }
  write(value, send) {
    this.context(value);
    const text = JSON.stringify(value);
    this.context(value); // no await between this barrier and the actual transport write
    return send(text);
  }
}
