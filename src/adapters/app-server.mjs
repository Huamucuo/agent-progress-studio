import { createState, reduceEvent } from '../core/engine.mjs';
import { normalizeNotification } from './normalize.mjs';
import { SessionAccess, sessionRef, sessionKey } from '../core/session-access.mjs';
import { scanEnvelope } from './rpc-envelope.mjs';
import { VERSION } from '../version.mjs';
export function validateEndpoint(value) {
  const url = new URL(value);
  if (url.protocol !== 'ws:' || url.hostname !== '127.0.0.1' || !url.port || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Use ws://127.0.0.1:PORT only');
  return url.href;
}
const notifications = new Set(['turn/started', 'turn/completed', 'turn/plan/updated', 'thread/tokenUsage/updated', 'thread/status/changed', 'item/started', 'item/completed']);
const optOut = ['thread/started', 'thread/name/updated', 'item/agentMessage/delta', 'item/plan/delta', 'item/reasoning/summaryTextDelta', 'item/reasoning/textDelta', 'item/reasoning/summaryPartAdded', 'item/commandExecution/outputDelta', 'item/fileChange/outputDelta', 'item/mcpToolCall/progress', 'turn/diff/updated', 'error'];
const time = seconds => typeof seconds === 'number' && Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString() : null;

/** Read-only official RPC. Never resumes a thread, executes tools, or answers approvals. */
export class AppServerSource {
  constructor(endpoint, { access = new SessionAccess(), timeoutMs = 5000 } = {}) {
    if (!(access instanceof SessionAccess)) throw new Error('Session authority required');
    this.endpoint = validateEndpoint(endpoint); this.backend = 'rpc:' + this.endpoint; this.access = access; this.timeoutMs = timeoutMs;
    this.state = createState(); this.sessions = []; this.pending = new Map(); this.seq = 0; this.connectionGeneration = 0; this.selectionRevision = 0; this.notificationSeq = 0;
    this.connected = false; this.threadId = null; this.error = null; this.retiredTurns = new Set(); this.diagnostics = { discovery: 'UNKNOWN', subscription: 'UNSUPPORTED: CROSS_CLIENT_READ_ONLY_SUBSCRIPTION', notificationsReceived: 0 };
    this.onInvalidate = () => { this.disconnect(); this.state = createState(this.threadId || ''); this.permit = null; };
    access.on('invalidate', this.onInvalidate);
  }
  ref(id = this.threadId) { return id ? sessionRef(this.backend, id) : null; }
  allowed() { return this.threadId && this.access.can(this.ref(), 'content'); }
  deny() { this.state = createState(this.threadId || ''); this.permit = null; this.error = 'Session content is not authorized'; return this.state; }
  live(channel) { return channel === this.channel && channel.connection === this.connectionGeneration && channel.selection === this.selectionRevision && (!channel.permit || this.access.valid(channel.permit)); }
  receiveWire(data, channel = this.channel) {
    let wire; try { wire = scanEnvelope(data); } catch { this.diagnostics.malformed = (this.diagnostics.malformed || 0) + 1; return; }
    if (wire.hasId) {
      // A server request is not a response even if it reuses a pending ID.
      if (wire.method !== undefined || (!!wire.at('result') === !!wire.at('error'))) return;
      const p = this.pending.get(wire.requestKey); if (!p) return;
      const reject = (message, code) => { clearTimeout(p.timeout); this.pending.delete(wire.requestKey); p.reject(Object.assign(new Error(message), { code })); };
      if (!this.live(p.channel) || channel !== p.channel || (p.permit && !this.access.valid(p.permit))) return reject('Stale RPC response');
      if (wire.at('error')) return reject('App-server RPC error', wire.scalar(wire.at('error', 'code')) === '-32601' ? 'RPC_METHOD_UNSUPPORTED' : 'RPC_ERROR');
      const node = wire.at('result');
      if (p.method === 'thread/read' && sessionKey(wire.scalar(wire.at('result', 'thread', 'id'))) !== p.id) { this.deny(); return reject('RPC response identity mismatch'); }
      if (p.method === 'thread/loaded/list') {
        const ids = wire.at('result', 'data');
        if (ids?.type !== 'array' || ids.values.length > 1000 || ids.values.some(n => n.type !== 'string' || !sessionKey(wire.scalar(n)))) return reject('Invalid ID-only discovery result');
        if ([...node.fields.keys()].some(k => !['data', 'nextCursor'].includes(k))) return reject('Unexpected discovery payload');
      }
      try { const result = wire.parse(node); clearTimeout(p.timeout); this.pending.delete(wire.requestKey); p.resolve(result); } catch { reject('Malformed RPC result'); }
      return;
    }
    if (!channel || !this.live(channel) || !channel.permit || !notifications.has(wire.method)) return;
    if (sessionKey(wire.scalar(wire.at('params', 'threadId'))) !== channel.id) return;
    const turnId = sessionKey(wire.scalar(wire.method === 'turn/started' || wire.method === 'turn/completed' ? wire.at('params', 'turn', 'id') : wire.at('params', 'turnId')));
    if (wire.method !== 'thread/status/changed' && !turnId) return;
    if (turnId && this.retiredTurns.has(turnId)) return;
    if (this.state.turnId && turnId && this.state.turnId !== turnId) {
      if (wire.method !== 'turn/started') return;
      this.retiredTurns.add(this.state.turnId);
    }
    this.access.check(channel.permit);
    const params = wire.parse(wire.at('params')); if (turnId && !this.state.turnId) this.state.turnId = turnId;
    for (const event of normalizeNotification({ method: wire.method, params }, `rpc:${++this.seq}`)) this.state = reduceEvent(this.state, event);
    this.permit = channel.permit; this.notificationSeq++; this.diagnostics.notificationsReceived++;
  }
  async connect() {
    if (this.connected) return this.sessions;
    const socket = new WebSocket(this.endpoint), channel = Object.freeze({ connection: ++this.connectionGeneration, selection: this.selectionRevision, id: this.threadId, permit: this.allowed() ? this.access.issue(this.ref(), 'content') : null });
    this.socket = socket; this.channel = channel;
    socket.addEventListener('message', e => { if (this.live(channel)) this.receiveWire(e.data, channel); });
    socket.addEventListener('close', () => { if (this.channel === channel) { this.connected = false; this.error = 'App-server disconnected'; this.cancelPending(); this.state = createState(this.threadId || ''); this.permit = null; } });
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { socket.close(); reject(new Error('App-server connection timed out')); }, this.timeoutMs);
      socket.addEventListener('open', () => { clearTimeout(timeout); resolve(); }, { once: true });
      socket.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('Cannot connect to app-server')); }, { once: true });
    });
    try {
      if (!this.live(channel)) throw new Error('Connection scope changed');
      await this.request('initialize', { clientInfo: { name: 'agent-progress-studio', title: 'Agent Progress Studio', version: VERSION }, capabilities: { experimentalApi: false, optOutNotificationMethods: optOut } });
      if (!this.live(channel)) throw new Error('Connection scope changed');
      socket.send(JSON.stringify({ method: 'initialized', params: {} })); this.connected = true; this.error = null;
      await this.discover(); return this.sessions;
    } catch (e) { this.disconnect(); throw e; }
  }
  request(method, params) {
    if (!['initialize', 'thread/loaded/list', 'thread/read', 'thread/turns/list', 'thread/items/list'].includes(method)) return Promise.reject(new Error('Read-only adapter denied method'));
    const channel = this.channel; if (!channel || !this.live(channel)) return Promise.reject(new Error('No current RPC channel'));
    const content = ['thread/read', 'thread/turns/list', 'thread/items/list'].includes(method), id = content ? sessionKey(params?.threadId) : null;
    if (content && (!id || id !== channel.id || !channel.permit || !this.allowed())) return Promise.reject(new Error('Session content is not authorized'));
    const requestId = `${channel.connection}:${++this.seq}`, key = 's:' + requestId;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { this.pending.delete(key); reject(new Error(`${method} timed out`)); }, this.timeoutMs);
      this.pending.set(key, { resolve, reject, timeout, method, id, channel, permit: content ? channel.permit : null });
      try { this.socket.send(JSON.stringify({ id: requestId, method, params })); } catch { clearTimeout(timeout); this.pending.delete(key); reject(new Error('RPC send failed')); }
    });
  }
  async discover() {
    const found = new Map(); let cursor = null, pages = 0; const seen = new Set();
    try {
      do {
        const result = await this.request('thread/loaded/list', { limit: 100, cursor });
        for (const raw of result.data) { const id = sessionKey(raw); found.set(id, { id, title: id, cwd: '', updatedAt: null }); }
        cursor = result.nextCursor || null;
        if (cursor && (typeof cursor !== 'string' || seen.has(cursor))) throw new Error('Invalid discovery cursor');
        seen.add(cursor);
      } while (cursor && ++pages < 20);
      this.diagnostics.discovery = cursor ? 'PARTIAL: page limit' : 'LOADED_IDS_ONLY';
    } catch (e) { this.diagnostics.discovery = e.code === 'RPC_METHOD_UNSUPPORTED' ? 'UNSUPPORTED: thread/loaded/list' : 'UNKNOWN: discovery unavailable'; for (const s of this.sessions) found.set(s.id, s); }
    // Previously authorized unloaded IDs remain selectable for directed history.
    for (const ref of this.access.list(this.backend)) if (this.access.can(ref, 'content') && !found.has(ref.id)) found.set(ref.id, { id: ref.id, title: ref.id, cwd: '', updatedAt: null, loaded: false });
    this.sessions = [...found.values()]; return this.sessions;
  }
  async select(rawId) {
    const id = sessionKey(rawId); if (!id || !this.sessions.some(s => s.id === id)) throw new Error('Unknown app-server thread');
    this.disconnect(); this.threadId = id; this.selectionRevision++; this.state = createState(id); this.retiredTurns.clear(); this.permit = null;
    await this.connect(); return this.poll();
  }
  async poll() {
    if (!this.connected) await this.connect(); else await this.discover();
    if (!this.threadId) return this.state;
    if (!this.allowed()) return this.deny();
    // Authority changes always require a new channel, even for the same ID/turn.
    if (!this.channel?.permit || !this.access.valid(this.channel.permit)) { this.disconnect(); await this.connect(); }
    const channel = this.channel, before = this.notificationSeq;
    const result = await this.request('thread/read', { threadId: this.threadId, includeTurns: true });
    if (!this.live(channel)) return this.deny();
    if (before !== this.notificationSeq) return this.state; // next poll retries; never overwrite newer live state
    const t = result.thread; if (sessionKey(t?.id) !== channel.id) throw new Error('Thread identity mismatch');
    let state = createState(channel.id); state.cwd = typeof t.cwd === 'string' ? t.cwd : ''; state.title = t.name || t.preview || '';
    state.phase = { active: 'executing', idle: 'idle', systemError: 'failed' }[t.status?.type] || 'unknown';
    let turn = t.turns?.at(-1);
    if (!Array.isArray(t.turns) || ['summary', 'notLoaded'].includes(turn?.itemsView)) {
      try {
        const page = await this.request('thread/turns/list', { threadId: channel.id, limit: 1, sortDirection: 'desc', itemsView: 'full' });
        if (!Array.isArray(page.data)) throw new Error('Invalid turn page'); turn = page.data[0]; this.diagnostics.historyPaging = 'SUPPORTED';
      } catch (e) { this.diagnostics.historyPaging = e.code === 'RPC_METHOD_UNSUPPORTED' ? 'UNSUPPORTED: thread/turns/list' : 'UNKNOWN: history page unavailable'; }
    }
    if (turn && this.retiredTurns.has(turn.id)) return this.state;
    if (turn && ['summary', 'notLoaded'].includes(turn.itemsView)) {
      try {
        let cursor = null, count = 0; const items = [], seen = new Set();
        do {
          const page = await this.request('thread/items/list', { threadId: channel.id, turnId: turn.id, cursor, limit: 100 });
          if (!Array.isArray(page.data) || page.data.some(e => e.turnId !== turn.id || !e.item)) throw new Error('Invalid item page'); items.push(...page.data.map(e => e.item)); cursor = page.nextCursor || null;
          if (cursor && (typeof cursor !== 'string' || seen.has(cursor))) throw new Error('Invalid item cursor'); seen.add(cursor);
        } while (cursor && ++count < 20);
        turn = { ...turn, items }; this.diagnostics.itemPaging = cursor ? 'PARTIAL: page limit' : 'SUPPORTED';
      } catch (e) { this.diagnostics.itemPaging = e.code === 'RPC_METHOD_UNSUPPORTED' ? 'UNSUPPORTED: thread/items/list' : 'UNKNOWN: item page unavailable'; }
    }
    if (!this.live(channel)) return this.deny();
    if (before !== this.notificationSeq) return this.state;
    if (turn) {
      if (this.state.turnId && this.state.turnId !== turn.id) this.retiredTurns.add(this.state.turnId);
      for (const item of turn.items || []) for (const e of normalizeNotification({ method: item.status === 'inProgress' ? 'item/started' : 'item/completed', params: { threadId: channel.id, turnId: turn.id, item } }, `history:${turn.id}:${item.id}`)) state = reduceEvent(state, e);
      state.turnId = turn.id; state.phase = { completed: 'completed', failed: 'failed', interrupted: 'interrupted', inProgress: 'executing' }[turn.status] || state.phase;
      state.startedAt = time(turn.startedAt); state.endedAt = time(turn.completedAt);
      if (state.turnId === this.state.turnId) { state.plan = this.state.plan; state.usage = this.state.usage; }
    }
    this.access.check(channel.permit); this.permit = channel.permit; this.state = state; this.error = null; return state;
  }
  cancelPending() { for (const p of this.pending.values()) { clearTimeout(p.timeout); p.reject(new Error('App-server disconnected')); } this.pending.clear(); }
  disconnect() { this.connectionGeneration++; this.channel = null; this.connected = false; this.cancelPending(); this.socket?.close(); this.socket = null; }
  close() { this.disconnect(); this.access.off('invalidate', this.onInvalidate); this.state = createState(); this.permit = null; }
}
