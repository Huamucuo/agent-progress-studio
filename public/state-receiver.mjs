/** A single lifecycle gate for bootstrap, SSE, control, detail and downloads. */
export class StateReceiver {
  constructor(clock = () => Date.now()) { this.clock = clock; this.generation = 0; this.requestSeq = 0; this.latest = new Map(); this.ready = false; this.freshnessMs = 10000; }
  invalidate() { this.generation++; this.ready = false; this.latest.clear(); }
  begin() { this.invalidate(); return this.ticket('bootstrap'); }
  ticket(kind) {
    const ticket = Object.freeze({ generation: this.generation, kind, request: ++this.requestSeq, instance: this.instance, revision: this.revision, selection: this.selection });
    if (kind !== 'snapshot') this.latest.set(kind, ticket.request); return ticket;
  }
  isCurrent(ticket) { return ticket?.generation === this.generation; }
  bootstrap(value, ticket) {
    const a = value?.access;
    if (!this.isCurrent(ticket) || this.latest.get('bootstrap') !== ticket.request || !this.validMeta(a)) return false;
    this.instance = a.authorityInstanceId; this.revision = a.policyRevision; this.selection = a.selectionRevision; this.sequence = -1;
    this.ready = true; this.lastAuthority = this.clock(); this.freshnessMs = Math.min(10000, Math.max(1000, value.freshnessMs || 10000)); return true;
  }
  validMeta(a) { return a && typeof a.authorityInstanceId === 'string' && ['policyRevision', 'publicationSeq', 'selectionRevision'].every(k => Number.isSafeInteger(a[k]) && a[k] >= 0) && Array.isArray(a.dependencies); }
  fresh() { return this.ready && this.clock() - this.lastAuthority <= this.freshnessMs && this.clock() >= this.lastAuthority; }
  accept(value, ticket) {
    const a = value?.access;
    if (!this.isCurrent(ticket) || !this.fresh() || !this.validMeta(a) || a.authorityInstanceId !== this.instance || a.policyRevision < this.revision || a.selectionRevision < this.selection) return false;
    if (ticket.kind === 'detail' || ticket.kind === 'export' || ticket.kind === 'sessions') {
      // Global snapshot sequence is irrelevant to an independent same-scope result.
      if (ticket.instance !== this.instance || ticket.revision !== this.revision || ticket.selection !== this.selection || a.policyRevision !== this.revision || a.selectionRevision !== this.selection || this.latest.get(ticket.kind) !== ticket.request) return false;
    } else {
      if (a.publicationSeq <= this.sequence) return ticket.kind === 'control' && this.latest.get('control') === ticket.request && a.policyRevision === this.revision && a.selectionRevision === this.selection;
      this.revision = a.policyRevision; this.selection = a.selectionRevision; this.sequence = a.publicationSeq;
    }
    this.lastAuthority = this.clock(); return true;
  }
  heartbeat(value, ticket) {
    if (!this.isCurrent(ticket) || !this.fresh() || value.authorityInstanceId !== this.instance || value.policyRevision !== this.revision || value.selectionRevision !== this.selection) return false;
    this.lastAuthority = this.clock(); return true;
  }
}
