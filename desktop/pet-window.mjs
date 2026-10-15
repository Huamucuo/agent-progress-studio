import path from 'node:path';
const intersects=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;

export function restorePetBounds(prefs,displays){
 const size=prefs.size,p=prefs.bounds;
 const display=displays.find(d=>p&&p.x+size>d.workArea.x&&p.x<d.workArea.x+d.workArea.width&&p.y+size>d.workArea.y&&p.y<d.workArea.y+d.workArea.height)||displays[0];
 if(!display)throw Error('No usable display');const a=display.workArea;
 return {x:Math.round(Math.max(a.x,Math.min(p?.x??a.x+48,a.x+a.width-size))),y:Math.round(Math.max(a.y,Math.min(p?.y??a.y+a.height-size-24,a.y+a.height-size))),width:size,height:size};
}
/** The native window never creates a collector and never receives private text. */
export class PetWindow{
 constructor({BrowserWindow,screen,root,settings,webPreferences,register,isQuitting,onChange,onFailure}){Object.assign(this,{BrowserWindow,screen,root,settings,webPreferences,register,isQuitting,onChange,onFailure});this.ready=false;this.obstacles=[];}
 prefs(){return this.settings.value.pet;}
 async create(){if(this.window&&!this.window.isDestroyed())return this.window;if(!this.prefs().enabled||this.prefs().hidden)return null;
  const bounds=restorePetBounds(this.prefs(),this.screen.getAllDisplays());
  const win=this.window=new this.BrowserWindow({...bounds,frame:false,thickFrame:false,transparent:true,backgroundColor:'#00000000',hasShadow:false,show:false,skipTaskbar:true,focusable:false,resizable:false,maximizable:false,minimizable:false,fullscreenable:false,alwaysOnTop:this.prefs().alwaysOnTop,title:'APS · Desktop pet',icon:path.join(this.root,'desktop/assets/icon.png'),webPreferences:this.webPreferences});
  win.setIgnoreMouseEvents(true);this.register(win,'pet','aps://studio/pet.html');
  win.on('close',e=>{if(!this.isQuitting()){e.preventDefault();this.control({action:'hide'}).catch(()=>this.onFailure?.('PET_OPERATION_FAILED'));}});
  win.on('closed',()=>{this.stopDrag();this.ready=false;for(const e of ['display-added','display-removed','display-metrics-changed'])this.screen.removeListener(e,this.recover);});
  this.recover=()=>{if(win.isDestroyed())return;this.stopDrag();win.setBounds(restorePetBounds(this.prefs(),this.screen.getAllDisplays()),false);this.persistPosition().catch(()=>this.onFailure?.('PET_SETTINGS_FAILED'));};
  for(const e of ['display-added','display-removed','display-metrics-changed'])this.screen.on(e,this.recover);
  let finish;
  const ready=new Promise((resolve,reject)=>{
   let settled=false;const timeout=setTimeout(()=>finish(Error('Pet renderer did not become ready')),10000);timeout.unref?.();
   finish=error=>{if(settled)return;settled=true;clearTimeout(timeout);error?reject(error):resolve();};
   win.once('ready-to-show',()=>{this.ready=true;this.apply();finish();});
   win.once('closed',()=>finish(Error('Pet closed during startup')));
   win.webContents.once('render-process-gone',()=>finish(Error('Pet renderer stopped during startup')));
  });ready.catch(()=>{});
  try{await win.loadURL('aps://studio/pet.html');await ready;return win;}catch(error){finish(error);this.close();throw error;}
 }
 apply(){const win=this.window;if(!win||win.isDestroyed())return;const p=this.prefs();
  if(win.getBounds().width!==p.size){win.setIgnoreMouseEvents(true);win.setBounds(restorePetBounds({...p,bounds:win.getBounds()},this.screen.getAllDisplays()),false);}
  win.setAlwaysOnTop(p.alwaysOnTop);win.setMovable(!p.positionLocked);
  this.yielding=!this.dragging&&this.obstacles.some(r=>intersects(win.getBounds(),r));
  if(!p.enabled||p.hidden||this.yielding){this.stopDrag();win.hide();}else if(this.ready)win.showInactive();
  this.onChange?.();
 }
 shape(rectangles){const win=this.window;if(!win||win.isDestroyed()||!this.prefs().enabled)throw Error('Pet window unavailable');const size=this.prefs().size;
  if(!Array.isArray(rectangles)||rectangles.length>768||rectangles.some(r=>!r||Object.keys(r).sort().join(',')!=='height,width,x,y'||!['x','y','width','height'].every(k=>Number.isInteger(r[k]))||r.x<0||r.y<0||r.width<1||r.height<1||r.x+r.width>size||r.y+r.height>size))throw Error('Invalid pet shape');
  if(rectangles.length){win.setShape(rectangles);win.setIgnoreMouseEvents(false);}else win.setIgnoreMouseEvents(true);
  // Restore only this app's enabled, non-hidden, non-obstructing window.
  // This also keeps an early shape update from taking input focus.
  if(this.ready&&!this.prefs().hidden&&!this.yielding&&!win.isVisible())win.showInactive();
  this.shapeCount=rectangles.length;return {accepted:true};
 }
 setObstacles(rectangles=[]){this.obstacles=rectangles;this.apply();}
 async control(input){if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>k!=='action')||!['show','hide','dragStart','dragEnd','pet'].includes(input.action))throw Error('Invalid pet control');
  if(input.action==='show'){if(!this.prefs().enabled)throw Error('Enable pet mode first');await this.settings.save({pet:{...this.prefs(),hidden:false}});await this.create();this.apply();}
  if(input.action==='hide'){await this.persistPosition();await this.settings.save({pet:{...this.prefs(),hidden:true}});this.close();this.onChange?.();}
  if(input.action==='dragStart'){
   if(!this.window||this.window.isDestroyed()||!this.window.isVisible()||this.prefs().positionLocked)throw Error('Pet position is locked');this.stopDrag();this.dragFrom={cursor:this.screen.getCursorScreenPoint(),bounds:this.window.getBounds()};this.dragging=true;this.dragAt=Date.now();
   this.dragTimer=setInterval(()=>this.moveDrag(),32);this.dragTimer.unref?.();
  }
  if(input.action==='dragEnd'){this.moveDrag();this.stopDrag();await this.persistPosition();this.apply();}
  if(input.action==='pet'&&this.window&&!this.window.isDestroyed())this.window.webContents.send('aps:pet-interact',{action:'pet'});
  return {visible:!!this.window&&!this.window.isDestroyed()&&this.window.isVisible()};
 }
 moveDrag(){if(!this.dragging||!this.dragFrom)return;if(!this.window||this.window.isDestroyed()||Date.now()-this.dragAt>15000)return this.stopDrag();const {cursor,bounds}=this.dragFrom,point=this.screen.getCursorScreenPoint(),proposed={...this.prefs(),bounds:{x:Math.round(bounds.x+point.x-cursor.x),y:Math.round(bounds.y+point.y-cursor.y)}};this.window.setBounds(restorePetBounds(proposed,this.screen.getAllDisplays()),false);}
 stopDrag(){clearInterval(this.dragTimer);this.dragTimer=null;this.dragging=false;this.dragFrom=null;}
 async persistPosition(){if(!this.window||this.window.isDestroyed())return;const {x,y}=this.window.getBounds();await this.settings.save({pet:{...this.prefs(),bounds:{x,y}}});}
 status(){return {visible:this.ready&&!!this.window&&!this.window.isDestroyed()&&this.window.isVisible(),ready:this.ready,shapeCount:this.shapeCount||0,dragging:!!this.dragging,yielding:!!this.yielding};}
 close(){this.stopDrag();if(this.window&&!this.window.isDestroyed())this.window.destroy();this.window=null;this.ready=false;this.shapeCount=0;this.yielding=false;}
}
