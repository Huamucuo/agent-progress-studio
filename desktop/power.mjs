/** No persisted arming. Test clock and executor never reach Windows implicitly. */
export class ShutdownController{
 #scope=[];#activity=new Map();#staleProofs=new Set();#armed=false;
 constructor({clock=()=>Date.now(),execute=async()=>{throw Error('No authorized executor');},valid=()=>false,onChange=()=>{}}={}){Object.assign(this,{clock,execute,valid,onChange});this.state='DISABLED';this.generation=0;this.stabilityMs=120000;this.countdownMs=60000;}
 status(){return {state:this.state,taskCount:this.#scope.length,mode:this.mode||'selected',stabilitySeconds:this.stabilityMs/1000,countdownSeconds:this.countdownMs/1000,remainingSeconds:this.deadline?Math.max(0,Math.ceil((this.deadline-this.clock())/1000)):null,reason:this.reason||null};}
 set(state,reason=null){const changed=this.state!==state||this.reason!==reason;this.state=state;this.reason=reason;if(changed)this.onChange(this.status());}
 arm(ids,{mode='selected',stabilityMs=120000,countdownMs=60000}={}){
  if(!Array.isArray(ids)||!ids.length||ids.length>100||new Set(ids).size!==ids.length||ids.some(x=>typeof x!=='string'||!x))throw Error('Invalid task scope');
  if(!['selected','all'].includes(mode))throw Error('Invalid task scope mode');
  if(!Number.isInteger(stabilityMs)||stabilityMs<120000||stabilityMs>3600000)throw Error('Invalid stability duration');
  if(!Number.isInteger(countdownMs)||countdownMs<60000||countdownMs>3600000)throw Error('Invalid countdown duration');
  this.generation++;this.#scope=[...ids];this.mode=mode;this.stabilityMs=stabilityMs;this.countdownMs=countdownMs;this.#armed=true;this.#activity.clear();this.#staleProofs.clear();this.readyAt=null;this.deadline=null;this.set('ARMED');
 }
 cancel(){this.generation++;this.#armed=false;this.deadline=null;this.readyAt=null;this.set('CANCELLED','USER_CANCELLED');}
 disable(){this.generation++;this.#armed=false;this.deadline=null;this.readyAt=null;this.#scope=[];this.set('DISABLED');}
 invalidate(){this.generation++;this.#armed=false;this.#scope=[];this.#activity.clear();this.#staleProofs.clear();this.deadline=null;this.readyAt=null;if(this.state!=='DISABLED')this.set('CANCELLED','AUTHORITY_OR_SOURCE_CHANGED');}
 reconfirm(id,key){if(this.#scope.includes(id)){this.#staleProofs.delete(id);this.#activity.set(id,key);this.readyAt=null;this.deadline=null;}}
 async update(tasks){
  if(!this.#armed||['SHUTDOWN_REQUESTED','SHUTDOWN_FAILED'].includes(this.state))return this.status();
  if(!this.valid()){this.invalidate();return this.status();}
  const selected=this.#scope.map(id=>tasks.find(t=>t.id===id));
  const block=reason=>{this.readyAt=null;this.deadline=null;this.set('BLOCKED',reason);return this.status();};
  if(this.mode==='all'&&tasks.some(t=>!this.#scope.includes(t.id)))return block('NEW_TASK_OUTSIDE_FIXED_SCOPE');
  if(selected.some(t=>!t))return block('MISSING_TASK');
  for(const t of selected){const before=this.#activity.get(t.id);if(before!==undefined&&before!==t.activityKey)this.#staleProofs.add(t.id);this.#activity.set(t.id,t.activityKey);}
  if(this.#staleProofs.size){this.readyAt=null;this.deadline=null;this.set('WAITING','NEW_ACTIVITY_INVALIDATES_COMPLETION');return this.status();}
  if(selected.some(t=>!t.authorized||!t.reliable||!t.connected||t.failed||t.waitingHuman||t.finalComplete!==true||t.backgroundComplete!==true))return block('UNKNOWN_DISCONNECTED_OR_UNVERIFIED');
  if(selected.some(t=>t.running)){this.readyAt=null;this.deadline=null;this.set('WAITING','RUNNING');return this.status();}
  if(this.readyAt===null||this.readyAt===undefined){this.readyAt=this.clock();this.set('READY');}
  if(!this.deadline&&this.clock()-this.readyAt>=this.stabilityMs){this.deadline=this.clock()+this.countdownMs;this.set('COUNTDOWN');}
  if(this.deadline&&this.clock()>=this.deadline){if(!this.valid())return block('AUTHORIZATION_EXPIRED');const generation=this.generation;this.set('SHUTDOWN_REQUESTED');try{await this.execute();}catch{if(this.generation===generation)this.set('SHUTDOWN_FAILED','WINDOWS_REQUEST_REJECTED');}if(this.generation===generation)this.#armed=false;}
  return this.status();
 }
}
