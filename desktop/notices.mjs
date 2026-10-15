import path from 'node:path';
import { safeText } from '../src/core/engine.mjs';
export const noticePreferences=()=>({enabled:true,whenHidden:true,ordinaryTools:false,messagePreview:false,opacity:.85,duration:5,position:'near-tag'});
export function validateNoticePreference(key,value){
 const defaults=noticePreferences();if(!Object.hasOwn(defaults,key))throw Error('Unknown notice preference');
 if(typeof defaults[key]==='boolean'&&typeof value!=='boolean')throw Error('Boolean required');
 if(key==='opacity'&&(!Number.isFinite(value)||value<.5||value>1))throw Error('Invalid notice opacity');
 if(key==='duration'&&(!Number.isInteger(value)||value<2||value>30))throw Error('Invalid notice duration');
 if(key==='position'&&!['top-left','top-right','bottom-left','bottom-right','near-tag'].includes(value))throw Error('Invalid notice position');return value;
}
export class NoticeFeed{
 constructor(){this.invalidate();}
 invalidate(){this.key=null;this.seen=new Set();}
 observe(s,prefs=noticePreferences()){
  const key=JSON.stringify(s.access?.sessionRef||s.task.id),events=s.task.events||[];
  if(this.key!==key){this.key=key;this.seen=new Set(events.map(e=>e.id));return [];}
  const notices=[];for(const e of events){if(this.seen.has(e.id))continue;this.seen.add(e.id);let code=null,priority=1;
   if(e.kind==='message'&&s.source.origin==='codex')code='reply';
   if((e.kind==='tool'&&e.status==='failed')||(e.kind==='turn'&&e.status==='failed')||(e.kind==='hook'&&e.metadata?.tool_status==='failed')){code='failure';priority=2;}
   if((e.kind==='turn'&&['completed','interrupted'].includes(e.status))||(e.kind==='hook'&&e.name==='Stop'))code='turn-ended';
   if(e.kind==='warning'){code='attention';priority=2;}
   if(!code&&prefs.ordinaryTools&&(e.kind==='tool'||e.kind==='hook')){code='activity';priority=0;}
   if(!code)continue;
   const n={id:e.id,code,priority,count:1,source:s.source.origin,sessionId:s.task.id,at:e.at||null};
   if(prefs.messagePreview&&code==='reply'&&s.source.contentAccess?.readable&&s.source.origin==='codex')n.preview=safeText(e.text,180).replace(/(?:password|api[_ -]?key|secret)\s*[:=]\s*\S+/gi,'[redacted]');
   notices.push(n);
  }
  this.seen=new Set([...this.seen].slice(-400));return notices.sort((a,b)=>b.priority-a.priority);
 }
}
/** Original Publication lineage governs queue, popup, history and final IPC writes. */
export class NotificationCenter{
 constructor({BrowserWindow,screen,root,settings,webPreferences,register,host,getMode,getDisplayId,getAnchor,clearWindows,onFailure}){Object.assign(this,{BrowserWindow,screen,root,settings,webPreferences,register,host,getMode,getDisplayId,getAnchor,clearWindows,onFailure});this.feed=new NoticeFeed();this.queue=[];this.records=[];this.serial=0;this.epoch=0;this.lastShown=0;this.onSnapshot=packet=>this.observe(packet);this.onInvalidate=()=>this.clear();host.on('snapshot',this.onSnapshot);host.on('invalidate',this.onInvalidate);}
 prefs(){return {...noticePreferences(),...this.settings.value.notices};}
 system(code){if(!['cache-cleaned','power-countdown','power-cancelled','power-failed'].includes(code))throw Error('Invalid system notice');if(this.host.state!=='running')return;const s=this.host.ready(),value=s.publication.seal({}, {ref:s.currentRef()}),notice={id:'system:'+Date.now(),code,priority:2,count:1,source:'app',sessionId:null,at:new Date().toISOString()};this.queue.push({s,value,notice,time:Date.now()});this.queue=this.queue.slice(-16);this.schedule();}
 valid(r){return this.host.state==='running'&&this.host.service===r.s&&r.s.publication.valid(r.value);}
 observe({s,value}){
  try{const prefs=this.prefs(),notices=this.feed.observe(value,prefs);for(const n of notices){const record={s,value,notice:n,time:Date.now()};this.records.push(record);if(!prefs.enabled||this.getMode()==='DOCKED_EXPANDED'||(this.getMode()==='HIDDEN'&&!prefs.whenHidden))continue;
   const previous=this.queue.find(r=>r.notice.code===n.code&&r.notice.sessionId===n.sessionId&&Date.now()-r.time<8000&&this.valid(r));if(previous){previous.notice={...n,count:previous.notice.count+1};previous.s=s;previous.value=value;previous.time=Date.now();}else this.queue.push(record);
  }
  this.records=this.records.filter(r=>this.valid(r)).slice(-40);this.queue=this.queue.filter(r=>this.valid(r)).sort((a,b)=>b.notice.priority-a.notice.priority).slice(0,16);if(this.queue.length&&!this.flushTimer)this.flushTimer=setTimeout(()=>{this.flushTimer=null;this.flush().catch(()=>this.onFailure('NOTICE_FAILED'));},250);
  }catch{this.clear();}
 }
 async create(){if(this.window&&!this.window.isDestroyed())return this.window;if(this.creating)return this.creating;
  this.creating=(async()=>{const w=this.window=new this.BrowserWindow({width:380,height:114,frame:false,transparent:true,backgroundColor:'#00000000',show:false,focusable:false,skipTaskbar:true,resizable:false,movable:false,alwaysOnTop:true,title:'APS · Notification',webPreferences:this.webPreferences});this.register(w,'notice','aps://studio/notice.html');w.setIgnoreMouseEvents(true);await w.loadURL('aps://studio/notice.html');return w;})();try{return await this.creating;}finally{this.creating=null;}
 }
 async flush(){
  if(!this.queue.length)return;const epoch=this.epoch,r=this.queue.shift(),prefs=this.prefs();if(!this.valid(r)||!prefs.enabled||this.getMode()==='DOCKED_EXPANDED')return this.schedule();
  if(Date.now()-this.lastShown<3000&&r.notice.priority===0){this.queue.unshift(r);return this.schedule();}
  const win=await this.create();if(epoch!==this.epoch||!this.valid(r)||!prefs.enabled)return;
  this.reposition();win.setOpacity(prefs.opacity);
  const value=r.s.publication.seal({notice:r.notice},{...r.s.publication.context(r.value),ref:r.value.access.sessionRef});
  r.s.publication.write(value,json=>win.webContents.send('aps:notice',{serial:++this.serial,expiresAt:Date.now()+prefs.duration*1000,json}));
  win.showInactive();this.lastShown=Date.now();clearTimeout(this.dismissTimer);this.dismissTimer=setTimeout(()=>{this.hide();this.schedule();},prefs.duration*1000);
 }
 reposition(){const win=this.window;if(!win||win.isDestroyed())return;const ds=this.screen.getAllDisplays(),anchor=this.getAnchor?.(),d=anchor&&this.screen.getDisplayMatching?this.screen.getDisplayMatching(anchor.bounds):ds.find(d=>d.id===this.getDisplayId())||this.screen.getPrimaryDisplay(),a=d.workArea,b=win.getBounds(),pos=this.prefs().position;let x=pos.endsWith('left')?a.x+16:a.x+a.width-b.width-16,y=pos.startsWith('top')?a.y+16:a.y+a.height-b.height-16;
  if(anchor){const r=anchor.bounds;x=anchor.edge==='right'?r.x-b.width-8:r.x+r.width+8;y=r.y;if(!anchor.edge&&x+b.width>a.x+a.width-8)x=r.x-b.width-8;if(anchor.edge==='top'){x=r.x;y=r.y+r.height+8;}if(anchor.edge==='bottom'){x=r.x;y=r.y-b.height-8;}}
  win.setBounds({x:Math.round(Math.max(a.x+8,Math.min(a.x+a.width-b.width-8,x))),y:Math.round(Math.max(a.y+8,Math.min(a.y+a.height-b.height-8,y))),width:b.width,height:b.height});
 }
 schedule(){if(this.queue.length&&!this.flushTimer)this.flushTimer=setTimeout(()=>{this.flushTimer=null;this.flush().catch(()=>this.onFailure('NOTICE_FAILED'));},500);}
 hide(){if(this.window&&!this.window.isDestroyed()){this.window.webContents.send('aps:notice',{serial:++this.serial,clear:true});this.window.hide();}}
 clear(){this.epoch++;this.feed.invalidate();this.records=[];this.queue=[];clearTimeout(this.flushTimer);this.flushTimer=null;clearTimeout(this.dismissTimer);this.hide();this.clearWindows?.();}
 history(){const s=this.host.ready(),records=this.records.filter(r=>this.valid(r)),permits=[...new Set(records.flatMap(r=>s.publication.context(r.value).permits))];return this.host.remember(s,s.publication.seal({notices:records.map(r=>r.notice)},{permits,ref:s.currentRef()}));}
 close(){this.clear();this.host.removeListener('snapshot',this.onSnapshot);this.host.removeListener('invalidate',this.onInvalidate);this.window?.destroy();}
}
