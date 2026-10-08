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
  if (e.kind === 'hook') {
    s.phase = e.phase || 'unknown';
    s.turnId = e.metadata?.turn_id ?? null;
  }
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

/** Three different questions: no observed count is a model of total remaining work. */
export function progressSummary(task, acceptance) {
  const plan = { completed: 0, total: task.plan.length, inProgress: 0, pending: 0, unknown: 0 };
  for (const step of task.plan) plan[step.status]++;
  plan.percent = plan.total ? Math.round(plan.completed / plan.total * 1000) / 10 : null;
  return { overall: { percent: null }, plan, acceptance: { percent: acceptance.percent, met: acceptance.met, total: acceptance.total } };
}

/** Last reported activity, not a host heartbeat. Hooks have no authorized call ID. */
export function monitorTask(task, { now = Date.now(), connected = true, mode = 'local' } = {}) {
  const activity = [...task.events].reverse().find(e => ['hook', 'tool', 'turn', 'phase'].includes(e.kind));
  let status = 'waiting_event', toolName = null, outcome = 'unknown';
  if (activity?.kind === 'hook') {
    status = ({ SessionStart: 'session_seen', UserPromptSubmit: 'prompt_received', PreToolUse: 'tool_running', PostToolUse: 'tool_finished', Stop: 'turn_stopped' })[activity.name] || 'waiting_event';
    toolName = activity.metadata?.tool_name || null;
    outcome = activity.metadata?.tool_status || 'unknown';
    if (outcome === 'failed') status = 'tool_failed';
  } else if (activity?.kind === 'tool') {
    const tool = task.tools.find(t => t.id === (activity.toolId || activity.id));
    toolName = tool?.name || activity.name || null;
    status = activity.status === 'inProgress' ? 'tool_running' : activity.status === 'failed' ? 'tool_failed' : 'tool_finished';
    outcome = activity.status === 'failed' ? 'failed' : activity.exitCode === 0 ? 'succeeded' : 'unknown';
  } else if (activity?.kind === 'turn') {
    status = ({ inProgress: 'turn_running', completed: 'turn_completed', interrupted: 'turn_interrupted', failed: 'turn_failed' })[activity.status] || 'waiting_event';
  } else if (activity?.kind === 'phase') {
    status = ({ executing: 'turn_running', reviewing: 'reviewing', idle: 'turn_stopped', completed: 'turn_completed', interrupted: 'turn_interrupted', failed: 'turn_failed' })[activity.phase] || 'waiting_event';
  }
  let at = activity?.at || null;
  const historyTerminal = mode === 'app-server' && ({ completed: 'turn_completed', interrupted: 'turn_interrupted', failed: 'turn_failed' })[task.phase];
  if (historyTerminal) {
    status = historyTerminal; toolName = null; outcome = 'unknown';
    // Read history has a terminal state but may have no completion timestamp.
    at = activity?.kind === 'turn' ? activity.at || null : null;
  }
  const age = now - Date.parse(at);
  const fresh = mode === 'demo' || (Number.isFinite(age) && age >= 0 && age <= 30000);
  const terminal = ['turn_completed', 'turn_interrupted', 'turn_failed', 'turn_stopped'].includes(status);
  const observedStatus = status;
  if (!connected) status = 'source_unavailable';
  else if (activity && !fresh && !terminal) status = 'no_recent_evidence';
  return { status, observedStatus, toolName, outcome, at, fresh, staleAfterMs: 30000 };
}
