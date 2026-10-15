import fs from 'node:fs';
import {open} from 'node:fs/promises';
import path from 'node:path';
import {randomBytes,randomUUID,createHmac} from 'node:crypto';
import {ownedDirectory} from '../../desktop/owned-files.mjs';
import {PET_CHARACTERS,PET_ITEMS,PET_RULES} from './catalog.mjs';

const MAX_BYTES=2*1024*1024, MAX_KEYS=20000, MAX_RECORDS=64, MAX_VALUE=1_000_000_000;
const SLOTS=['hat','scarf','action','background','skin'];
const folded=p=>process.platform==='win32'?p.toLowerCase():p;
const same=(a,b)=>a.dev===b.dev&&a.ino===b.ino;
const integer=(v,max=MAX_VALUE)=>Number.isSafeInteger(v)&&v>=0&&v<=max;
const token=v=>typeof v==='string'&&v.length>0&&v.length<=512&&!/[\x00-\x1f]/.test(v);
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
class Cancelled extends Error {}

/** Local virtual wallet. It receives facts only from the authorized main process. */
export class PetProgression {
  constructor(directory,{now=Date.now}={}) {
    this.directory=path.resolve(directory); this.file=path.join(this.directory,'pet-progress.json');
    this.lockFile=path.join(this.directory,'pet-progress.lock'); this.now=now;
    this.queue=Promise.resolve(); this.closed=false; this.closing=false; this.state=null;
  }
  #directory() {
    const stat=fs.lstatSync(this.directory);
    if(!stat.isDirectory()||stat.isSymbolicLink()||folded(fs.realpathSync.native(this.directory))!==folded(this.directory)||!same(stat,this.directoryIdentity)) throw Error('Pet storage directory identity changed');
  }
  #identity(file,expected=null,missing=false,maxLinks=1) {
    this.#directory(); let stat;
    try { stat=fs.lstatSync(file); } catch(e) { if(missing&&e.code==='ENOENT')return null; throw e; }
    if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink<1||stat.nlink>maxLinks||stat.size>MAX_BYTES||expected&&!same(stat,expected))throw Error('Pet storage file identity denied');
    return stat;
  }
  #read(file,max=MAX_BYTES,maxLinks=1) {
    const named=this.#identity(file,null,false,maxLinks); if(named.size>max)throw Error('Pet storage exceeds limit');
    const fd=fs.openSync(file,'r');
    try { const actual=fs.fstatSync(fd); if(!same(named,actual)||actual.nlink<1||actual.nlink>maxLinks||!actual.isFile())throw Error('Pet storage file identity changed');
      const buffer=Buffer.alloc(max+1),n=fs.readSync(fd,buffer,0,buffer.length,0); if(n>max)throw Error('Pet storage exceeds limit');
      return {value:JSON.parse(buffer.subarray(0,n).toString('utf8')),identity:named};
    }finally {fs.closeSync(fd);}
  }
  #alive(pid) {
    try{process.kill(pid,0);return true;}catch(e){if(e.code==='ESRCH')return false;throw e;}
  }
  #readLease() {
    let saved;
    try{saved=this.#read(this.lockFile,256,2);}catch(e){throw Error('Pet storage lock requires inspection',{cause:e});}
    if(!object(saved.value))throw Error('Pet storage lock requires inspection');
    const {pid,lease}=saved.value;
    if(!Number.isSafeInteger(pid)||pid<1||pid>0x7fffffff||lease!==undefined&&(saved.value.schema!==1||typeof lease!=='string'||!/^[-a-f0-9]{36}$/.test(lease)))throw Error('Pet storage lock requires inspection');
    const stage=lease===undefined?null:path.join(this.directory,`pet-progress.lease-${pid}-${lease}.tmp`);
    const current=this.#identity(this.lockFile,saved.identity,false,2);
    if(current.nlink===2) {
      if(!stage)throw Error('Pet storage lock alias denied');
      const paired=this.#identity(stage,current,true,2);
      // The publishing process may already have removed the paired stage.
      if(!paired)this.#identity(this.lockFile,current);
      else if(paired.nlink!==2)throw Error('Pet storage lease identity changed');
    }
    return {...saved,stage};
  }
  #acquireLease() {
    const lease=randomUUID(),temp=path.join(this.directory,`pet-progress.lease-${process.pid}-${lease}.tmp`);
    let fd=fs.openSync(temp,'wx',0o600),identity;
    try {
      // A partial PID record exists only under a private staging name. The fixed
      // lease is published exclusively as a complete, fsynced inode.
      fs.writeFileSync(fd,JSON.stringify({schema:1,pid:process.pid,lease}));fs.fsyncSync(fd);identity=fs.fstatSync(fd);
      for(let attempt=0;;attempt++) {
        this.#identity(temp,identity);
        try{fs.linkSync(temp,this.lockFile);break;}catch(e){
          if(e.code!=='EEXIST'||attempt>=3)throw e;
          const saved=this.#readLease();if(this.#alive(saved.value.pid))throw Error('Pet storage already open');
          if(saved.stage){const paired=this.#identity(saved.stage,saved.identity,true,2);if(paired){this.#identity(this.lockFile,saved.identity,false,2);fs.unlinkSync(saved.stage);}}
          this.#identity(this.lockFile,saved.identity);fs.unlinkSync(this.lockFile);
        }
      }
      this.lock=fd;fd=null;this.lockIdentity=identity;this.leaseTemp=temp;
      this.#identity(temp,identity,false,2);this.#identity(this.lockFile,identity,false,2);fs.unlinkSync(temp);this.leaseTemp=null;
    }finally {
      if(fd!==null){fs.closeSync(fd);const remaining=this.#identity(temp,identity,true);if(remaining)fs.unlinkSync(temp);}
    }
  }
  #validState(s) {
    const known=[...PET_CHARACTERS,...PET_ITEMS].map(x=>x.id);
    if(!object(s)||s.schema!==1||!integer(s.rulesVersion,10000)||s.rulesVersion<1||typeof s.secret!=='string'||!/^[A-Za-z0-9+/]{43}=$/.test(s.secret)||!integer(s.totalXp)||!integer(s.coins)||!Array.isArray(s.keys)||s.keys.length>MAX_KEYS||!s.keys.every(x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x))||new Set(s.keys).size!==s.keys.length)throw Error('Invalid pet storage');
    if(!Array.isArray(s.owned)||!s.owned.every(id=>known.includes(id))||new Set(s.owned).size!==s.owned.length||!PET_CHARACTERS.every(c=>s.owned.includes(c.id))||!object(s.equipped)||Object.keys(s.equipped).length!==SLOTS.length||!SLOTS.every(slot=>Object.hasOwn(s.equipped,slot)&&(s.equipped[slot]===null||PET_ITEMS.some(i=>i.id===s.equipped[slot]&&i.slot===slot&&s.owned.includes(i.id)))))throw Error('Invalid pet storage equipment');
    if(!object(s.days)||Object.keys(s.days).length>32||!Object.entries(s.days).every(([day,v])=>/^\d{4}-\d{2}-\d{2}$/.test(day)&&integer(v,PET_RULES.dailyActivityXp))||!Array.isArray(s.records)||s.records.length>MAX_RECORDS||!s.records.every(r=>object(r)&&Object.keys(r).every(k=>['at','kind','xp','coins'].includes(k))&&typeof r.at==='string'&&Number.isFinite(Date.parse(r.at))&&Object.hasOwn(PET_RULES.rewards,r.kind)&&integer(r.xp,8)&&integer(r.coins,3)))throw Error('Invalid pet storage history');
    if(Object.keys(s).some(k=>!['schema','rulesVersion','secret','totalXp','coins','keys','owned','equipped','days','records'].includes(k)))throw Error('Invalid pet storage fields');
    return s;
  }
  async init() {
    if(this.state||this.lock||this.initializing)throw Error('Pet storage already open'); if(this.closed)throw Error('Pet storage closed');
    this.initializing=true;
    try {
      await ownedDirectory(this.directory); this.directoryIdentity=fs.lstatSync(this.directory); this.#directory();
      this.#acquireLease();
      // Only our abandoned staging files are removable; never touch wallet keys.
      for(const name of fs.readdirSync(this.directory)) if(/^pet-progress\.json\.[a-f0-9-]{36}\.tmp$/.test(name)) {
        const temp=path.join(this.directory,name);this.#identity(temp);fs.unlinkSync(temp);
      }
      for(const name of fs.readdirSync(this.directory)) {
        const match=/^pet-progress\.lease-([1-9]\d{0,9})-[-a-f0-9]{36}\.tmp$/.exec(name);
        if(match&&Number(match[1])<=0x7fffffff&&!this.#alive(Number(match[1]))) {const temp=path.join(this.directory,name);this.#identity(temp);fs.unlinkSync(temp);}
      }
      try {const saved=this.#read(this.file);this.state=this.#validState(saved.value);this.fileIdentity=saved.identity;}
      catch(e) {
        if(e.code!=='ENOENT')throw e;
        const initial={schema:1,rulesVersion:PET_RULES.version,secret:randomBytes(32).toString('base64'),totalXp:0,coins:0,keys:[],owned:PET_CHARACTERS.map(c=>c.id),equipped:Object.fromEntries(SLOTS.map(s=>[s,null])),days:{},records:[]};
        const temp=this.file+'.'+randomUUID()+'.tmp'; let fd;
        try {fd=fs.openSync(temp,'wx',0o600);fs.writeFileSync(fd,JSON.stringify(initial));fs.fsyncSync(fd);fs.closeSync(fd);fd=null;this.#directory();if(this.#identity(this.file,null,true))throw Error('Pet storage appeared during initialization');fs.renameSync(temp,this.file);this.fileIdentity=fs.lstatSync(this.file);this.state=initial;}
        finally {if(fd!==undefined&&fd!==null)fs.closeSync(fd);try{fs.unlinkSync(temp);}catch(err){if(err.code!=='ENOENT')throw err;}}
      }
      return this.snapshot();
    }catch(e){try{await this.close();}catch(cleanup){e.cause??=cleanup;}throw e;}finally{this.initializing=false;}
  }
  snapshot() {
    if(!this.state)throw Error('Pet storage not initialized');
    let level=1,xp=this.state.totalXp,nextLevelXp=PET_RULES.levelBaseXp;
    while(xp>=nextLevelXp){xp-=nextLevelXp;level++;nextLevelXp+=PET_RULES.levelIncrementXp;}
    return {level,xp,totalXp:this.state.totalXp,nextLevelXp,coins:this.state.coins,owned:[...this.state.owned],equipped:{...this.state.equipped},records:this.state.records.map(r=>({...r}))};
  }
  #enqueue(action) {
    if(this.closed||this.closing||!this.state)return Promise.reject(Error('Pet storage closed or not initialized'));
    const next=this.queue.then(action);this.queue=next.catch(()=>{});return next;
  }
  #fact(f) {
    if(!object(f)||!Object.hasOwn(PET_RULES.rewards,f.kind)||!['codex','work-local'].includes(f.origin)||f.live!==true||f.demo!==false||!token(f.canonicalSessionKey)||typeof f.at!=='string')return null;
    const at=Date.parse(f.at),now=this.now();if(!Number.isFinite(at)||!Number.isFinite(now)||at<now-30000||at>now+2000)return null;
    if(f.kind==='live-turn-activity')return token(f.turnId)?{logical:['turn',f.canonicalSessionKey,f.turnId],at:new Date(at).toISOString()}:null;
    if(!token(f.definitionKey)||!token(f.criterionId)||f.evidenceCurrent!==true)return null;
    if(f.kind==='criterion-auto-verified'&&(f.requiresHuman!==false||f.automated!==true))return null;
    if(f.kind==='criterion-human-accepted'&&(f.requiresHuman!==true||f.humanAccepted!==true||!(f.implemented===true||f.automated===true)||typeof f.checksRequired!=='boolean'||f.checksRequired&&f.automated!==true))return null;
    return {logical:['criterion',f.definitionKey,f.criterionId],at:new Date(at).toISOString()};
  }
  async #commit(candidate,guard=()=>{}) {
    guard();this.#identity(this.file,this.fileIdentity);
    const text=JSON.stringify(candidate);if(Buffer.byteLength(text)>MAX_BYTES)throw Error('Pet storage exceeds limit');
    const temp=this.file+'.'+randomUUID()+'.tmp';let handle,tempIdentity;
    try {
      handle=await open(temp,'wx',0o600);tempIdentity=fs.fstatSync(handle.fd);guard();
      await handle.writeFile(text);guard();await handle.sync();guard();
      await handle.close();handle=null;guard();
      // Linearization: the original authority, freshness and all file identities
      // are checked immediately before the synchronous rename. No await or callback
      // can revoke authority between this barrier and durable wallet publication.
      guard();this.#identity(this.file,this.fileIdentity);const staged=this.#identity(temp,tempIdentity);
      fs.renameSync(temp,this.file);this.fileIdentity=staged;this.state=candidate;
    }finally {if(handle)await handle.close();this.#directory();try{fs.unlinkSync(temp);}catch(e){if(e.code!=='ENOENT')throw e;}}
  }
  consume(fact,{validate}={}) {
    // Copy the caller's data before queueing; caller mutation cannot change a key.
    const f=object(fact)?{...fact}:null;
    return this.#enqueue(async()=>{
      const guard=()=>{if(this.closed||this.closing||typeof validate!=='function')throw new Cancelled();try{if(validate()===false||!this.#fact(f))throw new Cancelled();}catch(e){throw new Cancelled();}};
      try {
        guard();const eligible=this.#fact(f);const key=createHmac('sha256',Buffer.from(this.state.secret,'base64')).update(JSON.stringify(eligible.logical)).digest('hex');
        if(this.state.keys.includes(key))return {awarded:false,reason:'duplicate'};
        if(this.state.keys.length>=MAX_KEYS)return {awarded:false,reason:'dedup-capacity'};
        const reward=PET_RULES.rewards[f.kind],day=eligible.at.slice(0,10);
        if(f.kind==='live-turn-activity'&&(this.state.days[day]||0)>=PET_RULES.dailyActivityXp)return {awarded:false,reason:'daily-cap'};
        const candidate=structuredClone(this.state);candidate.rulesVersion=PET_RULES.version;candidate.keys.push(key);candidate.totalXp+=reward.xp;candidate.coins+=reward.coins;
        if(!integer(candidate.totalXp)||!integer(candidate.coins))return {awarded:false,reason:'balance-capacity'};
        if(f.kind==='live-turn-activity') {candidate.days[day]=(candidate.days[day]||0)+reward.xp;for(const old of Object.keys(candidate.days).sort().slice(0,-32))delete candidate.days[old];}
        candidate.records.push({at:eligible.at,kind:f.kind,xp:reward.xp,coins:reward.coins});candidate.records=candidate.records.slice(-MAX_RECORDS);
        await this.#commit(candidate,guard);return {awarded:true,reason:'awarded'};
      }catch(e){if(e instanceof Cancelled)return {awarded:false,reason:'ineligible-or-revoked'};throw e;}
    });
  }
  purchase(id) {
    return this.#enqueue(async()=>{
      const item=PET_ITEMS.find(i=>i.id===id);if(!item)throw Error('Unknown pet item');
      if(this.state.owned.includes(id))return this.snapshot();if(this.state.coins<item.price)throw Error('Insufficient pet balance');
      const candidate=structuredClone(this.state);candidate.coins-=item.price;candidate.owned.push(id);await this.#commit(candidate);return this.snapshot();
    });
  }
  equip(slot,id) {
    return this.#enqueue(async()=>{
      if(!SLOTS.includes(slot))throw Error('Unknown pet slot');
      if(id!==null){const item=PET_ITEMS.find(i=>i.id===id);if(!item||item.slot!==slot)throw Error('Pet item slot mismatch');if(!this.state.owned.includes(id))throw Error('Pet item is not owned');}
      const candidate=structuredClone(this.state);candidate.equipped[slot]=id;await this.#commit(candidate);return this.snapshot();
    });
  }
  async close() {
    if(this.closed)return;this.closing=true;await this.queue;
    if(this.lock!==undefined&&this.lock!==null){const identity=this.lockIdentity||fs.fstatSync(this.lock);fs.closeSync(this.lock);this.lock=null;
      if(this.leaseTemp){this.#identity(this.lockFile,identity,false,2);this.#identity(this.leaseTemp,identity,false,2);fs.unlinkSync(this.leaseTemp);this.leaseTemp=null;}
      this.#identity(this.lockFile,identity);fs.unlinkSync(this.lockFile);}
    this.closed=true;
  }
}
