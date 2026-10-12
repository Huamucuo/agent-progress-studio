import { readFile, lstat } from 'node:fs/promises';
import path from 'node:path';
import { homedir } from 'node:os';
import { EventEmitter } from 'node:events';
import { createState, safeText, monitorTask, progressSummary } from './core/engine.mjs';
import { evaluateAcceptance } from './core/acceptance.mjs';
import { discoverSessions, LogSource } from './adapters/codex-log.mjs';
import { AppServerSource, validateEndpoint } from './adapters/app-server.mjs';
import { DemoSource } from './adapters/demo.mjs';
import { WorkHookSource, validHookId } from './adapters/work-hooks.mjs';
import { SessionAccess, sessionRef, sessionKey, canonicalUuid, refKey } from './core/session-access.mjs';
import { AccessStore } from './core/access-store.mjs';
import { ResourceRegistry, canonicalPath } from './core/resource-registry.mjs';
import { DataGateway } from './collectors/data-gateway.mjs';
import { Publication } from './core/publication.mjs';
import { collectEvidence, emptyEvidence, digest, readEvidence } from './collectors/evidence.mjs';
import { VERSION } from './version.mjs';

export class StudioService extends EventEmitter {
  constructor(options) {
    super(); this.options = options; this.codexHome = options.codexHome || process.env.CODEX_HOME || path.join(homedir(), '.codex'); this.dataDir = path.resolve(options.dataDir);
    this.workHooksDir = options.workHooksDir || path.join(this.dataDir, 'work-hooks', 'events');
    this.mode = options.mode || 'local'; this.queue = Promise.resolve(); this.sessions = []; this.selectionRevision = 0; this.closed = false;
    this.registry = new ResourceRegistry({ codexHomes: [this.codexHome], dataDir: this.dataDir, hooksDir: this.workHooksDir });
  }
  run(action) { const result = this.queue.then(() => { if (this.closed) throw new Error('Service closed'); return action(); }); this.queue = result.catch(() => {}); return result; }
  capture() { return { revision: this.access.revision, selection: this.selectionRevision }; }
  checkScope(c) { if (c.revision !== this.access.revision || c.selection !== this.selectionRevision) throw new Error('Request scope changed; retry'); }
  async init() {
    this.localBackend = 'local:' + await canonicalPath(this.codexHome, true); this.hookBackend = 'hooks:' + await canonicalPath(this.workHooksDir, true);
    this.store = new AccessStore(this.dataDir); const saved = await this.store.open(); let legacy = {};
    // Legacy labels are metadata; legacy mixed reviews are deliberately not opened.
    if (saved === undefined) try { legacy = JSON.parse(await readFile(path.join(this.dataDir, 'hook-origins.json'), 'utf8')); } catch { /* labels remain unknown */ }
    this.access = new SessionAccess(saved, legacy, this.store); this.gateway = new DataGateway(this.access, this.registry);
    this.publication = new Publication(this.access, () => this.selectionRevision);
    this.legacyReviews = await lstat(path.join(this.dataDir, 'reviews.json')).then(() => true, () => false);
    this.access.on('invalidate', () => {
      this.snapshot = null; this.evidence = emptyEvidence(); this.evidenceContext = null; this.workspace = null; this.reviewKey = null; this.reviews = {};
      if (this.source instanceof LogSource) this.source.reset();
      if (this.source instanceof WorkHookSource && !this.access.can(sessionRef(this.hookBackend, 'scope'), 'observe')) this.source.close();
      this.emit('invalidate', { authorityInstanceId: this.access.instanceId, policyRevision: this.access.revision });
    });
    await this.select({ mode: this.mode });
  }
  currentRef() {
    const id = this.mode === 'work-hooks' ? this.source?.id : this.mode === 'app-server' ? this.source?.threadId : this.selected?.id;
    return id ? sessionRef(this.mode === 'app-server' ? this.source.backend : this.mode === 'work-hooks' ? this.hookBackend : this.localBackend, id) : null;
  }
  publicSession(s, backend = this.localBackend) { const ref = sessionRef(backend, s.id); return { id: s.id, title: s.id, cwd: '', updatedAt: s.updatedAt, origin: this.access.origin(ref), bodyRead: this.access.can(ref, 'content'), current: s.id === canonicalUuid(process.env.CODEX_THREAD_ID), sessionRef: ref }; }
  async discover() {
    const excluded = new Set([...Object.entries(this.access.labels).filter(([, origin]) => origin === 'work-local').map(([id]) => id), ...this.access.list(this.localBackend).filter(ref => this.access.origin(ref) === 'work-local').map(ref => ref.id)]);
    this.sessions = await discoverSessions(this.codexHome, 60, excluded); return this.sessions.map(s => this.publicSession(s));
  }
  logSource(selected) { return new LogSource(selected.path, selected.id, undefined, { gateway: this.gateway, ref: sessionRef(this.localBackend, selected.id) }); }
  select(config) {
    // Invalidate pending outputs immediately, before waiting for the poll queue.
    const selection = ++this.selectionRevision; this.snapshot = null; this.emit('invalidate', { authorityInstanceId: this.access.instanceId, policyRevision: this.access.revision, selectionRevision: selection });
    this.source?.disconnect?.();
    return this.run(async () => {
      if (selection !== this.selectionRevision) throw new Error('Selection superseded');
      let next, selected;
      if (config.mode === 'demo') {
        if (config.scenario && !['showcase', 'no-plan'].includes(config.scenario)) throw new Error('Unknown demo scenario'); next = new DemoSource(config.scenario);
        const ref = sessionRef('demo:fixtures', next.scenario); if (!this.access.can(ref, 'observe')) await this.access.change(ref, { observe: true }, this.access.revision);
      }
      else if (config.mode === 'local') {
        await this.discover(); selected = config.id ? this.sessions.find(s => s.id === canonicalUuid(config.id)) : this.sessions.find(s => s.id === canonicalUuid(process.env.CODEX_THREAD_ID)) || this.sessions[0];
        if (config.id && !selected) throw new Error('Session no longer available; refresh discovery'); if (selected) next = this.logSource(selected);
      } else if (config.mode === 'work-hooks') {
        if (config.id !== undefined && !validHookId(config.id)) throw new Error('Invalid Hook session ID');
        const scope = sessionRef(this.hookBackend, 'scope');
        // Selecting the installed opt-in metadata adapter explicitly enables observation.
        if (!this.access.can(scope, 'observe')) await this.access.change(scope, { observe: true }, this.access.revision);
        next = new WorkHookSource(this.workHooksDir, sessionKey(config.id) || '', { access: this.access, ref: scope, registry: this.registry });
        await next.poll(); if (config.id && !next.received) { next.close(); throw new Error('Hook session no longer available'); }
      } else if (config.mode === 'app-server') {
        next = new AppServerSource(validateEndpoint(config.endpoint), { access: this.access, experimentalApi: config.experimentalApi === true });
        const candidates = await next.connect(); selected = candidates.find(s => s.id === sessionKey(config.id || process.env.CODEX_THREAD_ID)) || (!config.id && candidates[0]);
        if (config.id && !selected) { next.close(); throw new Error('Unknown RPC candidate'); }
        if (selected) await next.select(selected.id);
      } else throw new Error('Unknown source mode');
      if (selection !== this.selectionRevision) { next?.close(); throw new Error('Selection superseded'); }
      this.source?.close(); this.source = next; this.mode = config.mode; this.selected = selected; this.error = null; return this.refreshInternal();
    });
  }
  refresh() { const c = this.capture(); return this.run(() => { this.checkScope(c); return this.refreshInternal(); }); }
  async refreshInternal({ advance = false } = {}) {
    const revision = this.access.revision, selection = this.selectionRevision; await this.discover();
    if (this.mode === 'local') {
      if (this.selected && !this.sessions.some(s => s.id === this.selected.id && s.path === this.selected.path)) { this.source?.close(); this.source = null; this.error = 'Selected session unavailable or excluded'; }
      if (!this.source && !this.selected && this.sessions.length) { this.selected = this.sessions.find(s => s.id === canonicalUuid(process.env.CODEX_THREAD_ID)) || this.sessions[0]; this.source = this.logSource(this.selected); }
    }
    let task = this.source?.state || createState(this.selected?.id), permits = [];
    try { if (this.mode !== 'demo' || advance) task = await this.source?.poll() || task; if (this.source) this.error = this.source.error || null; }
    catch { this.error = 'Source unavailable or scope changed'; this.source?.deny?.(); task = this.source?.state || createState(this.selected?.id); }
    if (selection !== this.selectionRevision || revision !== this.access.revision) throw new Error('Refresh scope changed; retry');
    const ref = this.currentRef();
    const content = ['local', 'app-server'].includes(this.mode) && this.source?.permit && this.access.valid(this.source.permit) && !this.error;
    if (content) permits.push(this.source.permit);
    else if (['local', 'app-server'].includes(this.mode)) task = createState(ref?.id || this.selected?.id);
    if (this.mode === 'work-hooks') {
      if (this.source?.permit && this.access.valid(this.source.permit)) permits.push(this.source.permit);
      else task = createState(ref?.id);
    }
    this.evidence = emptyEvidence(); this.evidenceContext = null; this.workspace = null; this.reviews = {};
    const candidateRoot = this.options.workspace || (content ? task.cwd : null);
    if (this.mode === 'demo') {
      this.evidence = this.source.evidence(); this.reviewKey = this.source.scenario;
      this.evidenceContext = this.gateway.demo(sessionRef('demo:fixtures', this.source.scenario));
      this.reviews = (await this.gateway.reviewRead(this.evidenceContext, this.dataDir))[this.reviewKey] || {};
      permits.push(...this.evidenceContext.permits);
    } else if (ref && candidateRoot) {
      try {
        const root = await this.registry.workspace(candidateRoot);
        if (this.access.can(ref, 'evidence', root)) {
          this.evidenceContext = await this.gateway.evidence(ref, root, this.options.workspace ? [] : permits.filter(p => p.dependency.capability === 'content'));
          this.evidence = await collectEvidence(root, { context: this.evidenceContext }); this.workspace = root;
          permits.push(...this.evidenceContext.permits); this.reviewKey = digest(this.evidence.manifestHash || '');
          this.reviews = (await this.gateway.reviewRead(this.evidenceContext, this.dataDir))[this.reviewKey] || {};
        }
      } catch { this.evidence = emptyEvidence(['Evidence unavailable or access denied']); this.evidenceContext = null; this.workspace = null; }
    }
    if (selection !== this.selectionRevision || revision !== this.access.revision) throw new Error('Refresh scope changed; retry');
    permits = [...new Set(permits)]; for (const p of permits) this.access.check(p);
    const acceptance = evaluateAcceptance(this.evidence.manifest, this.evidence, this.reviews);
    const connected = !!this.source && !this.error && (this.mode !== 'work-hooks' || this.source.received);
    const sessions = this.mode === 'work-hooks' ? this.source.sessions.map(s => this.publicSession(s, this.hookBackend)) : this.mode === 'app-server' ? this.source.sessions.map(s => this.publicSession(s, this.source.backend)) : this.mode === 'local' ? this.sessions.map(s => this.publicSession(s)) : [];
    const snapshot = { schemaVersion: 1, version: VERSION, observedAt: new Date().toISOString(),
      source: { mode: this.mode, connected, error: this.error, label: this.mode === 'demo' ? 'SIMULATED' : this.mode === 'work-hooks' ? 'Local lifecycle Hooks · metadata only' : this.mode === 'local' ? 'Codex JSONL · best effort' : 'Codex app-server · authorized history polling',
        origin: this.mode === 'demo' ? 'simulated' : ref ? this.access.origin(ref) : 'unknown', attribution: this.mode === 'demo' ? 'adapter' : ref && this.access.origin(ref) !== 'unknown' ? 'user-confirmed' : 'unconfirmed',
        contentAccess: { granted: !!ref && this.access.can(ref, 'content'), readable: !!content }, evidenceAccess: { granted: !!this.evidenceContext, candidateRoot: candidateRoot || null },
        endpoint: this.mode === 'app-server' ? this.source?.endpoint : null, diagnostics: { ...this.source?.diagnostics, ...(this.legacyReviews ? { legacyReviews: 'PENDING_EXPLICIT_MIGRATION' } : {}) },
        capabilities: { history: !!content || this.mode === 'demo', notifications: (this.source?.diagnostics?.notificationsReceived || 0) > 0, approvals: false }, selection: ref ? 'selected-session' : 'none' },
      sessions, localSessions: this.sessions.map(s => this.publicSession(s)), hookSessions: this.mode === 'work-hooks' ? sessions : [], workspace: this.workspace, task, acceptance, evidence: this.evidence,
      monitor: monitorTask(task, { connected, mode: this.mode }), progress: progressSummary(task, acceptance), replay: this.mode === 'demo' ? { index: this.source.index, playing: this.source.playing, total: 9, scenario: this.source.scenario } : null };
    this.snapshot = this.publication.seal(snapshot, { permits, ref, selectionRevision: selection }); this.emit('snapshot', this.snapshot); return this.snapshot;
  }
  tick() { return this.run(() => this.refreshInternal({ advance: true })); }
  async sessionAccess(input) {
    const ref = input.sessionRef ? sessionRef(input.sessionRef.backend, input.sessionRef.id) : this.currentRef();
    if (!ref || (input.sessionId && sessionKey(input.sessionId) !== ref.id)) throw new Error('Invalid selected session scope');
    const expected = input.expectedPolicyRevision ?? this.access.revision;
    if (input.decision === 'allow-codex') {
      const known = ref.backend === this.localBackend ? this.sessions.some(s => s.id === ref.id) : this.source instanceof AppServerSource && ref.backend === this.source.backend && this.source.sessions.some(s => s.id === ref.id);
      if (!known || this.access.origin(ref) === 'work-local') throw new Error('Only a discovered, user-confirmed Codex session can be authorized');
      await this.access.change(ref, { origin: 'codex', content: true }, expected);
    } else if (input.decision === 'revoke') await this.access.change(ref, { content: false }, expected);
    else if (input.decision === 'allow-evidence') {
      if (this.access.origin(ref) !== 'codex' || !this.currentRef() || refKey(ref) !== refKey(this.currentRef())) throw new Error('Confirm the selected Codex source first');
      const root = await this.registry.workspace(input.root);
      await this.access.change(ref, { evidence: true, root }, expected);
    } else if (input.decision === 'revoke-evidence') await this.access.change(ref, { evidence: false }, expected);
    else if (input.decision === 'revoke-observation') {
      if (ref.backend !== this.hookBackend) throw new Error('Not a Hook scope');
      await this.access.change(sessionRef(this.hookBackend, 'scope'), { observe: false }, expected);
    } else throw new Error('Invalid access decision');
    return this.refresh();
  }
  async attributeHook(input) {
    if (this.mode !== 'work-hooks' || !validHookId(input.sessionId) || !this.source.sessions.some(s => s.id === sessionKey(input.sessionId))) throw new Error('Unknown Hook session');
    await this.access.change(sessionRef(this.hookBackend, input.sessionId), { origin: input.origin, content: false }, input.expectedPolicyRevision ?? this.access.revision);
    return this.refresh();
  }
  demo(action) { const scope = this.capture(); return this.run(async () => { this.checkScope(scope); if (this.mode !== 'demo') throw new Error('Select demo first'); this.source.control(action); return this.refreshInternal(); }); }
  review(input) { const scope = this.capture(); return this.run(async () => {
    this.checkScope(scope);
    const s = await this.refreshInternal(); this.publication.context(s);
    const c = s.acceptance.criteria.find(c => c.id === input.criterionId);
    if (!c?.requiresHuman || !['accept', 'reject', 'clear'].includes(input.decision)) throw new Error('Invalid human review');
    if (!this.evidence.fingerprint || input.fingerprint !== this.evidence.fingerprint || input.manifestHash !== this.evidence.manifestHash) throw new Error('Evidence changed; reopen the criterion');
    if (input.decision === 'accept' && !(c.automated || (!(c.checks || []).length && c.implemented))) throw new Error('Required evidence is not ready');
    const reviews = { ...this.reviews };
    if (input.decision === 'clear') delete reviews[c.id]; else reviews[c.id] = { decision: input.decision, note: safeText(input.note, 2000), at: new Date().toISOString(), fingerprint: this.evidence.fingerprint, manifestHash: this.evidence.manifestHash };
    const all = await this.gateway.reviewRead(this.evidenceContext, this.dataDir); this.publication.context(s); await this.gateway.reviewWrite(this.evidenceContext, this.dataDir, { ...all, [this.reviewKey]: reviews });
    return this.refreshInternal();
  }); }
  detail(kind, id) { const scope = this.capture(); return this.run(async () => {
    this.checkScope(scope);
    const s = await this.refreshInternal(), captured = this.publication.context(s); let text;
    if (this.mode === 'demo') {
      if (kind === 'diff') text = this.evidence.git.diff;
      else if (kind === 'report') text = JSON.stringify(this.evidence.report, null, 2);
      else if (kind === 'file' && this.evidence.files.includes(id)) text = `SIMULATED EVIDENCE\n${id}\nThis fixture is not a read of your workspace.`;
      else if (kind === 'commit' && this.evidence.git.commits.some(c => c.hash === id)) text = JSON.stringify(this.evidence.git.commits[0]);
      else throw new Error('Unknown demo evidence');
    } else text = await readEvidence(this.workspace, kind, id, this.evidence, { context: this.evidenceContext });
    this.publication.context(s); return this.publication.seal({ text }, { ...captured, ref: s.access.sessionRef });
  }); }
  async close() { if (this.closed) return; this.closed = true; this.selectionRevision++; this.source?.close(); await this.access?.close(); await this.queue; this.snapshot = null; this.evidence = null; this.removeAllListeners(); }
}
