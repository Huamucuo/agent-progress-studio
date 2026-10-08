export function createState(id = '') {
  return { id, title: '', cwd: '', model: null, turnId: null, phase: 'unknown', startedAt: null, endedAt: null,
    lastEventAt: null, plan: [], tools: [], events: [],
    usage: { total: null, input: null, cached: null, output: null, last: null, contextWindow: null, at: null } };
}

const numberOrNull = value => Number.isFinite(value) && value >= 0 ? value : null;
export function safeText(value, limit = 6000) {
  return String(value ?? '').replace(/\bsk-[A-Za-z0-9_-]{12,}/g, '[redacted]')
    .replace(/(Bearer\s+)[A-Za-z0-9._-]{12,}/gi, '$1[redacted]').slice(0, limit);
}

/** Pure, bounded reducer. Only normalized events reach this layer. */
export function reduceEvent(state, event) {
  if (!event?.kind || !event.id || state.events.some(e => e.id === event.id)) return state;
  const e = { ...event, text: safeText(event.text), at: event.at || null };
  const s = { ...state, lastEventAt: e.at || state.lastEventAt, events: [...state.events, e].slice(-160) };
  if (e.kind === 'task') {
    s.title = safeText(e.title, 300) || state.title;
    s.cwd = e.cwd || state.cwd;
    s.model = e.model || state.model;
  }
  if (e.kind === 'turn') {
    if (e.status === 'inProgress' && (e.turnId !== state.turnId || !state.turnId)) {
      s.plan = []; s.tools = []; s.startedAt = e.at; s.endedAt = null;
      s.usage = { ...state.usage, last: null, at: null };
    }
    s.turnId = e.turnId || state.turnId;
    s.phase = ({ inProgress: 'executing', completed: 'completed', failed: 'failed', interrupted: 'interrupted' })[e.status] || 'unknown';
    if (e.status !== 'inProgress') { s.endedAt = e.at; s.tools = state.tools.map(t => t.status === 'inProgress' ? { ...t, status: 'unknown' } : t); }
  }
  if (e.kind === 'phase') s.phase = e.phase || 'unknown';
  if (e.kind === 'plan') s.plan = (Array.isArray(e.plan) ? e.plan : []).slice(0, 100).map(p => ({ step: safeText(p.step, 500), status: ['pending', 'inProgress', 'completed'].includes(p.status) ? p.status : 'unknown' }));
  if (e.kind === 'tool') {
    const id = e.toolId || e.id;
    const previous = state.tools.find(t => t.id === id);
    const tool = { ...previous, id, name: e.name || previous?.name || 'tool', status: e.status || 'unknown', at: e.at, text: e.text, exitCode: e.exitCode ?? null };
    s.tools = [...state.tools.filter(t => t.id !== id), tool].slice(-40);
  }
  if (e.kind === 'usage') {
    s.usage = { total: numberOrNull(e.total), input: numberOrNull(e.input), cached: numberOrNull(e.cached), output: numberOrNull(e.output),
      last: numberOrNull(e.last), contextWindow: numberOrNull(e.contextWindow), at: e.at };
  }
  return s;
}
