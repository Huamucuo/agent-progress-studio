import {execFile}from 'node:child_process';import {promisify}from 'node:util';import fs from 'node:fs/promises';import path from 'node:path';
import {ShutdownController}from './power.mjs';import {sessionRef,refKey}from '../src/core/session-access.mjs';import {canonicalPath}from '../src/core/resource-registry.mjs';import {createState,reduceEvent,monitorTask}from '../src/core/engine.mjs';import {friendlyTaskTitle}from '../public/monitor-model.mjs';
import {officialBackground}from './background-status.mjs';
export const shutdownArguments=()=>['/s','/t','0'];
/** Called only at the end of an explicitly armed, freshly revalidated countdown. */
export async function windowsShutdown(check){if(process.platform!=='win32')throw Error('Windows shutdown unsupported');const directory=path.join(process.env.SystemRoot||'C:\\Windows','System32'),file=path.join(directory,'shutdown.exe');check();const info=await fs.lstat(file);check();if(!info.isFile()||info.isSymbolicLink()||await canonicalPath(file)!==file.toLowerCase())throw Error('System shutdown executable unavailable');check();return promisify(execFile)(file,shutdownArguments(),{shell:false,windowsHide:true,timeout:5000,maxBuffer:4096});}
const terminal=new Set(['turn_completed']);
const activityKey=(task,evidence)=>JSON.stringify([task.lastEventAt,task.phase,task.events?.at(-1)?.id,(task.tools||[]).map(t=>[t.id,t.status]),task.plan,evidence?.fingerprint]);
/** All monitored execution must end. Never asks for post-task completion confirmation. */
export class PowerManager{
 constructor({host,clock=()=>Date.now(),background=officialBackground,executor=async()=>{throw Error('No authorized shutdown executor');},simulation=true,onChange=()=>{}}){Object.assign(this,{host,clock,background,executor,simulation,onChange});this.completed=new Map();this.backgrounds=new Map();this.epoch=0;this.scope=[];this.last=host.service?.snapshot?{s:host.service,value:host.service.snapshot}:null;
  this.controller=new ShutdownController({clock,valid:()=>this.validArm(),execute:()=>this.execute(),onChange:()=>this.publish()});this.onSnapshot=p=>{this.last=p;if(!this.ticking)this.update().catch(()=>this.invalidate());};this.onInvalidate=()=>this.invalidate();host.on('snapshot',this.onSnapshot);host.on('invalidate',this.onInvalidate);
 }
 packet(){const p=this.last;if(this.host.state!=='running'||!p||p.s!==this.host.service||!p.s.publication.valid(p.value)||Date.now()-Date.parse(p.value.observedAt)>10000)throw Error('Fresh monitoring scope required');return p;}
 tasks(){let p;try{p=this.packet();}catch{return [];}const {s,value:v}=p,ref=s.currentRef();if(!ref||s.mode==='demo')return [];
  const make=(r,task,origin,authorized,connected,tracked,waiting=false)=>{const m=task?monitorTask(task,{mode:s.mode,connected}):{},key=refKey(r),k=task?activityKey(task,s.mode==='work-hooks'?null:v.evidence):null;
   const bg=this.backgrounds.get(key),fresh=bg&&bg.activityKey===k&&bg.s===s&&s.publication.valid(bg.value)&&Date.now()-bg.at<3000,backgroundComplete=!!fresh&&bg.data.supported===true&&bg.data.idle===true&&bg.data.count===0;
   const remainingPlan=!!task?.plan?.some(p=>p.status!=='completed'),remainingChecks=tracked&&s.mode!=='work-hooks'&&v.acceptance.criteria.some(c=>!['auto_verified','accepted'].includes(c.status));
   const finalComplete=!!task&&terminal.has(m.status)&&!remainingPlan&&!remainingChecks&&!(task.tools||[]).some(t=>t.status==='inProgress')&&backgroundComplete;
   return {id:key,key,sessionId:r.id,label:task?.title?friendlyTaskTitle(task):r.id.slice(-8),origin,authorized,connected,running:['tool_running','turn_running','prompt_received','awaiting_tool_result','reviewing'].includes(m.status)||(task?.tools||[]).some(t=>t.status==='inProgress'),waitingHuman:waiting,failed:['tool_failed','turn_failed'].includes(m.status),reliable:tracked&&origin!=='unknown'&&terminal.has(m.status),finalComplete,backgroundComplete,activityKey:k,completionSource:finalComplete?'OFFICIAL_IDLE_AND_ENDED_EXECUTION':'UNKNOWN',backgroundReason:fresh?bg.data.reason||null:'UNKNOWN_BACKGROUND_STATUS'};
  };
  if(s.mode==='work-hooks'){
   const observed=s.access.can(sessionRef(s.hookBackend,'scope'),'observe')&&s.source?.permit&&s.access.valid(s.source.permit),groups=new Map();
   if(observed)for(const [filename,{record:r}]of s.source.records){let task=groups.get(r.session_id)||createState(r.session_id);task=reduceEvent(task,{id:filename,at:r.timestamp,kind:'hook',name:r.event_type,metadata:r});groups.set(r.session_id,task);}
   return [...groups].slice(-100).map(([id,task])=>{const r=sessionRef(s.hookBackend,id);return make(r,task,s.access.origin(r),!!observed,v.source.connected,true);});
  }
  const keys=new Map(s.access.list(ref.backend).filter(r=>s.access.can(r,'content')).map(r=>[r.id,r]));keys.set(ref.id,ref);
  return [...keys.values()].slice(0,100).map(r=>{const current=r.id===ref.id;return make(r,current?v.task:null,s.access.origin(r),s.access.can(r,'content'),current&&v.source.connected,current&&!!v.source.contentAccess.readable,current&&v.acceptance.criteria.some(c=>c.status==='awaiting_human'));});
 }
 status(){return {...this.controller.status(),simulation:this.simulation,tasks:this.tasks().map(({activityKey,...t})=>t),coverage:'CURRENT_AUTHORIZED_SOURCE_ONLY',condition:'ALL_MONITORED_EXECUTION_ENDED',projectCompletion:'UNKNOWN',postTaskConfirmation:false};}
 output(){const p=this.packet();return this.host.remember(p.s,p.s.publication.seal(this.status(),{...p.s.publication.context(p.value),ref:p.value.access.sessionRef}));}
 validArm(){try{const p=this.packet();return !!this.armed&&p.s===this.armed.s&&p.s.publication.valid(this.armed.value);}catch{return false;}}
 publish(){const value={...this.controller.status(),simulation:this.simulation},key=JSON.stringify(value);if(key===this.published)return;this.published=key;this.onChange(value);}
 async arm(input,confirm){if(this.validArm())throw Error('Cancel the existing shutdown scope first');const epoch=++this.epoch,s=this.host.ready();this.host.checkMutationScope(s,input);const p=this.packet(),tasks=this.tasks(),ids=input.mode==='all'?tasks.map(t=>t.key):input.ids;
  if(!Array.isArray(ids)||!ids.length||ids.some(id=>!tasks.some(t=>t.key===id&&t.authorized)))throw Error('Authorized nonempty shutdown scope required');
  if(!await confirm(tasks.filter(t=>ids.includes(t.key))))return {cancelled:true};if(epoch!==this.epoch)throw Error('Shutdown authorization cancelled or superseded');this.host.checkMutationScope(s,input);p.s.publication.context(p.value);
  this.scope=[...ids];this.armed={s,value:s.publication.seal({}, {...s.publication.context(p.value),ref:p.value.access.sessionRef})};
  this.controller.arm(ids,{mode:input.mode,stabilityMs:(input.stabilitySeconds??120)*1000,countdownMs:(input.countdownSeconds??60)*1000});this.completed.clear();this.backgrounds.clear();clearInterval(this.timer);this.timer=setInterval(()=>this.tick().catch(()=>this.invalidate()),1000);this.timer.unref?.();await this.update();return this.output();
 }
 async inspect(force=false){if(!this.validArm())return;const p=this.packet(),ref=p.s.currentRef(),key=refKey(ref),t=this.tasks().find(t=>t.key===key),old=this.backgrounds.get(key);if(!t?.authorized||!t.reliable||t.running||t.failed||t.waitingHuman)return;if(!force&&old?.activityKey===t.activityKey&&Date.now()-old.at<2000)return;
  const epoch=this.epoch,check=()=>{if(epoch!==this.epoch||!this.validArm())throw Error('Background scope cancelled');p.s.publication.context(p.value);},data=await this.background({s:p.s,ref,check});check();if(this.tasks().find(x=>x.key===key)?.activityKey!==t.activityKey)return;
  this.backgrounds.set(key,{s:p.s,value:p.s.publication.seal({}, {...p.s.publication.context(p.value),ref}),data,activityKey:t.activityKey,at:Date.now()});
 }
 async update(){if(this.updating)return;this.updating=true;try{if(this.validArm())await this.inspect();const tasks=this.tasks();for(const t of tasks)if(t.finalComplete&&this.completed.get(t.key)!==t.activityKey){this.completed.set(t.key,t.activityKey);this.controller.reconfirm(t.key,t.activityKey);}await this.controller.update(tasks);this.publish();}finally{this.updating=false;}}
 async tick(){if(this.ticking||!['ARMED','WAITING','BLOCKED','READY','COUNTDOWN'].includes(this.controller.state))return;this.ticking=true;try{const s=this.host.ready();if(!this.last||Date.now()-Date.parse(this.last.value.observedAt)>2500)this.last={s,value:await s.refresh()};await this.update();}finally{this.ticking=false;}}
 async execute(){const epoch=this.epoch,s=this.host.ready();this.last={s,value:await s.refresh()};await this.inspect(true);this.last={s,value:await s.refresh()};const check=()=>{if(epoch!==this.epoch||!this.validArm())throw Error('Shutdown cancelled');const tasks=this.tasks(),chosen=this.scope.map(key=>tasks.find(t=>t.key===key));if(chosen.some(t=>!t||!t.authorized||!t.reliable||!t.connected||t.running||t.waitingHuman||t.failed||!t.finalComplete||!t.backgroundComplete)||(this.controller.mode==='all'&&tasks.some(t=>!this.scope.includes(t.key))))throw Error('Final shutdown conditions changed');};check();await this.executor(check);}
 cancel(){this.epoch++;this.controller.cancel();this.armed=null;this.completed.clear();this.backgrounds.clear();clearInterval(this.timer);this.publish();}
 invalidate(){this.epoch++;this.controller.invalidate();this.armed=null;this.scope=[];this.completed.clear();this.backgrounds.clear();this.last=null;clearInterval(this.timer);this.publish();}
 close(){this.invalidate();this.host.removeListener('snapshot',this.onSnapshot);this.host.removeListener('invalidate',this.onInvalidate);}
}
