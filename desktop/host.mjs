import { EventEmitter } from 'node:events';
import { open, lstat, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { StudioService } from '../src/service.mjs';
import { canonicalPath, within, sensitivePath } from '../src/core/resource-registry.mjs';
import { VERSION } from '../src/version.mjs';
import { projectMonitor } from '../public/monitor-model.mjs';
import { projectPet } from '../src/pet/state.mjs';

const scopeKeys = ['authorityInstanceId', 'expectedPolicyRevision', 'selectionRevision'];
const operations = {
  bootstrap: [], snapshot: [], monitor:[], petState:[], sessions: [], detail: ['kind', 'id'],
  selectSource: ['mode', 'id', 'endpoint', 'scenario', 'experimentalApi'],
  sessionAccess: ['sessionRef', 'sessionId', 'decision', 'root'],
  labelHook: ['sessionId', 'origin'], review: ['criterionId', 'decision', 'note', 'fingerprint', 'manifestHash'],
  demo: ['action']
};
const mutations = new Set(['selectSource', 'sessionAccess', 'labelHook', 'review', 'demo']);
export function validateDesktopInput(operation, input = {}) {
  if (!Object.hasOwn(operations, operation)) throw new Error('Unsupported desktop operation');
  if (!input || typeof input !== 'object' || Array.isArray(input) || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) throw new Error('Invalid desktop input');
  const allowed = new Set([...operations[operation], ...(mutations.has(operation) ? scopeKeys : [])]);
  if (Object.keys(input).some(k => !allowed.has(k)) || JSON.stringify(input).length > 16384) throw new Error('Invalid desktop input fields');
  for (const [key, value] of Object.entries(input)) {
    if (value === null && ['endpoint','id'].includes(key)) continue;
    if (key === 'sessionRef') {
      if (!value || Object.keys(value).sort().join(',') !== 'backend,id' || typeof value.backend !== 'string' || typeof value.id !== 'string' || value.backend.length > 4096 || value.id.length > 128) throw new Error('Invalid session reference');
    } else if (key === 'experimentalApi') { if (typeof value !== 'boolean') throw new Error('Invalid capability'); }
    else if (key === 'expectedPolicyRevision' || key === 'selectionRevision') { if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid revision'); }
    else if (typeof value !== 'string' || value.length > 4096) throw new Error('Invalid input value');
  }
  if (mutations.has(operation) && scopeKeys.some(k => input[k] === undefined)) throw new Error('Current scope required');
  return input;
}
const currentScope = s => ({ instance: s.access.instanceId, revision: s.access.revision, selection: s.selectionRevision });
const sameScope = (s, c) => !s.closed && c.instance === s.access.instanceId && c.revision === s.access.revision && c.selection === s.selectionRevision;

/** Native lifecycle owner; session permissions remain in StudioService. No listener. */
export class DesktopHost extends EventEmitter {
  #responses = new WeakMap();
  constructor(options) { super(); this.options = { ...options }; this.state = 'paused'; this.subscriptions = new Map(); this.pendingStart = null; this.pendingStop = null; this.busy = false; this.lifecycle = 0; }
  async start() {
    if (this.state === 'running') return this.service;
    if (this.pendingStart) return this.pendingStart;
    if (this.pendingStop) await this.pendingStop;
    const lifecycle = ++this.lifecycle; this.state = 'starting'; this.emit('status', this.state);
    this.pendingStart = (async () => {
      const service = new StudioService(this.options);
      try { await service.init(); } catch (e) { await service.close().catch(() => {}); this.state = 'failed'; this.emit('status', this.state); throw e; }
      if (lifecycle !== this.lifecycle) { await service.close(); throw Error('Desktop start superseded'); }
      this.service = service;
      service.on('invalidate', () => this.invalidate());
      service.on('snapshot', value => this.publish(value));
      this.state = 'running'; this.emit('status', this.state);
      this.timer = this.options.interval === 0 ? null : setInterval(() => this.tick().catch(() => this.emit('diagnostic', 'COLLECTOR_TRANSIENT_FAILURE')), this.options.interval || 2000);
      this.heartbeat = setInterval(() => {
        if (this.state !== 'running') return;
        const s = this.service;
        for (const sub of this.subscriptions.values()) sub.send({ subscriptionId: sub.id, type: 'authority', data: { authorityInstanceId: s.access.instanceId, policyRevision: s.access.revision, selectionRevision: s.selectionRevision } });
      }, 3000);
      return service;
    })();
    try { return await this.pendingStart; } finally { this.pendingStart = null; }
  }
  ready() { if (this.state !== 'running' || !this.service || this.service.closed) throw new Error('Monitoring is paused or unavailable'); return this.service; }
  invalidate() {
    for (const sub of this.subscriptions.values()) { try { sub.send({ subscriptionId: sub.id, type: 'invalidate' }); } catch {} }
    this.subscriptions.clear();
    this.emit('invalidate');
  }
  publish(value) {
    if (this.state !== 'running') return;
    for (const sub of this.subscriptions.values()) {
      try { this.service.publication.write(sub.projection!=='snapshot'?this.project(this.service,value,sub.projection):value, data => sub.send({ subscriptionId: sub.id, type: 'snapshot', data })); }
      catch { this.subscriptions.delete(sub.id); try { sub.send({ subscriptionId: sub.id, type: 'invalidate' }); } catch {} }
    }
    this.emit('snapshot',{s:this.service,value});
  }
  subscribe(id, input, send, projection='snapshot') {
    const s = this.ready(); this.checkMutationScope(s, input);
    if (!/^[a-zA-Z0-9_.:-]{1,160}$/.test(id) || this.subscriptions.has(id) || this.subscriptions.size >= 8 || typeof send !== 'function') throw new Error('Invalid subscription');
    if(!['snapshot','monitor','pet'].includes(projection))throw Error('Unsupported projection');
    this.subscriptions.set(id, { id, send, projection });
    if (s.snapshot) s.publication.write(projection!=='snapshot'?this.project(s,s.snapshot,projection):s.snapshot, data => send({ subscriptionId: id, type: 'snapshot', data }));
    return () => this.subscriptions.delete(id);
  }
  checkMutationScope(s, input) {
    if (input.authorityInstanceId !== s.access.instanceId || input.expectedPolicyRevision !== s.access.revision || input.selectionRevision !== s.selectionRevision) throw new Error('Stale scope; refresh and retry');
  }
  remember(s, original) { const value = s.publication.write(original, text => JSON.parse(text)); this.#responses.set(value,{s,original}); return value; }
  project(s,value,projection='monitor'){
    const pet=projection==='pet',result=s.publication.seal(pet?projectPet(value):projectMonitor(value),{...s.publication.context(value),ref:pet?null:value.access.sessionRef});
    // Original opaque permits remain in Publication's WeakMap. Pet transport
    // needs authority/sequence only, never backend paths or session identifiers.
    if(pet)result.access.dependencies=[];
    return result;
  }
  hasResponse(value) { return this.#responses.has(value); }
  sendResponse(value, send) {
    const recorded = this.#responses.get(value);
    if (!recorded || recorded.s !== this.service || this.state !== 'running') throw Error('Stale desktop response');
    return recorded.s.publication.write(recorded.original, send);
  }
  async request(operation, input = {}, projection='snapshot') {
    validateDesktopInput(operation, input);if(!['snapshot','monitor','pet'].includes(projection))throw Error('Unsupported response projection'); const s = this.ready(), scope = currentScope(s); let value;
    if (mutations.has(operation)) this.checkMutationScope(s, input);
    if (operation === 'bootstrap') value = s.publication.seal({ token: 'desktop-owned', version: VERSION, freshnessMs: 10000 });
    else if (operation === 'snapshot') value = await s.refresh();
    else if (operation === 'monitor') value = await s.refresh();
    else if (operation === 'petState') { if(!s.snapshot)throw Error('No current activity');value=s.snapshot; }
    else if (operation === 'sessions') { const snapshot = await s.refresh(); value = s.publication.seal({ sessions: s.mode === 'demo' ? snapshot.localSessions : snapshot.sessions, localSessions: snapshot.localSessions }); }
    else if (operation === 'detail') value = await s.detail(input.kind, input.id);
    else if (operation === 'selectSource') value = await s.select(input);
    else if (operation === 'sessionAccess') value = await s.sessionAccess(input);
    else if (operation === 'labelHook') value = await s.attributeHook(input);
    else if (operation === 'review') value = await s.review(input);
    else if (operation === 'demo') value = await s.demo(input.action);
    if (this.service !== s || this.state !== 'running' || (!mutations.has(operation) && !sameScope(s, scope))) throw new Error('Request scope changed');
    if(operation==='petState'||(projection==='pet'&&operation!=='bootstrap'))value=this.project(s,value,'pet');
    else if(operation==='monitor'||(projection==='monitor'&&operation!=='bootstrap'))value=this.project(s,value);
    return this.remember(s,value);
  }
  async exportReport(chooseFile) {
    const s = this.ready(), scope = currentScope(s), value = await s.refresh();
    if (!sameScope(s, scope)) throw new Error('Export scope changed');
    const target = await chooseFile(); s.publication.context(value);
    if (!target) return this.remember(s,s.publication.seal({ desktopSaved: false }));
    if (this.service !== s || this.state !== 'running') throw new Error('Export scope changed');
    const destination = path.resolve(target), parent = await canonicalPath(path.dirname(destination));
    const literal = path.dirname(destination), folded = process.platform === 'win32' ? literal.toLowerCase() : literal;
    if (parent !== folded || path.extname(destination).toLowerCase() !== '.json' || sensitivePath(destination)) throw new Error('Unsafe export destination');
    for (const root of s.registry.protected) if (within(await canonicalPath(root, true), destination)) throw new Error('Protected export destination');
    try { const info = await lstat(destination); if (!info.isFile() || info.isSymbolicLink() || info.nlink > 1) throw new Error('Ambiguous export destination'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    s.publication.context(value);
    const temporary = path.join(parent, '.aps-export-' + randomUUID() + '.tmp'); let handle;
    try {
      handle = await open(temporary, 'wx', 0o600); s.publication.context(value);
      const data = s.publication.write(value, text => text);
      await handle.writeFile(data); s.publication.context(value); await handle.sync(); s.publication.context(value);
      await handle.close(); handle = null; s.publication.context(value); await rename(temporary, destination); s.publication.context(value);
      return this.remember(s,s.publication.seal({ desktopSaved: true }, { ...s.publication.context(value), ref: value.access.sessionRef }));
    } finally { await handle?.close(); await unlink(temporary).catch(() => {}); }
  }
  async tick() { if (this.state !== 'running' || this.busy) return; this.busy = true; try { await this.service.tick(); } finally { this.busy = false; } }
  async pause() {
    if (this.pendingStop) return this.pendingStop;
    this.lifecycle++; this.state = 'paused'; this.invalidate(); clearInterval(this.timer); clearInterval(this.heartbeat); this.emit('status', this.state);
    this.pendingStop = (async () => { if (this.pendingStart) await this.pendingStart.catch(() => {}); await this.service?.close(); })();
    try { await this.pendingStop; } finally { this.pendingStop = null; }
  }
  async close() { await this.pause(); this.removeAllListeners(); }
}
