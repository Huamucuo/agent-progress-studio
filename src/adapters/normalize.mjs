import { safeText } from '../core/engine.mjs';
const plan = entries => (Array.isArray(entries) ? entries : []).map(p => ({ step: p.step, status: p.status === 'in_progress' ? 'inProgress' : p.status }));
const parse = value => { try { return typeof value === 'string' ? JSON.parse(value) : value; } catch { return null; } };
const textContent = content => Array.isArray(content) ? content.filter(x => ['input_text', 'output_text', 'text'].includes(x.type)).map(x => x.text || '').join('\n') : '';
function publicChat(payload,role){
 if(payload.role!=null&&payload.role!==role)return false;
 if(payload.channel!=null&&!['commentary','final'].includes(payload.channel))return false;
 if(payload.phase!=null&&!['commentary','final_answer'].includes(payload.phase))return false;
 return !Object.hasOwn(payload,'encrypted_content');
}
function usage(info, base) {
  const total = info?.total_token_usage || info?.total || {};
  const last = info?.last_token_usage || info?.last || {};
  return { ...base, kind: 'usage', total: total.total_tokens ?? total.totalTokens, input: total.input_tokens ?? total.inputTokens,
    cached: total.cached_input_tokens ?? total.cachedInputTokens, output: total.output_tokens ?? total.outputTokens,
    last: last.total_tokens ?? last.totalTokens, contextWindow: info?.model_context_window ?? info?.modelContextWindow };
}
function itemEvent(item, completed, base) {
  const type = String(item?.type || '').toLowerCase();
  if (type === 'agentmessage') return publicChat(item,'assistant')&&typeof item.text==='string'?[{ ...base, kind: 'message', chatRole:'assistant',chatVisibility:'public',text: safeText(item.text) }]:[];
  if (type === 'usermessage') return publicChat(item,'user')?[{ ...base, kind: 'task', chatRole:'user',chatVisibility:'public',title: textContent(item.content) }]:[];
  if (['commandexecution', 'mcptoolcall', 'dynamictoolcall', 'collabagenttoolcall', 'filechange', 'websearch'].includes(type)) {
    const exitCode = item.exitCode ?? item.exit_code;
    return [{ ...base, kind: 'tool', toolId: item.id, name: item.tool || item.name || item.type,
      status: completed ? ((exitCode != null && exitCode !== 0) || item.status === 'failed' ? 'failed' : item.status === 'declined' ? 'declined' : 'completed') : 'inProgress',
      exitCode, ...(type==='commandexecution'&&typeof item.command==='string'?{command:safeText(item.command,2000)}:{}), text: safeText(item.aggregatedOutput ?? item.aggregated_output ?? item.command ?? item.output ?? item.query ?? '') }];
  }
  return [];
}

export function normalizeRecord(record, id) {
  const p = record?.payload || {}, base = { id, at: record?.timestamp || null, source: 'codex-log' };
  if (record.type === 'session_meta') return [{ ...base, kind: 'task', cwd: p.cwd }];
  if (record.type === 'turn_context') return [{ ...base, kind: 'task', model: p.model, cwd: p.cwd }];
  if (record.type === 'event_msg') {
    if (p.type === 'token_count' && p.info) return [usage(p.info, base)];
    if (['task_started', 'task_complete', 'turn_aborted'].includes(p.type)) return [{ ...base, kind: 'turn', turnId: p.turn_id,
      status: { task_started: 'inProgress', task_complete: 'completed', turn_aborted: 'interrupted' }[p.type] }];
    if (p.type === 'user_message') return publicChat(p,'user')&&typeof p.message==='string'?[{ ...base, kind: 'task', chatRole:'user',chatVisibility:'public',title: p.message }]:[];
    if (p.type === 'agent_message') return publicChat(p,'assistant')&&typeof p.message==='string'?[{ ...base, kind: 'message', chatRole:'assistant',chatVisibility:'public',text: safeText(p.message) }]:[];
    if (p.type === 'item_started' || p.type === 'item_completed') return itemEvent(p.item, p.type === 'item_completed', base);
    if (p.type === 'plan_update' || p.type === 'task_plan') return [{ ...base, kind: 'plan', plan: plan(p.plan) }];
  }
  if (record.type === 'response_item') {
    if (['function_call', 'custom_tool_call'].includes(p.type)) {
      if (/(^|\.)update_plan$/.test(p.name || '')) {
        const args = parse(p.arguments ?? p.input);
        if (args?.plan) return [{ ...base, kind: 'plan', plan: plan(args.plan), text: args.explanation }];
      }
      const args=parse(p.arguments??p.input), command=['exec_command','shell_command','shell'].includes(p.name)?args?.cmd??args?.command:null;
      return [{ ...base, kind: 'tool', toolId: p.call_id || p.id, name: p.name, status: 'inProgress', ...(typeof command==='string'?{command:safeText(command,2000)}:{}), text: safeText(p.arguments ?? p.input) }];
    }
    if (['function_call_output', 'custom_tool_call_output'].includes(p.type)) {
      const out = typeof p.output === 'string' ? p.output : JSON.stringify(p.output);
      const exit = /(?:exit_code["']?\s*:\s*|(?:exit|exited with) code\s*:?\s*)(-?\d+)/i.exec(out || '');
      return [{ ...base, kind: 'tool', toolId: p.call_id, status: exit && Number(exit[1]) !== 0 ? 'failed' : 'completed', exitCode: exit ? Number(exit[1]) : null, text: safeText(out) }];
    }
    // Never retain encrypted reasoning, developer/system prompts or raw world state.
  }
  return [];
}

export function normalizeNotification(message, id) {
  const p = message.params || {}, base = { id, at: p.timestamp || null, source: 'app-server' };
  switch (message.method) {
    case 'turn/plan/updated': return [{ ...base, kind: 'plan', plan: plan(p.plan), text: p.explanation }];
    case 'thread/tokenUsage/updated': return [usage(p.tokenUsage, base)];
    case 'turn/started': case 'turn/completed': return [{ ...base, kind: 'turn', turnId: p.turn?.id, status: p.turn?.status }];
    case 'item/started': case 'item/completed': return itemEvent(p.item, message.method === 'item/completed', base);
    case 'thread/status/changed': return [{ ...base, kind: 'phase', phase: { active: 'executing', idle: 'idle', systemError: 'failed', notLoaded: 'unknown' }[p.status?.type] || 'unknown' }];
    case 'error': case 'warning': return [{ ...base, kind: 'warning', text: safeText(p.message || p.error?.message) }];
    default: return [];
  }
}
