import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {StateReceiver}from '../public/state-receiver.mjs';import {currentPetActivity}from '../public/pet-activity.mjs';
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const source=(await fs.readFile(new URL('../public/pet.mjs',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'');
async function renderer(animations){
 let now=Date.parse('2026-10-14T18:00:00Z'),sub,sequence=0;const intervals=new Map(),timeouts=new Map(),listeners={},events={};let id=0;
 const context={clearRect(){},drawImage(){},fillRect(){},fillText(){},getImageData:(_x,_y,w,h)=>({data:new Uint8ClampedArray(w*h*4)})};
 const makeCanvas=()=>({width:128,height:128,dataset:{},title:'',getContext:()=>context,setAttribute(){},addEventListener(){}}),canvas=makeCanvas(),document={hidden:false,getElementById:()=>canvas,createElement:makeCanvas,addEventListener:(n,f)=>listeners[n]=f};
 const access=()=>({authorityInstanceId:'fixture',policyRevision:0,selectionRevision:0,publicationSeq:++sequence,dependencies:[]});
 const api={petStatus:async()=>({preferences:{size:128,character:'aps-dog',animations,lowPerformance:false},progression:{equipped:{}},packs:[]}),bootstrap:async()=>({access:access(),freshnessMs:10000}),petState:async()=>({access:access(),petState:{animation:'working',factStatus:'tool_running',fresh:true,demo:false,at:new Date(now).toISOString()}}),observe:(_scope,cb)=>{sub=cb;return()=>{sub=null;};},petShape:async()=>({accepted:true}),onPetSettings:f=>events.settings=f,onPetClear:f=>events.clear=f,onPrivateClear:f=>events.private=f,onPetInteract:f=>events.interact=f};
 const clock=class extends Date{static now(){return now;}},Receiver=class extends StateReceiver{constructor(){super(()=>now);}},window={apsDesktop:api,addEventListener:(n,f)=>listeners[n]=f};
 const args=['StateReceiver','drawBuiltinPet','getPetFrame','PET_FRAME_COUNT','clearPetArtCache','currentPetActivity','window','document','localStorage','Date','setTimeout','clearTimeout','setInterval','clearInterval'];
 await new AsyncFunction(...args,source)(Receiver,async()=>{},()=>({duration:200}),4,()=>{},currentPetActivity,window,document,{getItem:()=>null},clock,(f,ms=0)=>{timeouts.set(++id,{f,at:now+ms});return id;},n=>timeouts.delete(n),(f)=>{intervals.set(++id,f);return id;},n=>intervals.delete(n));
 const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};await flush();
 return {canvas,intervals,timeouts,async advance(ms,heartbeat){now+=ms;if(heartbeat&&sub)sub({type:'authority',data:{authorityInstanceId:'fixture',policyRevision:0,selectionRevision:0}});for(const f of [...intervals.values()])f();for(const [n,t]of [...timeouts.entries()])if(t.at<=now){timeouts.delete(n);t.f();}await flush();},async hide(){document.hidden=true;listeners.visibilitychange();await flush();},close:()=>listeners.pagehide()};
}
for(const animations of [true,false]){
 test(`actual pet renderer ages activity while heartbeats stay valid (animations=${animations})`,async()=>{const r=await renderer(animations);try{assert.equal(r.canvas.dataset.animation,'working');for(let i=0;i<15;i++)await r.advance(3000,true);assert.equal(r.canvas.dataset.animation,'idle');assert.equal(r.canvas.dataset.factStatus,'no_recent_evidence');}finally{r.close();}});
 test(`actual pet renderer clears dead authority without new snapshots (animations=${animations})`,async()=>{const r=await renderer(animations);try{assert.equal(r.canvas.dataset.animation,'working');await r.advance(11000,false);assert.equal(r.canvas.dataset.animation,'idle');assert.equal(r.canvas.dataset.factStatus,'source_unavailable');await r.hide();assert.equal(r.intervals.size,0);assert.equal(r.timeouts.size,0);}finally{r.close();}});
}
