// Pure native-window geometry in Electron DIP. No session data or I/O.
export const MODES=Object.freeze(['FLOATING','FLOATING_COMPACT','DOCKED_EXPANDED','DOCKED_COLLAPSED','HIDDEN']);
export const EDGES=Object.freeze(['left','right','top','bottom']);
export const defaultFloating=()=>({schema:2,mode:'HIDDEN',restoreMode:'FLOATING',edge:null,peek:false,anchor:.5,displayId:null,positionLocked:false,alwaysOnTop:true,expandedPinned:false,autoSnap:true,hoverExpand:false,backgroundWhenHidden:true,bounds:{x:80,y:80,width:380,height:330},floatingBounds:{x:80,y:80,width:380,height:330}});
// Opacity follows presentation state; schema-1 drawerOpacity is obsolete.
export function floatingOpacity(state){const mode=state.mode==='HIDDEN'?state.restoreMode:state.mode;return mode==='DOCKED_COLLAPSED'?(state.peek ? .5 : 0):1;}
const rect=r=>r&&['x','y','width','height'].every(k=>Number.isFinite(r[k]))&&r.width>0&&r.height>0;
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
export function safeBounds(bounds,area){
 const width=Math.round(clamp(bounds.width,Math.min(240,area.width),area.width)),height=Math.round(clamp(bounds.height,Math.min(60,area.height),area.height));
 return {x:Math.round(clamp(bounds.x,area.x,area.x+area.width-width)),y:Math.round(clamp(bounds.y,area.y,area.y+area.height-height)),width,height};
}
export function chooseDisplay(bounds,displays,id){
 if(!displays.length)throw Error('No available display');
 const overlap=d=>Math.max(0,Math.min(bounds.x+bounds.width,d.workArea.x+d.workArea.width)-Math.max(bounds.x,d.workArea.x))*Math.max(0,Math.min(bounds.y+bounds.height,d.workArea.y+d.workArea.height)-Math.max(bounds.y,d.workArea.y));
 const preferred=displays.find(d=>d.id===id);if(preferred&&overlap(preferred)>0)return preferred;
 return displays.reduce((a,b)=>overlap(b)>overlap(a)?b:a,displays[0]);
}
export function dockBounds(state,area,expanded){
 const vertical=['left','right'].includes(state.edge),width=Math.min(area.width,expanded?(vertical?410:620):(vertical?(state.peek?28:2):(state.peek?64:24))),height=Math.min(area.height,expanded?(vertical?610:360):(vertical?(state.peek?44:24):(state.peek?28:2)));
 let x=area.x+clamp(state.anchor,0,1)*area.width-width/2,y=area.y+clamp(state.anchor,0,1)*area.height-height/2;
 if(state.edge==='left')x=area.x;if(state.edge==='right')x=area.x+area.width-width;if(state.edge==='top')y=area.y;if(state.edge==='bottom')y=area.y+area.height-height;
 return {x:Math.round(clamp(x,area.x,area.x+area.width-width)),y:Math.round(clamp(y,area.y,area.y+area.height-height)),width,height};
}
// Windows enforces a native minimum window size. Keep a small backing frame
// inside the work area and use an OS window region for the visible/hit area.
export function floatingFrame(state,area){
 const mode=state.mode==='HIDDEN'?state.restoreMode:state.mode;if(mode!=='DOCKED_COLLAPSED')return {...state.bounds};
 const r=state.bounds,width=Math.min(area.width,Math.max(64,r.width)),height=Math.min(area.height,Math.max(64,r.height));
 return {x:Math.round(clamp(state.edge==='right'?r.x+r.width-width:r.x,area.x,area.x+area.width-width)),y:Math.round(clamp(state.edge==='bottom'?r.y+r.height-height:r.y,area.y,area.y+area.height-height)),width,height};
}
export function pointerNearEdge(state,point,area){
 if(state.mode!=='DOCKED_COLLAPSED'||!point||!Number.isFinite(point.x)||!Number.isFinite(point.y)||point.x<area.x||point.y<area.y||point.x>=area.x+area.width||point.y>=area.y+area.height)return false;
 const r=state.bounds,vertical=['left','right'].includes(state.edge),dx=vertical?12:8,dy=vertical?8:12;
 return point.x>=r.x-dx&&point.x<=r.x+r.width+dx&&point.y>=r.y-dy&&point.y<=r.y+r.height+dy;
}
export function snapPreview(bounds,displays,threshold=32){
 const d=chooseDisplay(bounds,displays),a=d.workArea;
 const distances=[Math.abs(bounds.x-a.x),Math.abs(bounds.x+bounds.width-a.x-a.width),Math.abs(bounds.y-a.y),Math.abs(bounds.y+bounds.height-a.y-a.height)];
 const min=Math.min(...distances);if(min>threshold)return null;
 return {edge:EDGES[distances.indexOf(min)],displayId:d.id};
}
export function restoreFloating(saved,displays){
 const s=defaultFloating();if(saved&&typeof saved==='object'){
  for(const key of ['positionLocked','alwaysOnTop','expandedPinned','autoSnap','hoverExpand','backgroundWhenHidden','peek'])if(typeof saved[key]==='boolean')s[key]=saved[key];
  if(MODES.includes(saved.mode))s.mode=saved.mode;if(MODES.includes(saved.restoreMode)&&saved.restoreMode!=='HIDDEN')s.restoreMode=saved.restoreMode;
  if(EDGES.includes(saved.edge))s.edge=saved.edge;if(Number.isFinite(saved.anchor))s.anchor=clamp(saved.anchor,0,1);
  if(Number.isSafeInteger(saved.displayId))s.displayId=saved.displayId;
  for(const key of ['bounds','floatingBounds'])if(rect(saved[key]))s[key]={...saved[key]};
 }
 if((s.mode.startsWith('DOCKED')||s.restoreMode.startsWith('DOCKED'))&&!s.edge){s.mode=s.mode==='HIDDEN'?'HIDDEN':'FLOATING';s.restoreMode='FLOATING';}
 const d=chooseDisplay(s.bounds,displays,s.displayId);s.displayId=d.id;s.floatingBounds=safeBounds(s.floatingBounds,d.workArea);
 const visibleMode=s.mode==='HIDDEN'?s.restoreMode:s.mode;
 s.bounds=visibleMode.startsWith('DOCKED')?dockBounds(s,d.workArea,visibleMode==='DOCKED_EXPANDED'):safeBounds({...s.bounds,...(visibleMode==='FLOATING_COMPACT'?{width:380,height:64}:{})},d.workArea);
 return s;
}
export function transitionFloating(previous,command,displays){
 let s=restoreFloating(previous,displays);const a=command.action;
 if(a==='peek'||a==='unpeek'){if(s.mode==='DOCKED_COLLAPSED')s.peek=a==='peek';return restoreFloating(s,displays);}
 if(['positionLocked','alwaysOnTop','expandedPinned','autoSnap','hoverExpand','backgroundWhenHidden'].includes(a)){
  if(typeof command.value!=='boolean')throw Error('Boolean required');s[a]=command.value;return s;
 }
 if(a==='hide'){if(s.mode!=='HIDDEN')s.restoreMode=s.mode;s.mode='HIDDEN';s.peek=false;return restoreFloating(s,displays);}
 if(a==='show'){s.mode=s.mode==='HIDDEN'?s.restoreMode:s.mode;return restoreFloating(s,displays);}
 if(a==='leave'){if(s.mode==='DOCKED_EXPANDED'&&!s.expandedPinned){s.mode='DOCKED_COLLAPSED';s.peek=false;}return restoreFloating(s,displays);}
 if(a==='expand'){s.mode=s.edge&&s.mode.startsWith('DOCKED')?'DOCKED_EXPANDED':'FLOATING';if(s.mode==='FLOATING')s.bounds=s.floatingBounds;return restoreFloating(s,displays);}
 if(a==='compact'||a==='collapse'){s.mode=s.mode.startsWith('DOCKED')?'DOCKED_COLLAPSED':'FLOATING_COMPACT';s.peek=false;return restoreFloating(s,displays);}
 if(a==='display'){
  const d=displays.find(x=>x.id===command.displayId);if(!d)throw Error('Unavailable display');if(s.positionLocked)throw Error('Position locked');
  s.displayId=d.id;s.floatingBounds=safeBounds({...s.floatingBounds,x:d.workArea.x+40,y:d.workArea.y+40},d.workArea);s.bounds=s.floatingBounds;return restoreFloating(s,displays);
 }
 if(a==='dock'){
  if(s.positionLocked)throw Error('Position locked');if(!EDGES.includes(command.edge))throw Error('Invalid edge');
  s.edge=command.edge;s.mode='DOCKED_COLLAPSED';s.peek=false;return restoreFloating(s,displays);
 }
 if(a==='undock'){
  if(s.positionLocked)throw Error('Position locked');s.edge=null;s.mode='FLOATING';s.expandedPinned=false;s.bounds=s.floatingBounds;return restoreFloating(s,displays);
 }
 if(a==='dragEnd'){
  if(s.positionLocked)return s;if(!rect(command.bounds))throw Error('Invalid bounds');
  const d=chooseDisplay(command.bounds,displays);s.displayId=d.id;
  const snap=s.autoSnap?snapPreview(command.bounds,displays):null;
  if(snap){if(s.mode==='FLOATING')s.floatingBounds=safeBounds(command.bounds,d.workArea);s.edge=snap.edge;s.peek=false;s.anchor=['left','right'].includes(s.edge)?(command.bounds.y+command.bounds.height/2-d.workArea.y)/d.workArea.height:(command.bounds.x+command.bounds.width/2-d.workArea.x)/d.workArea.width;s.mode='DOCKED_COLLAPSED';}
  else{s.bounds=safeBounds({...s.floatingBounds,x:command.bounds.x,y:command.bounds.y},d.workArea);if(s.mode==='FLOATING')s.bounds=safeBounds(command.bounds,d.workArea);s.floatingBounds=s.bounds;s.edge=null;s.mode='FLOATING';s.expandedPinned=false;}
  return restoreFloating(s,displays);
 }
 if(a==='resize'){
  if(!rect(command.bounds))throw Error('Invalid bounds');if(s.mode==='FLOATING'){s.bounds=command.bounds;s.floatingBounds=command.bounds;}return restoreFloating(s,displays);
 }
 if(a==='recover')return s;
 throw Error('Unsupported window transition');
}
