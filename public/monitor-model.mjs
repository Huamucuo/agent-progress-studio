// Deterministic projection of data already authorized by the service.
// No I/O, no model/API calls, no source discovery or independent grants.
const text=(s,n=300)=>String(s??'').replace(/\bsk-[A-Za-z0-9_-]{12,}/g,'[redacted]').replace(/(Bearer\s+)[A-Za-z0-9._-]{12,}/gi,'$1[redacted]').slice(0,n);
function conversation(s){
 const demo=s.source?.mode==='demo',codex=s.source?.origin==='codex'&&['local','app-server'].includes(s.source?.mode),authorized=codex&&s.source?.contentAccess?.granted===true&&s.source?.contentAccess?.readable===true;
 if(!demo&&!authorized)return {state:codex?'UNAUTHORIZED':'UNSUPPORTED',messages:[],limit:20};
 const messages=(s.task?.events||[]).filter(e=>((e.kind==='message'&&e.chatRole==='assistant')||(e.kind==='task'&&e.chatRole==='user'))&&e.chatVisibility==='public'||demo&&(e.kind==='message'||e.kind==='task'&&typeof e.title==='string')).slice(-20).map(e=>{
  const raw=String(e.kind==='task'?e.title??'':e.text??''),body=text(raw,2000).replace(/((?:api[_ -]?key|access[_ -]?token|password|secret)\s*[:=]\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\s,;]+)/gi,'$1[redacted]').replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,'[redacted]');
  return {id:text(e.id,160),role:e.kind==='task'?'user':'assistant',text:body,at:e.at||null,truncated:raw.length>2000};
 });return {state:demo?'DEMO':'AVAILABLE',messages,limit:20};
}
export function friendlyTaskTitle(task,english=false){const title=english&&task?.titleEn?task.titleEn:task?.title;if(!title||/^\s*#?\s*Files (?:mentioned|pasted)/i.test(title)||/^\s*<send_user_message/.test(title))return english?'Selected local task':'当前选中的本地任务';return text(title.split(/\r?\n/)[0].replace(/^#+\s*/,''),80);}
const words={
 waiting:['尚未收到可判断运行状态的活动。','No activity is available to determine whether the Agent is running.'],
 disconnected:['数据来源暂不可用，当前执行状态未知。','The source is unavailable; current execution is unknown.'],
 stale:['APS 正在持续监测，暂未收到新的活动记录；Agent 此刻是否仍在执行尚未确认。','APS continues observing, but no new activity has arrived. Execution now is unconfirmed.'],
 'tool-waiting':['工具启动记录已收到，尚未收到对应结束记录；APS 持续监测，此刻是否仍在执行未确认。','A tool start was recorded; its corresponding end has not arrived. APS continues observing; execution now is unconfirmed.'],
 'turn-ended':['当前回合已结束，但尚无足够证据判断整个任务是否完成。','This turn ended. Evidence is insufficient to declare the entire task complete.'],
 'tool-running':['已观测到工具开始；尚未收到完成结果。','A tool started; its completion result has not arrived.'],
 'tool-returned':['工具已返回；是否成功以明确结果为准，整体完成度仍未知。','The tool returned. Success requires an explicit result; overall completion remains unknown.'],
 'tool-failed':['检测到工具失败，需要查看相关活动或失败证据。','A tool failure was reported. Review its activity or failure evidence.'],
 'turn-failed':['当前回合失败，请查看回合记录；失败原因尚未确认。','This turn failed. Review its record; the cause is unconfirmed.'],
 'turn-running':['已收到回合活动；这不能说明正在思考的内容或剩余时间。','Turn activity was observed. It does not reveal hidden reasoning or remaining time.'],
 'test-success':['Agent 已执行一轮自动化测试，命令返回成功；这不代表全部产品功能已经验证。','The Agent ran an automated test command and it returned success. This does not verify every product feature.'],
 'test-failed':['检测到测试命令返回失败，需要查看失败项目。','A test command returned failure. Review the failed checks.'],
 'acceptance-failed':['已有验收项目失败，需要处理；其他工作是否完成仍依据各自证据。','An acceptance check failed and needs attention. Other work still requires its own evidence.']
};
function testCommand(t){
 if(!t||!['commandExecution','exec_command','shell_command','shell'].includes(t.name))return false;
 let command=t.command;
 if(Array.isArray(command))command=command.join(' ');if(typeof command!=='string')return false;
 // Recognize a direct command only, not output/echo text or complex shell scripts.
 if(/[;&|\r\n<>`]/.test(command)||/(?:^|\s)(?:--help|-h|--version|--dry-run)(?:\s|$)/.test(command))return false;
 return /^(?:npm(?:\.cmd)?\s+(?:test|run\s+test)|pnpm(?:\.cmd)?\s+test|yarn(?:\.cmd)?\s+test|(?:node(?:\.exe)?\s+--test)|(?:python(?:\.exe)?\s+-m\s+pytest)|pytest|cargo\s+test|dotnet\s+test)(?:\s|$)/.test(command.trim());
}
export function explainMonitor(s){
 const m=s.monitor||{},events=s.task?.events||[],last=[...events].reverse().find(e=>['tool','hook','turn','phase'].includes(e.kind));
 let code='waiting',basis=last?[{kind:'event',id:text(last.id,160),type:text(last.kind,40),name:text(last.name,100),at:last.at||null}]:[];
 if(!s.source?.connected&&s.source?.mode!=='demo')code='disconnected';
 else if(m.status==='no_recent_evidence')code='stale';
 else if(m.status==='awaiting_tool_result')code='tool-waiting';
 else if(['turn_stopped','turn_completed','turn_interrupted'].includes(m.status))code='turn-ended';
 else if(m.status==='tool_failed')code='tool-failed';
 else if(m.status==='turn_failed')code='turn-failed';
 else if(m.status==='tool_running')code='tool-running';
 else if(m.status==='tool_finished'){
  code='tool-returned';const tool=(s.task?.tools||[]).find(t=>t.id===(last?.toolId||last?.id));
  if(s.source?.origin==='codex'&&last?.kind==='tool'&&testCommand(tool)&&tool.status!=='inProgress'&&Number.isInteger(tool.exitCode))code=tool.exitCode===0?'test-success':'test-failed';
 }
 else if(['turn_running','prompt_received','reviewing'].includes(m.status))code='turn-running';
 if(!['disconnected','stale','tool-failed','test-failed'].includes(code)){
  const failed=s.acceptance?.criteria?.find(c=>c.status==='failed');if(failed){code='acceptance-failed';basis=[{kind:'criterion',id:text(failed.id,80),status:'failed'}];}
 }
 const tool=(s.task?.tools||[]).find(t=>t.id===(last?.toolId||last?.id));
 const factZh=code.startsWith('test-')?`记录中的测试命令退出码：${tool.exitCode}。`:last?`收到 ${text(last.name||last.kind,100)} 活动${last.at?'，时间 '+text(last.at,50):''}。`:'尚无可用活动记录。';
 const factEn=code.startsWith('test-')?`Recorded test-command exit code: ${tool.exitCode}.`:last?`Observed ${text(last.name||last.kind,100)}${last.at?' at '+text(last.at,50):''}.`:'No activity record is available.';
 return {code,kind:'interpretation',zh:words[code][0],en:words[code][1],facts:{zh:factZh,en:factEn},basis,unknowns:{zh:['总体项目进度未知','不读取或推断隐藏思考','单次工具/回合结果不是完整产品验收'],en:['Overall project progress is unknown','Hidden reasoning is neither read nor inferred','A tool or turn result is not full product acceptance']}};
}
export function projectMonitor(s){
 const p=s.progress||{},plans=(s.task?.plan||[]).slice(0,100).map(x=>({step:text(x.step,500),status:['completed','inProgress','pending','failed'].includes(x.status)?x.status:'unknown'}));
 const tools=s.source?.mode==='work-hooks'?(s.task?.events||[]).filter(e=>e.kind==='hook'&&['PreToolUse','PostToolUse'].includes(e.name)).slice(-8).map(e=>({id:text(e.id,160),name:text(e.metadata?.tool_name||'unknown',100),status:({started:'inProgress',succeeded:'completed',failed:'failed',returned:'returned'})[e.metadata?.tool_status]||'unknown',at:e.at||null,exitCode:null})):(s.task?.tools||[]).slice(-8).map(t=>({id:text(t.id,160),name:text(t.name,100),status:text(t.status,30),at:t.at||null,exitCode:Number.isInteger(t.exitCode)?t.exitCode:null}));
 const criteria=(s.acceptance?.criteria||[]).slice(0,100).map(c=>({id:text(c.id,80),title:text(c.title,300),titleEn:text(c.titleEn,300),status:text(c.status,30),implemented:!!c.implemented,automated:!!c.automated}));
 const m=s.monitor||{};
 return {schemaVersion:1,version:s.version,observedAt:s.observedAt,source:{mode:s.source?.mode,origin:s.source?.origin||'unknown',connected:!!s.source?.connected,contentReadable:!!s.source?.contentAccess?.readable,replyGranted:!!s.source?.replyAccess?.granted,replySupported:!!s.source?.replyAccess?.supported},task:{id:text(s.task?.id,128),title:s.task?.title?friendlyTaskTitle(s.task):'',titleEn:s.task?.title?friendlyTaskTitle(s.task,true):''},monitor:{status:m.status,observedStatus:m.observedStatus,toolName:text(m.toolName,160)||null,outcome:m.outcome,at:m.at,fresh:m.fresh,staleAfterMs:m.staleAfterMs},progress:{overall:{percent:null},plan:{total:plans.length,completed:plans.filter(x=>x.status==='completed').length,percent:plans.length?p.plan?.percent??null:null},acceptance:{percent:p.acceptance?.percent??null,met:p.acceptance?.met??0,total:p.acceptance?.total??0}},plans,tools,criteria,explanation:explainMonitor(s),conversation:conversation(s),sessions:(s.sessions||[]).slice(0,100).map(x=>({id:text(x.id,128),origin:x.origin||'unknown',updatedAt:x.updatedAt||null,label:text(x.label||x.id,128)}))};
}
