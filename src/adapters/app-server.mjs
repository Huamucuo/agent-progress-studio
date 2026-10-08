import { createState, reduceEvent } from '../core/engine.mjs';
import { normalizeNotification } from './normalize.mjs';

export function validateEndpoint(value) {
  const url = new URL(value);
  if (url.protocol !== 'ws:' || url.hostname !== '127.0.0.1' || !url.port || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Use ws://127.0.0.1:PORT only');
  return url.href;
}

/** Read-only app-server client; never resumes a thread or handles approvals. */
export class AppServerSource {
  constructor(endpoint) {
    this.endpoint = validateEndpoint(endpoint); this.state = createState(); this.pending = new Map(); this.seq = 0;
    this.threadId = null; this.sessions = []; this.connected = false; this.error = null;
  }
  async connect() {
    this.socket = new WebSocket(this.endpoint);
    this.socket.addEventListener('message', e => {
      if (typeof e.data !== 'string' || e.data.length > 8 * 1024 * 1024) return;
      try { this.receive(JSON.parse(e.data)); } catch { this.error = 'Malformed app-server message'; }
    });
    this.socket.addEventListener('close', () => { this.connected = false; this.error = 'App-server disconnected'; this.cancelPending(); });
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { this.socket.close(); reject(new Error('App-server connection timed out')); }, 5000);
      this.socket.addEventListener('open', () => { clearTimeout(timeout); resolve(); }, { once: true });
      this.socket.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('Cannot connect to app-server (endpoint, authentication or transport unavailable)')); }, { once: true });
    });
    try {
      await this.request('initialize', { clientInfo: { name: 'agent-progress-studio', title: 'Agent Progress Studio', version: '0.1.0' }, capabilities: { experimentalApi: false } });
      this.socket.send(JSON.stringify({ method: 'initialized', params: {} }));
      this.connected = true; this.error = null;
      const result = await this.request('thread/list', { limit: 50, sortKey: 'updated_at', sourceKinds: [] });
      this.sessions = (result.data || []).map(t => ({ id: t.id, title: t.name || t.preview?.slice(0, 120) || t.id, cwd: t.cwd || '', updatedAt: Number.isFinite(t.updatedAt) ? new Date(t.updatedAt * 1000).toISOString() : null }));
      return this.sessions;
    } catch (e) { this.close(); throw e; }
  }
  request(method, params) {
    if (!['initialize', 'thread/list', 'thread/read'].includes(method)) return Promise.reject(new Error('Read-only adapter denied method'));
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { this.pending.delete(id); reject(new Error(`${method} timed out`)); }, 5000);
      this.pending.set(id, { resolve, reject, timeout });
      try { this.socket.send(JSON.stringify({ id, method, params })); }
      catch (e) { clearTimeout(timeout); this.pending.delete(id); reject(e); }
    });
  }
  receive(message) {
    if (message.id !== undefined) {
      const pending = this.pending.get(message.id);
      if (pending) { clearTimeout(pending.timeout); this.pending.delete(message.id); message.error ? pending.reject(new Error(message.error.message || 'RPC error')) : pending.resolve(message.result); }
      // Server requests are deliberately not answered by this observer.
      return;
    }
    const threadId = message.params?.threadId;
    if (!this.threadId || threadId !== this.threadId) return;
    for (const event of normalizeNotification(message, `rpc:${++this.seq}`)) this.state = reduceEvent(this.state, event);
  }
  async select(id) {
    if (!this.sessions.some(s => s.id === id)) throw new Error('Unknown app-server thread');
    this.threadId = id; this.state = createState(id); this.historySignature = null;
    return this.poll();
  }
  async poll() {
    if (!this.threadId || !this.connected) return this.state;
    const result = await this.request('thread/read', { threadId: this.threadId, includeTurns: true });
    const t = result.thread;
    if (!t || t.id !== this.threadId) throw new Error('Thread read did not match selected session');
    const signature = JSON.stringify(t);
    if (signature === this.historySignature) return this.state;
    this.historySignature = signature;
    let s = createState(t.id);
    s.cwd = t.cwd || ''; s.title = t.name || t.preview || ''; s.phase = { active: 'executing', idle: 'idle', systemError: 'failed' }[t.status?.type] || 'unknown';
    const turns = (t.turns || []).slice(-1);
    for (const turn of turns) {
      for (const item of turn.items || []) {
        for (const event of normalizeNotification({ method: item.status === 'inProgress' ? 'item/started' : 'item/completed', params: { item } }, `history:${turn.id}:${item.id}`)) s = reduceEvent(s, event);
      }
    }
    const last = turns.at(-1);
    if (last) { s.turnId = last.id; s.phase = { completed: 'completed', failed: 'failed', interrupted: 'interrupted', inProgress: 'executing' }[last.status] || s.phase; }
    // Preserve actual notifications for the same turn; history does not contain every plan/usage field.
    if (s.turnId && s.turnId === this.state.turnId) { s.plan = this.state.plan; s.usage = this.state.usage; }
    this.state = s; return s;
  }
  cancelPending() { for (const p of this.pending.values()) { clearTimeout(p.timeout); p.reject(new Error('App-server disconnected')); } this.pending.clear(); }
  close() { this.connected = false; this.socket?.close(); this.cancelPending(); }
}
