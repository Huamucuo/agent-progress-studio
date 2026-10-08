import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { homedir } from 'node:os';
import { EventEmitter } from 'node:events';
import { createState, safeText, monitorTask, progressSummary } from './core/engine.mjs';
import { evaluateAcceptance } from './core/acceptance.mjs';
import { discoverSessions, LogSource } from './adapters/codex-log.mjs';
import { AppServerSource } from './adapters/app-server.mjs';
import { DemoSource } from './adapters/demo.mjs';
import { WorkHookSource, validHookId } from './adapters/work-hooks.mjs';
import { collectEvidence, digest, readEvidence } from './collectors/evidence.mjs';

export class StudioService extends EventEmitter {
  constructor(options) {
    super(); this.options = options; this.codexHome = options.codexHome || process.env.CODEX_HOME || path.join(homedir(), '.codex');
    this.dataDir = options.dataDir; this.reviews = {}; this.source = null; this.mode = options.mode || 'local'; this.queue = Promise.resolve(); this.sessions = [];
    this.workHooksDir = options.workHooksDir || path.join(this.dataDir, 'work-hooks', 'events'); this.hookOrigins = {};
  }
  run(action) { const result = this.queue.then(action); this.queue = result.catch(() => {}); return result; }
  hookOrigin(id) { return Object.hasOwn(this.hookOrigins, id) ? this.hookOrigins[id] : 'unknown'; }
  async init() {
    await mkdir(this.dataDir, { recursive: true });
    try { this.reviews = JSON.parse(await readFile(path.join(this.dataDir, 'reviews.json'), 'utf8')); } catch { this.reviews = {}; }
    try {
      const saved = JSON.parse(await readFile(path.join(this.dataDir, 'hook-origins.json'), 'utf8'));
      this.hookOrigins = Object.fromEntries(Object.entries(saved).filter(([id, origin]) => validHookId(id) && ['work-local', 'codex'].includes(origin)));
    } catch { this.hookOrigins = {}; }
    await this.select({ mode: this.mode });
  }
  async discover() {
    const excluded = new Set(Object.keys(this.hookOrigins).filter(id => this.hookOrigin(id) === 'work-local'));
    this.sessions = await discoverSessions(this.codexHome, 60, excluded);
    return this.sessions.map(({ path: hidden, ...s }) => ({ ...s, current: s.id === process.env.CODEX_THREAD_ID }));
  }
  select(config) {
    return this.run(async () => {
      let next, selected;
      if (config.mode === 'demo') {
        if (config.scenario && !['showcase', 'no-plan'].includes(config.scenario)) throw new Error('Unknown demo scenario');
        next = new DemoSource(config.scenario);
      } else if (config.mode === 'local') {
        await this.discover();
        selected = config.id ? this.sessions.find(s => s.id === config.id) : this.sessions.find(s => s.id === process.env.CODEX_THREAD_ID) || this.sessions[0];
        if (config.id && !selected) throw new Error('Session no longer available; refresh discovery');
        if (selected) next = new LogSource(selected.path, selected.id);
      } else if (config.mode === 'work-hooks') {
        if (config.id !== undefined && !validHookId(config.id)) throw new Error('Invalid Hook session ID');
        if (this.mode === 'work-hooks' && this.source instanceof WorkHookSource) {
          await this.source.poll();
          if (config.id && !this.source.sessions.some(s => s.id === config.id)) throw new Error('Hook session no longer available');
          if (config.id) this.source.id = config.id;
          return this.refreshInternal();
        }
        next = new WorkHookSource(this.workHooksDir, config.id);
        await next.poll();
        if (config.id && !next.received) throw new Error('Hook session no longer available');
      } else if (config.mode === 'app-server') {
        if (this.mode === 'app-server' && this.source?.endpoint === new URL(config.endpoint).href && config.id) {
          await this.source.select(config.id); this.selected = this.source.sessions.find(s => s.id === config.id); this.error = null;
          return this.refreshInternal();
        }
        next = new AppServerSource(config.endpoint); const sessions = await next.connect();
        selected = sessions.find(s => s.id === (config.id || process.env.CODEX_THREAD_ID)) || sessions[0];
        if (selected) await next.select(selected.id);
      } else throw new Error('Unknown source mode');
      this.source?.close(); this.source = next; this.mode = config.mode; this.selected = selected; this.error = null;
      return this.refreshInternal();
    });
  }
  refresh() { return this.run(() => this.refreshInternal()); }
  async refreshInternal({ advance = false } = {}) {
    if (this.mode === 'local') {
      await this.discover();
      if (!this.source && this.sessions.length) {
        this.selected = this.sessions.find(s => s.id === process.env.CODEX_THREAD_ID) || this.sessions[0];
        this.source = new LogSource(this.selected.path, this.selected.id);
      }
    }
    let task = this.source?.state || createState();
    try {
      if (this.mode !== 'demo' || advance) task = await this.source?.poll() || task;
      this.error = this.source?.error || null;
    } catch (e) { this.error = safeText(e.message, 500); }
    if (this.selected) { task = { ...task, cwd: task.cwd || this.selected.cwd }; }
    this.workspace = ['demo', 'work-hooks'].includes(this.mode) ? null : this.options.workspace || task.cwd || null;
    this.evidence = this.mode === 'demo' ? this.source.evidence() : await collectEvidence(this.workspace);
    this.reviewKey = digest(`${this.mode}:${task.id}:${this.workspace || ''}:${this.evidence.manifest?.taskId || ''}`);
    const acceptance = evaluateAcceptance(this.evidence.manifest, this.evidence, this.reviews[this.reviewKey] || {});
    const connected = !!this.source && !this.error && (this.mode !== 'work-hooks' || this.source.received);
    const sessions = this.mode === 'work-hooks' ? this.source.sessions.map(s => ({ ...s, origin: this.hookOrigin(s.id) }))
      : this.mode === 'app-server' ? this.source.sessions : this.mode === 'local' ? this.sessions.map(({ path: hidden, ...s }) => ({ ...s, current: s.id === process.env.CODEX_THREAD_ID })) : [];
    this.snapshot = {
      schemaVersion: 1, version: '0.1.1-rc.2', observedAt: new Date().toISOString(),
      source: { mode: this.mode, connected, error: this.error,
        label: this.mode === 'demo' ? 'SIMULATED' : this.mode === 'work-hooks' ? 'Local lifecycle Hooks · metadata only' : this.mode === 'local' ? 'Codex JSONL · best effort' : 'Codex app-server · read polling',
        origin: this.mode === 'work-hooks' ? this.hookOrigin(task.id) : this.mode === 'demo' ? 'simulated' : 'codex',
        attribution: this.mode === 'work-hooks' ? (this.hookOrigin(task.id) !== 'unknown' ? 'user-confirmed' : 'unconfirmed') : 'adapter',
        endpoint: this.mode === 'app-server' ? this.source?.endpoint : null,
        diagnostics: this.source?.diagnostics || {}, capabilities: { history: true, notifications: this.mode === 'app-server', approvals: false },
        selection: this.mode === 'work-hooks' ? (task.id ? 'selected-session' : 'none') : this.selected?.id === process.env.CODEX_THREAD_ID ? 'current-environment' : this.selected ? 'selected-session' : 'none' },
      sessions, hookSessions: this.mode === 'work-hooks' ? sessions : [],
      workspace: this.workspace, task, acceptance, evidence: this.evidence,
      monitor: monitorTask(task, { connected, mode: this.mode }), progress: progressSummary(task, acceptance),
      replay: this.mode === 'demo' ? { index: this.source.index, playing: this.source.playing, total: 9, scenario: this.source.scenario } : null
    };
    this.emit('snapshot', this.snapshot); return this.snapshot;
  }
  tick() { return this.run(() => this.refreshInternal({ advance: true })); }
  attributeHook(input) {
    return this.run(async () => {
      if (this.mode !== 'work-hooks' || !validHookId(input.sessionId) || !['work-local', 'codex', 'unknown'].includes(input.origin)) throw new Error('Invalid Hook source attribution');
      await this.refreshInternal();
      if (!this.source.sessions.some(s => s.id === input.sessionId)) throw new Error('Hook session no longer available');
      const updated = { ...this.hookOrigins };
      if (input.origin === 'unknown') delete updated[input.sessionId]; else updated[input.sessionId] = input.origin;
      await writeFile(path.join(this.dataDir, 'hook-origins.tmp'), JSON.stringify(updated, null, 2), { mode: 0o600 });
      await rename(path.join(this.dataDir, 'hook-origins.tmp'), path.join(this.dataDir, 'hook-origins.json'));
      this.hookOrigins = updated; return this.refreshInternal();
    });
  }
  demo(action) {
    return this.run(async () => { if (this.mode !== 'demo') throw new Error('Select demo first'); this.source.control(action); return this.refreshInternal(); });
  }
  review(input) {
    return this.run(async () => {
      await this.refreshInternal();
      const c = this.snapshot.acceptance.criteria.find(c => c.id === input.criterionId);
      if (!c?.requiresHuman || !['accept', 'reject', 'clear'].includes(input.decision)) throw new Error('Invalid human review');
      if (!this.evidence.fingerprint || input.fingerprint !== this.evidence.fingerprint || input.manifestHash !== this.evidence.manifestHash) throw new Error('Evidence changed; reopen the criterion');
      if (input.decision === 'accept' && !(c.automated || (!(c.checks || []).length && c.implemented))) throw new Error('Required evidence is not ready');
      const key = this.reviewKey, reviews = { ...(this.reviews[key] || {}) };
      if (input.decision === 'clear') delete reviews[c.id];
      else reviews[c.id] = { decision: input.decision, note: safeText(input.note, 2000), at: new Date().toISOString(), fingerprint: this.evidence.fingerprint, manifestHash: this.evidence.manifestHash };
      const updated = { ...this.reviews, [key]: reviews };
      await writeFile(path.join(this.dataDir, 'reviews.tmp'), JSON.stringify(updated, null, 2), { mode: 0o600 });
      await rename(path.join(this.dataDir, 'reviews.tmp'), path.join(this.dataDir, 'reviews.json'));
      this.reviews = updated; return this.refreshInternal();
    });
  }
  async detail(kind, id) {
    if (this.mode === 'demo') {
      if (kind === 'diff') return this.evidence.git.diff;
      if (kind === 'report') return JSON.stringify(this.evidence.report, null, 2);
      if (kind === 'file' && this.evidence.files.includes(id)) return `SIMULATED EVIDENCE\n${id}\nThis fixture represents an implemented file; it is not a read of your workspace.`;
      if (kind === 'commit' && this.evidence.git.commits.some(c => c.hash === id)) return JSON.stringify(this.evidence.git.commits[0], null, 2);
      throw new Error('Unknown demo evidence');
    }
    return readEvidence(this.workspace, kind, id, this.evidence);
  }
  close() { this.source?.close(); this.removeAllListeners(); }
}
