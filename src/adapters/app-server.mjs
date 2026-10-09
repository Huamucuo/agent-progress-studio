import { createState, reduceEvent } from '../core/engine.mjs';
import { normalizeNotification } from './normalize.mjs';
import { canonicalUuid } from '../core/session-access.mjs';

export function validateEndpoint(value) {
  const url = new URL(value);
  if (url.protocol !== 'ws:' || url.hostname !== '127.0.0.1' || !url.port || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Use ws://127.0.0.1:PORT only');
  return url.href;
}

/** Read-only app-server client; never resumes a thread or handles approvals. */
export class AppServerSource {
  constructor(endpoint, { canRead = () => false, allowedIds = () => [] } = {}) {
    this.endpoint = validateEndpoint(endpoint); this.state = createState(); this.pending = new Map(); this.seq = 0;
    this.threadId = null; this.sessions = []; this.connected = false; this.error = null;
    this.canRead = canRead; this.allowedIds = allowedIds;
  }
  refreshSessions() { this.sessions = this.allowedIds().map(canonicalUuid).filter(id => id && this.canRead(id)).map(id => ({ id, title: id, cwd: '', updatedAt: null })); return this.sessions; }
  deny() { this.state = createState(this.threadId || ''); this.historySignature = null; this.error = 'Session content is not authorized'; return this.state; }
  receiveWire(data) {
    if (typeof data !== 'string' || data.length > 8 * 1024 * 1024) return;
    // Inspect only the response envelope prefix before parsing any payload.
    // Unsolicited frames or ambiguous field ordering are rejected, never previewed.
    const id = /^\s*\{\s*(?:"jsonrpc"\s*:\s*"2\.0"\s*,\s*)?"id"\s*:\s*(\d+)\s*[,}]/.exec(data.slice(0, 160))?.[1];
    const pending = id === undefined ? null : this.pending.get(Number(id));
    if (!pending) return;
    if (pending.scopeId && !this.canRead(pending.scopeId)) {
      this.deny(); clearTimeout(pending.timeout); this.pending.delete(Number(id)); pending.reject(new Error('Session content is not authorized')); return;
    }
    try { this.receive(JSON.parse(data)); } catch { this.error = 'Malformed app-server response'; }
  }
  async connect() {
    this.socket = new WebSocket(this.endpoint);
    this.socket.addEventListener('message', e => this.receiveWire(e.data));
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
      // thread/list can include private previews for unknown Work sessions.
      return this.refreshSessions();
    } catch (e) { this.close(); throw e; }
  }
  request(method, params) {
    if (!['initialize', 'thread/read'].includes(method)) return Promise.reject(new Error('Read-only adapter denied method'));
    const scopeId = method === 'thread/read' ? canonicalUuid(params?.threadId) : null;
    if (method === 'thread/read' && (!scopeId || scopeId !== canonicalUuid(this.threadId) || !this.canRead(scopeId))) return Promise.reject(new Error('Session content is not authorized'));
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { this.pending.delete(id); reject(new Error(`${method} timed out`)); }, 5000);
      this.pending.set(id, { resolve, reject, timeout, scopeId });
      try { this.socket.send(JSON.stringify({ id, method, params })); }
      catch (e) { clearTimeout(timeout); this.pending.delete(id); reject(e); }
    });
  }
  receive(message) {
    if (message.id !== undefined) {
      const pending = this.pending.get(message.id);
      if (pending) {
        clearTimeout(pending.timeout); this.pending.delete(message.id);
        if (pending.scopeId && !this.canRead(pending.scopeId)) { this.deny(); pending.reject(new Error('Session content is not authorized')); }
        else message.error ? pending.reject(new Error('App-server RPC error')) : pending.resolve(message.result);
      }
      // Server requests are deliberately not answered by this observer.
      return;
    }
    if (this.threadId && !this.canRead(this.threadId)) return this.deny();
    const threadId = canonicalUuid(message.params?.threadId);
    if (!threadId || threadId !== canonicalUuid(this.threadId) || !this.canRead(threadId)) return;
    for (const event of normalizeNotification(message, `rpc:${++this.seq}`)) this.state = reduceEvent(this.state, event);
  }
  async select(id) {
    id = canonicalUuid(id); this.refreshSessions();
    if (!this.sessions.some(s => s.id === id)) throw new Error('Unknown app-server thread');
    this.threadId = id; this.state = createState(id); this.historySignature = null;
    return this.poll();
  }
  async poll() {
    this.refreshSessions();
    if (this.threadId && !this.canRead(this.threadId)) return this.deny();
    if (!this.threadId || !this.connected) return this.state;
    const result = await this.request('thread/read', { threadId: this.threadId, includeTurns: true });
    const t = result.thread;
    if (!t || canonicalUuid(t.id) !== this.threadId || !this.canRead(this.threadId)) { this.deny(); throw new Error('Thread read did not match authorized session'); }
    const signature = JSON.stringify(t);
    if (signature === this.historySignature) return this.state;
    this.historySignature = signature;
    let s = createState(this.threadId);
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
  close() { this.connected = false; this.socket?.close(); this.cancelPending(); this.threadId = null; this.state = createState(); this.historySignature = null; }
}
