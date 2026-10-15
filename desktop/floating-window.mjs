import path from 'node:path';
import { restoreFloating,transitionFloating,snapPreview,floatingFrame,pointerNearEdge,floatingOpacity } from './window-state.mjs';
const sameBounds=(a,b)=>['x','y','width','height'].every(k=>a[k]===b[k]);
const commands=new Set(['show','hide','peek','unpeek','expand','compact','collapse','undock','dock','positionLocked','alwaysOnTop','expandedPinned','autoSnap','hoverExpand','backgroundWhenHidden','display','leave','resize','resizeEnd']);
/** One native window, one state machine; never starts a collector. */
export class FloatingWindow{
 constructor({BrowserWindow,screen,root,settings,webPreferences,register,onChange,onHidden,onGeometry,isQuitting,onFailure}){Object.assign(this,{BrowserWindow,screen,root,settings,webPreferences,register,onChange,onHidden,onGeometry,isQuitting,onFailure});this.state=restoreFloating({...settings.value.floating,peek:false},screen.getAllDisplays());this.applying=false;this.manualDrag=false;this.preview=null;this.ready=false;}
 anchor(){const mode=this.state.mode==='HIDDEN'?this.state.restoreMode:this.state.mode;return {bounds:mode==='DOCKED_COLLAPSED'?{...this.state.bounds}:this.window&&!this.window.isDestroyed()?this.window.getBounds():{...this.state.bounds},edge:mode.startsWith('DOCKED')?this.state.edge:null};}
 status(){const win=this.window&&!this.window.isDestroyed()?this.window:null,mode=this.state.mode==='HIDDEN'?this.state.restoreMode:this.state.mode,content=win?.getContentBounds(),r=this.state.bounds;return {...this.state,visible:!!win&&win.isVisible(),opacity:win?win.getOpacity():floatingOpacity(this.state),visibleBounds:this.anchor().bounds,cue:mode==='DOCKED_COLLAPSED'&&content?{x:r.x-content.x,y:r.y-content.y,width:r.width,height:r.height}:null,preview:this.preview,displays:this.screen.getAllDisplays().map(d=>({id:d.id,label:d.label||String(d.id),scaleFactor:d.scaleFactor,workArea:d.workArea}))};}
 async create(){if(this.window&&!this.window.isDestroyed())return this.window;
  const area=this.screen.getAllDisplays().find(d=>d.id===this.state.displayId).workArea;
  const win=this.window=new this.BrowserWindow({...floatingFrame(this.state,area),frame:false,thickFrame:false,transparent:true,hasShadow:false,show:false,skipTaskbar:true,alwaysOnTop:this.state.alwaysOnTop,maximizable:false,fullscreenable:false,minimizable:false,backgroundColor:'#00000000',title:'APS · Floating monitor',icon:path.join(this.root,'desktop/assets/icon.png'),webPreferences:this.webPreferences});
  this.register(win,'floating','aps://studio/floating.html');
  win.on('close',event=>{if(!this.isQuitting()){event.preventDefault();this.control({action:'hide'});}});
  win.on('will-move',(event,bounds)=>{if(this.applying)return;if(this.state.positionLocked){event.preventDefault();return;}this.manualDrag=true;this.proposed=bounds;const next=this.state.autoSnap?snapPreview(bounds,this.screen.getAllDisplays()):null;if(JSON.stringify(next)!==JSON.stringify(this.preview)){this.preview=next;this.notify();}});
  win.on('moved',()=>{if(this.applying||!this.manualDrag)return;this.manualDrag=false;this.preview=null;this.state=transitionFloating(this.state,{action:'dragEnd',bounds:win.getBounds()},this.screen.getAllDisplays());this.apply();});
  win.on('move',()=>this.onGeometry?.());
  win.on('will-resize',event=>{if(this.state.mode!=='FLOATING')event.preventDefault();});
  win.on('resized',()=>{if(!this.applying&&this.state.mode==='FLOATING'){this.state=transitionFloating(this.state,{action:'resize',bounds:win.getBounds()},this.screen.getAllDisplays());this.persist();this.notify();}});
  const recover=()=>{if(!this.window||this.window.isDestroyed())return;this.state=restoreFloating(this.state,this.screen.getAllDisplays());this.apply();};
  this.recover=recover;for(const e of ['display-added','display-removed','display-metrics-changed'])this.screen.on(e,recover);
  win.on('closed',()=>{clearInterval(this.pointerTimer);this.pointerTimer=null;for(const e of ['display-added','display-removed','display-metrics-changed'])this.screen.removeListener(e,recover);this.ready=false;});
  win.once('ready-to-show',()=>{this.ready=true;this.apply();});await win.loadURL('aps://studio/floating.html');return win;
 }
 control(input){if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['action','value','edge','displayId'].includes(k))||!commands.has(input.action))throw Error('Invalid floating control');
  if(input.action==='show'&&!this.window)throw Error('Floating window not ready');
  let command=input;
  if(input.action==='resize'||input.action==='resizeEnd'){
   if(this.state.mode!=='FLOATING')throw Error('Only a free floating window can resize');
   if(input.action==='resizeEnd'){if(input.value!==undefined)throw Error('Unexpected resize data');this.persist();return this.status();}
   const v=input.value;if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==2||Object.keys(v).some(k=>!['width','height'].includes(k))||!Number.isFinite(v.width)||!Number.isFinite(v.height)||v.width<320||v.width>4000||v.height<260||v.height>4000)throw Error('Invalid resize dimensions');
   const a=this.screen.getAllDisplays().find(d=>d.id===this.state.displayId).workArea;
   command={action:'resize',bounds:{...this.state.bounds,width:Math.min(v.width,a.x+a.width-this.state.bounds.x),height:Math.min(v.height,a.y+a.height-this.state.bounds.y)}};
  }
  this.state=transitionFloating(this.state,command,this.screen.getAllDisplays());this.leaveAt=null;this.preview=null;this.apply({persist:!['peek','unpeek','resize'].includes(input.action)});if(input.action==='hide')this.onHidden?.(this.state.backgroundWhenHidden);return this.status();
 }
 toggle(){return this.control({action:this.state.mode==='HIDDEN'?'show':'hide'});}
 apply({persist=true}={}){const win=this.window;if(!win||win.isDestroyed())return;
  this.applying=true;
  try{const s=this.state,visibleMode=s.mode==='HIDDEN'?s.restoreMode:s.mode,collapsed=visibleMode==='DOCKED_COLLAPSED',compact=visibleMode==='FLOATING_COMPACT';
   win.setMinimumSize(collapsed?4:compact?240:320,collapsed?4:compact?60:260);win.setResizable(s.mode==='FLOATING');win.setMovable(!s.positionLocked);win.setAlwaysOnTop(s.alwaysOnTop);if(win.isFocusable()===collapsed)win.setFocusable(!collapsed);
   win.setOpacity(floatingOpacity(s));
   win.setIgnoreMouseEvents(collapsed&&!s.peek);
   const area=this.screen.getAllDisplays().find(d=>d.id===s.displayId).workArea,frame=floatingFrame(s,area);
   if(!sameBounds(win.getBounds(),frame))win.setBounds(frame,false);
   const actual=win.getBounds();win.setShape(collapsed?[{x:s.bounds.x-actual.x,y:s.bounds.y-actual.y,width:s.bounds.width,height:s.bounds.height}]:[]);
   if(s.mode==='HIDDEN')win.hide();else if(this.ready&&!win.isVisible())win.showInactive();
  }finally{this.applying=false;}
  this.trackPointer();if(persist)this.persist();this.notify();
 }
 trackPointer(){
  const active=this.ready&&(this.state.mode==='DOCKED_COLLAPSED'||this.state.mode==='DOCKED_EXPANDED'&&!this.state.expandedPinned)&&this.window?.isVisible();
  if(!active){clearInterval(this.pointerTimer);this.pointerTimer=null;this.leaveAt=null;return;}
  if(this.pointerTimer)return;this.pointerTimer=setInterval(()=>{
   if(this.manualDrag||this.applying||!this.window||this.window.isDestroyed())return;
   const area=this.screen.getAllDisplays().find(d=>d.id===this.state.displayId)?.workArea;if(!area)return;
   const point=this.screen.getCursorScreenPoint(),expanded=this.state.mode==='DOCKED_EXPANDED',r=expanded?this.window.getBounds():this.state.bounds,inside=expanded&&point.x>=r.x&&point.y>=r.y&&point.x<r.x+r.width&&point.y<r.y+r.height;
   if(inside||!expanded&&pointerNearEdge(this.state,point,area)){this.leaveAt=null;if(!expanded){if(this.state.hoverExpand)this.control({action:'expand'});else if(!this.state.peek)this.control({action:'peek'});}}
   else if(expanded||this.state.peek){this.leaveAt??=Date.now();if(Date.now()-this.leaveAt>=450){this.leaveAt=null;this.control({action:expanded?'leave':'unpeek'});}}
   else this.leaveAt=null;
  },200);this.pointerTimer.unref?.();
 }
 persist(){this.settings.save({floating:{...this.state,peek:false}}).catch(()=>this.onFailure?.('SETTINGS_WRITE_FAILED'));}
 notify(){this.onChange?.(this.status());}
 close(){if(this.window&&!this.window.isDestroyed())this.window.destroy();}
}
