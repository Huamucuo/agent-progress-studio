import {drawBuiltinPet,getPetFrame,PET_FRAME_COUNT,clearPetArtCache}from './pet-assets.mjs';
import {StateReceiver}from './state-receiver.mjs';
import {currentPetActivity}from './pet-activity.mjs';
const api=window.apsDesktop,canvas=document.getElementById('pet'),ctx=canvas.getContext('2d',{willReadFrequently:true}),receiver=new StateReceiver();
let status,activity={animation:'idle',factStatus:'unknown'},frame=0,timer,stop,retry,generation=0,interactionUntil=0,interactionAnimation='happy',sleeping=false,shapeSignature='',pointer,rendering=false,redrawPending=false,lastDuration=84;
const images=new Map();
const en=()=>localStorage.getItem('aps-language')==='en';
const labels={unknown:['状态未知','Status unknown'],source_unavailable:['连接中断或监控暂停','Disconnected or paused'],waiting_event:['等待真实活动','Waiting for observed activity'],session_seen:['已发现会话，尚未确认执行','Session seen; execution unconfirmed'],prompt_received:['已观测到开始工作','Work start observed'],tool_running:['已观测到工具执行','Tool execution observed'],tool_finished:['工具已返回，任务完成度仍未知','Tool returned; task completion unknown'],tool_failed:['已观测到工具失败','Tool failure observed'],turn_running:['已观测到回合执行','Turn execution observed'],turn_completed:['回合结束，不代表项目完成','Turn ended; project completion unknown'],turn_stopped:['回合停止，不代表项目完成','Turn stopped; project completion unknown'],turn_failed:['已观测到回合失败','Turn failure observed'],waiting_user:['等待用户操作','Waiting for user input'],waiting_approval:['等待用户审批','Waiting for approval'],no_recent_evidence:['当前活动未知','Current activity unknown'],awaiting_tool_result:['等待工具结果，当前执行未知','Awaiting tool result; current execution unknown']};
const fact=()=>currentPetActivity(activity,Date.now(),receiver.fresh());
const text=value=>{const pair=labels[value.factStatus]||labels.unknown;return (value.demo?'DEMO · ':'')+pair[en()?1:0];};
function stopAnimation(){clearTimeout(timer);timer=null;}
function mask(){const {width,height}=canvas,{data}=ctx.getImageData(0,0,width,height),rects=[],active=new Map();
 for(let y=0;y<height;y++){const row=new Map();for(let x=0;x<width;){while(x<width&&data[(y*width+x)*4+3]===0)x++;if(x>=width)break;const start=x;while(x<width&&data[(y*width+x)*4+3]>0)x++;const key=start+':'+(x-start),prior=active.get(key);if(prior&&prior.y+prior.height===y){prior.height++;row.set(key,prior);}else{const r={x:start,y,width:x-start,height:1};rects.push(r);row.set(key,r);}}active.clear();for(const [k,v]of row)active.set(k,v);}
 // Exact painted-pixel spans; no invisible rectangular background hit target.
 if(rects.length>768)return [];
 return rects.flatMap(r=>[r.x,r.y,r.width,r.height]);
}
async function imageFor(character,state,index,equipped){const key=JSON.stringify([character,state,index,equipped]);if(images.has(key))return images.get(key);
 let src;if(character.startsWith('aps-')){const art=document.createElement('canvas');art.width=art.height=128;await drawBuiltinPet(art,character,state,index,equipped);images.set(key,art);while(images.size>6)images.delete(images.keys().next().value);return art;}
 else{const pack=status.packs.find(p=>p.id===character),frames=pack?.states[state]||pack?.states.idle;if(!frames?.length)throw Error('No validated pet frame');const value=await api.petAsset({id:character,file:frames[index%frames.length].file});src=value.data;}
 const img=new Image();img.src=src;await img.decode();images.set(key,img);while(images.size>6)images.delete(images.keys().next().value);return img;
}
async function draw(){stopAnimation();if(rendering){redrawPending=true;return;}if(!status||document.hidden)return;rendering=true;redrawPending=false;const token=++generation;
 try{const prefs=status.preferences,size=prefs.size;if(canvas.width!==size||canvas.height!==size){canvas.width=size;canvas.height=size;shapeSignature='';}
  const observed=fact(),state=interactionUntil>Date.now()?interactionAnimation:sleeping?'sleeping':observed.animation||'idle';
  const packed=status.packs.find(p=>p.id===prefs.character),count=packed?.states[state]?.length||PET_FRAME_COUNT,index=prefs.animations?frame%count:0;
  lastDuration=packed?.states[state]?.[index]?.duration||getPetFrame(prefs.character,state,index).duration;
  const img=await imageFor(prefs.character,state,index,status.progression.equipped);if(token!==generation||document.hidden)return;
  ctx.imageSmoothingEnabled=false;ctx.clearRect(0,0,size,size);ctx.drawImage(img,0,0,size,size);
  canvas.dataset.animation=state;canvas.dataset.frame=String(index);canvas.dataset.animated=String(prefs.animations);canvas.dataset.factStatus=observed.factStatus||'unknown';canvas.dataset.character=prefs.character;
  if(activity.demo){ctx.fillStyle='#112d26';ctx.fillRect(8,8,48,18);ctx.fillStyle='#c8ffe9';ctx.font='bold 11px sans-serif';ctx.fillText('DEMO',14,21);}
  canvas.title=text(observed)+(sleeping?(en()?' · Pet sleeping':' · 宠物睡觉'):interactionUntil>Date.now()?(en()?' · Pet interaction':' · 宠物互动'):'');canvas.setAttribute('aria-label',canvas.title);
  const segments=mask(),signature=JSON.stringify(segments);if(signature!==shapeSignature){await api.petShape({segments,size});if(token!==generation)return;shapeSignature=signature;}
  frame++;
 }catch{activity={animation:'idle',factStatus:'unknown'};ctx.clearRect(0,0,canvas.width,canvas.height);api.petShape({segments:[],size:canvas.width}).catch(()=>{});}
 finally{rendering=false;if(redrawPending&&!document.hidden){redrawPending=false;timer=setTimeout(draw,0);}else if(status?.preferences.animations&&!document.hidden)timer=setTimeout(draw,status.preferences.lowPerformance?Math.max(250,lastDuration):Math.max(84,lastDuration));}
}
function clear(){generation++;stopAnimation();activity={animation:'idle',factStatus:'unknown'};interactionUntil=0;sleeping=false;shapeSignature='';draw();}
function invalidate(){receiver.invalidate();stop?.();stop=null;clear();clearTimeout(retry);if(!document.hidden)retry=setTimeout(boot,500);}
async function boot(){clearTimeout(retry);stop?.();stop=null;const ticket=receiver.begin();clear();try{const b=await api.bootstrap();if(!receiver.bootstrap(b,ticket))return;const request=receiver.ticket('snapshot'),p=await api.petState();if(!receiver.accept(p,request))return;activity=p.petState;draw();const t=receiver.ticket('snapshot');stop=api.observe({authorityInstanceId:receiver.instance,expectedPolicyRevision:receiver.revision,selectionRevision:receiver.selection},f=>{if(!receiver.isCurrent(t))return;if(f.type==='invalidate')return invalidate();if(f.type==='authority'&&!receiver.heartbeat(f.data,t))return invalidate();if(f.type==='snapshot'){try{const value=JSON.parse(f.data);if(!receiver.accept(value,t))return;activity=value.petState;if(['working','waiting','failed'].includes(activity.animation))sleeping=false;draw();}catch{invalidate();}}});}catch{clear();if(!document.hidden)retry=setTimeout(boot,2000);}}
async function refresh(){generation++;images.clear();clearPetArtCache();status=await api.petStatus();frame=0;shapeSignature='';draw();}
api.onPetSettings(()=>refresh().catch(clear));api.onPetClear(invalidate);api.onPrivateClear(invalidate);
api.onPetInteract(value=>{if(value.action==='sleep'){sleeping=true;interactionUntil=0;}else{sleeping=false;interactionAnimation=value.action==='wave'?'working':'happy';interactionUntil=Date.now()+1600;}draw();});
canvas.addEventListener('contextmenu',e=>{e.preventDefault();api.petMenu().catch(()=>{});});
canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;pointer={id:e.pointerId,x:e.clientX,y:e.clientY,moved:false};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(pointer&&!pointer.moved&&Math.hypot(e.clientX-pointer.x,e.clientY-pointer.y)>4){pointer.moved=true;api.petControl({action:'dragStart'}).catch(()=>{});}});
const end=e=>{if(!pointer)return;const p=pointer;pointer=null;api.petControl({action:p.moved?'dragEnd':'pet'}).catch(()=>{});};canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',()=>{if(pointer){pointer=null;api.petControl({action:'dragEnd'}).catch(()=>{});}});
canvas.addEventListener('dblclick',()=>api.openMain({view:'pet'}).catch(()=>{}));
canvas.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();api.petControl({action:'pet'}).catch(()=>{});}if(e.key==='Escape')api.petControl({action:'hide'}).catch(()=>{});});
document.addEventListener('visibilitychange',()=>{startWatchdog();if(document.hidden){generation++;stopAnimation();clearTimeout(retry);stop?.();stop=null;receiver.invalidate();}else{refresh().catch(clear);boot();}});
window.addEventListener('storage',()=>draw());
// Works with animations disabled as well. Hidden pets have no rendering,
// subscriptions or watchdog; a visible pet never treats heartbeats as activity.
let watchdog;
function startWatchdog(){clearInterval(watchdog);if(!document.hidden)watchdog=setInterval(()=>{if(receiver.ready&&!receiver.fresh())return invalidate();if(status&&canvas.dataset.factStatus!==(fact().factStatus||'unknown'))draw();},1000);}
startWatchdog();
window.addEventListener('pagehide',()=>{clearInterval(watchdog);stopAnimation();clearTimeout(retry);stop?.();});
await refresh();await boot();
