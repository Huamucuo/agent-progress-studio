import path from 'node:path';
import {createHash}from 'node:crypto';
import {PetProgression}from '../src/pet/progression.mjs';
import {PetPackManager}from '../src/pet/pack.mjs';
import {PET_CHARACTERS,PET_ITEMS}from '../src/pet/catalog.mjs';
import {projectPet,normalizePetPreferences}from '../src/pet/state.mjs';
import {canonicalUuid}from '../src/core/session-access.mjs';

const digest=value=>createHash('sha256').update(value).digest('hex');
/** Local pet capabilities are separate from session capabilities. Facts are main-only. */
export class PetController{
 constructor({directory,settings,window,onChange,onFailure}){Object.assign(this,{directory,settings,window,onChange,onFailure});this.epoch=0;this.queue=Promise.resolve();this.closed=false;this.packs=new PetPackManager(path.join(directory,'packs'));}
 async ensurePacks(){if(this.packsReady)return;if(!this.packOpening)this.packOpening=this.packs.init().then(()=>{this.packsReady=true;});try{await this.packOpening;}finally{this.packOpening=null;}}
 async init(){if(this.settings.value.pet.enabled)try{await this.ensurePacks();await this.wallet();await this.window.create();}catch{this.error='PET_STORAGE_UNAVAILABLE';this.window.close();await this.settings.save({pet:{...this.settings.value.pet,enabled:false}});this.onFailure?.(this.error);}}
 async wallet(){if(this.progression)return this.progression;if(!this.opening)this.opening=(async()=>{const p=new PetProgression(path.join(this.directory,'progression'));await p.init();this.progression=p;return p;})();try{return await this.opening;}finally{this.opening=null;}}
 bind(host){if(this.host){this.host.removeListener('snapshot',this.observe);this.host.removeListener('invalidate',this.invalidate);this.host.removeListener('status',this.onStatus);}this.host=host;this.clear();this.observe=frame=>this.receive(frame);this.invalidate=()=>this.clear();this.onStatus=()=>{if(host.state!=='running')this.clear();};host.on('snapshot',this.observe);host.on('invalidate',this.invalidate);host.on('status',this.onStatus);}
 clear(){this.epoch++;this.seen=null;this.criteria=null;this.scope=null;this.activatedAt=Date.now();this.window.window?.webContents.send('aps:pet-clear');}
 receive({s,value}){
  if(this.closed||!this.settings.value.pet.enabled||this.host.state!=='running'||this.host.service!==s)return;
  try{s.publication.context(value);}catch{return this.clear();}
  const a=value.access,scope=JSON.stringify([a.authorityInstanceId,a.policyRevision,a.selectionRevision]);
  if(scope!==this.scope){this.clear();this.scope=scope;}
  const p=projectPet(value),events=value.task?.events||[],criteria=value.acceptance?.criteria||[];
  const baseline=this.seen===null,oldCriteria=this.criteria||new Map(),old=this.seen||new Set();
  this.seen=new Set(events.map(e=>e.id));this.criteria=new Map(criteria.map(c=>[c.id,c.status]));
  if(baseline||p.petState.demo||p.petState.origin==='unknown')return;
  const epoch=this.epoch,validate=()=>{if(this.closed||epoch!==this.epoch||!this.settings.value.pet.enabled||this.host.service!==s||this.host.state!=='running')return false;s.publication.context(value);return true;};
  const session=canonicalUuid(value.task?.id);if(!session)return;
  const base={canonicalSessionKey:p.petState.origin+':'+session,origin:p.petState.origin,live:true,demo:false};
  const activityAllowed=p.petState.connected&&(p.petState.origin==='work-local'?(a.dependencies||[]).some(d=>d.capability==='observe'):value.source.contentAccess?.readable===true||value.source.mode==='work-hooks'&&(a.dependencies||[]).some(d=>d.capability==='observe'));
  const facts=[];
  if(activityAllowed)for(const e of events){if(old.has(e.id)||Date.parse(e.at)<this.activatedAt)continue;const turnId=e.turnId||e.metadata?.turn_id;
   if(turnId&&(e.kind==='turn'&&e.status==='inProgress'||e.kind==='hook'&&e.name==='UserPromptSubmit'))facts.push({...base,kind:'live-turn-activity',turnId,at:e.at});
  }
  if((a.dependencies||[]).some(d=>d.capability==='evidence')&&value.workspace&&value.acceptance?.taskId){for(const c of criteria){if(!oldCriteria.has(c.id)||oldCriteria.get(c.id)===c.status||!['auto_verified','accepted'].includes(c.status))continue;
    facts.push({...base,kind:c.status==='accepted'?'criterion-human-accepted':'criterion-auto-verified',definitionKey:digest(value.workspace+'\0'+value.acceptance.taskId),criterionId:c.id,at:value.observedAt,requiresHuman:c.requiresHuman===true,automated:c.automated===true,implemented:c.implemented===true,checksRequired:(c.checks||[]).length>0,humanAccepted:c.review?.decision==='accept',evidenceCurrent:true});
   }}
  if(!facts.length)return;
  this.queue=this.queue.catch(()=>{}).then(async()=>{if(!validate())return;const wallet=await this.wallet();if(!validate())return;for(const f of facts){const r=await wallet.consume(f,{validate});if(r.awarded){this.notify();if(f.kind!=='live-turn-activity'&&validate())this.window.window?.webContents.send('aps:pet-interact',{action:'acceptance'});}}}).catch(()=>this.onFailure?.('PET_REWARD_FAILED'));
 }
 async status({minimal=false}={}){let progression;try{await this.ensurePacks();const w=await this.wallet();progression={available:true,...w.snapshot()};this.error=null;}catch{this.error='PET_STORAGE_UNAVAILABLE';progression={available:false,level:null,xp:0,totalXp:null,nextLevelXp:20,coins:null,owned:[],equipped:{},records:[]};}
  const value={preferences:{...this.settings.value.pet},window:this.window.status(),progression,error:this.error,characters:PET_CHARACTERS,items:PET_ITEMS,packs:this.packsReady?this.packs.list():[]};
  if(minimal){value.preferences.bounds=null;value.progression.records=[];value.packs=value.packs.map(p=>({id:p.id,states:p.states,canvas:p.canvas}));delete value.characters;delete value.items;}
  return value;}
 async preference(change){const p=normalizePetPreferences(change,this.settings.value.pet);if(!PET_CHARACTERS.some(c=>c.id===p.character)&&!this.packs.list().some(c=>c.id===p.character))throw Error('Unknown pet character');
  if(p.enabled){await this.ensurePacks();await this.wallet();}await this.settings.save({pet:p});this.clear();if(!p.enabled)this.window.close();else{await this.window.create();this.window.apply();}this.notify();return this.status();}
 async purchase(id){const p=await this.wallet();await p.purchase(id);this.notify();return this.status();}
 async equip(slot,id){const p=await this.wallet();await p.equip(slot,id);this.notify();return this.status();}
 interact(action){if(action!=='wave'||!this.settings.value.pet.enabled||this.progression?.snapshot().equipped.action!=='wave')throw Error('Pet action is not unlocked and equipped');this.window.window?.webContents.send('aps:pet-interact',{action:'wave'});return {played:true};}
 notify(){const win=this.window.window;if(win&&!win.isDestroyed())win.webContents.send('aps:pet-settings');this.onChange?.();}
 async close(){this.closed=true;this.clear();this.window.close();if(this.host){this.host.removeListener('snapshot',this.observe);this.host.removeListener('invalidate',this.invalidate);this.host.removeListener('status',this.onStatus);}await this.queue;await this.opening?.catch(()=>{});await this.progression?.close();}
}
