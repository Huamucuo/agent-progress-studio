import {waitUntil}from './helpers/wait-until.mjs';
import {_electron as electron}from 'playwright';import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {execFile}from 'node:child_process';import {promisify}from 'node:util';
const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'aps-edge-'))),profile=path.join(root,'profile'),home=path.join(root,'codex'),events=path.join(root,'events'),evidence=path.resolve('../../outputs/edge-compact-evidence');await fs.mkdir(home+'/sessions',{recursive:true});await fs.mkdir(events);await fs.mkdir(evidence,{recursive:true});
const chatId='abcdef12-abcd-4abc-8abc-abcdef123456',chatFile=home+'/sessions/'+chatId+'.jsonl',line=payload=>JSON.stringify({type:'event_msg',timestamp:new Date().toISOString(),payload})+'\n';
await fs.writeFile(chatFile,JSON.stringify({type:'session_meta',payload:{id:chatId}})+'\n'+line({type:'user_message',message:'SYNTHETIC_SIDEBAR_QUESTION'})+line({type:'agent_message',phase:'final_answer',message:'SYNTHETIC_SIDEBAR_REPLY <img src=x onerror=alert(1)>'})+line({type:'agent_message',channel:'analysis',message:'SYNTHETIC_HIDDEN_MESSAGE'}));
// Packaged fuses deliberately disable Node inspection. Exercise the immutable
// binary through tests/desktop-packaged.mjs and its scoped Chromium bridge.
if(process.env.APS_EDGE_EXECUTABLE)throw Error('Use tests/desktop-packaged.mjs for fused release binaries');const packaged=false;
const app=await electron.launch({executablePath:path.resolve('node_modules/electron/dist/electron.exe'),args:[process.env.APS_EDGE_SOURCE||process.cwd(),'--aps-profile',profile,'--aps-codex-home',home,'--aps-hook-directory',events,'--aps-power-dry-run','--aps-demo'],timeout:30000}),results=[],errors=[];
const main=await app.firstWindow(),api=(page,method,input={})=>page.evaluate(({method,input})=>window.apsDesktop[method](input),{method,input}),control=(action,extra={})=>api(main,'floatingControl',{action,...extra});
let floating;const state=()=>api(main,'floatingStatus');
const native=()=>app.evaluate(({BrowserWindow,screen})=>{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/floating.html'));return {pid:process.pid,rendererPid:w.webContents.getOSProcessId(),handle:w.getNativeWindowHandle().readBigUInt64LE().toString(),bounds:w.getBounds(),content:w.getContentBounds(),scale:screen.getDisplayMatching(w.getBounds()).scaleFactor};});
const region=async()=>{const n=await native(),{stdout}=await promisify(execFile)('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.resolve('tests/inspect-owned-region.ps1'),'-WindowProcessId',String(n.pid),'-WindowHandle',n.handle],{windowsHide:true});return {...JSON.parse(stdout),native:n};};
const check=async(name,run)=>{if(process.env.APS_EDGE_CASE&&!name.includes(process.env.APS_EDGE_CASE))return;await run();results.push({name,passed:true});console.log('PASS '+name);};
try{
 await main.getByTestId('onboard-later').click();await main.getByTestId('desktop-floating').click();floating=app.windows().find(p=>p.url().endsWith('/floating.html'))||await app.waitForEvent('window');await floating.getByTestId('float-status').waitFor();main.on('pageerror',e=>errors.push(e.message));floating.on('pageerror',e=>errors.push(e.message));
 await check('native opacity is 0% at rest, 50% nearby and 100% after expansion on every edge',async()=>{
  const rows=[],opacity=()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/floating.html')).getOpacity());
  for(const edge of ['left','right','top','bottom']){
   await control('dock',{edge});await control('unpeek');let value=await opacity();assert.ok(Math.abs(value)<.01,`${edge} idle opacity ${value}`);rows.push({edge,mode:'idle',opacity:value});
   await control('peek');value=await opacity();assert.ok(Math.abs(value-.5)<.01,`${edge} nearby opacity ${value}`);rows.push({edge,mode:'peek',opacity:value});
   await control('expand');await control('expandedPinned',{value:true});value=await opacity();assert.ok(Math.abs(value-1)<.01,`${edge} expanded opacity ${value}`);rows.push({edge,mode:'expanded',opacity:value});
   await control('expandedPinned',{value:false});await control('leave');assert.ok(Math.abs(await opacity())<.01);
  }
  await control('undock');assert.ok(Math.abs(await opacity()-1)<.01);await fs.writeFile(evidence+'/native-opacity.json',JSON.stringify({syntheticOnly:true,method:'Electron BrowserWindow.getOpacity on actual Windows HWNDs; native mode commands, not a physical proximity proof',rows},null,2));
 });
 await check('transparent rest preserves underlying screen pixels and native hit testing on all edges',async()=>{
  const background=await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL()==='aps://studio/');w.maximize();w.show();w.focus();return w.getNativeWindowHandle().readBigUInt64LE().toString();}),rows=[];
  for(const edge of ['left','right','top','bottom']){
   await control('dock',{edge});await control('unpeek');const s=await state(),target=await app.evaluate(({screen},r)=>({pid:process.pid,point:screen.dipToScreenPoint({x:r.x+r.width/2,y:r.y+r.height/2})}),s.bounds);
   const sample=async()=>JSON.parse((await promisify(execFile)('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.resolve('tests/sample-owned-pixel.ps1'),'-WindowProcessId',String(target.pid),'-WindowHandle',background,'-TargetX',String(target.point.x),'-TargetY',String(target.point.y)],{windowsHide:true})).stdout);
   await control('hide');const before=await sample();await control('show');const after=await sample();assert.equal(after.color,before.color,`${edge} invisible window must not change the underlying pixel`);assert.equal(after.underlyingOwnedWindow,true,'Idle native input must pass to the owned background');rows.push({edge,before,after});
  }
  await control('undock');await fs.writeFile(evidence+'/native-transparent-background.json',JSON.stringify({syntheticOnly:true,method:'Win32 GetPixel comparison hidden vs shown idle overlay; WindowFromPoint must resolve to the explicitly owned main test HWND',rows},null,2));
 });
 await check('idle edges are short and tucked in: real OS region at most 2 by 24 DIP',async()=>{
  const rows=[];
  for(const edge of ['left','right','top','bottom']){
   await main.mouse.move(400,300);await control('dock',{edge});await control('unpeek');
   const s=await state(),r=await region();rows.push({edge,state:s.bounds,region:r});
   assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/floating.html')).isFocusable()),false,'Collapsed cues must not activate the native window');
   assert.ok(r.kind>1,'Windows must apply a nonempty custom window region');
   const thickness=['left','right'].includes(edge)?r.width:r.height;
   const length=['left','right'].includes(edge)?r.height:r.width;assert.ok(length<=Math.ceil(24*r.native.scale)+1,`${edge} cue is too long: ${length} physical px`);
   assert.ok(thickness<=Math.ceil(2*r.native.scale)+1,`${edge} visible region is ${thickness} physical px at ${r.native.scale} scale`);
   assert.ok(thickness>0);assert.equal(['left','right'].includes(edge)?s.bounds.width:s.bounds.height,2);
   const area=s.displays.find(d=>d.id===s.displayId).workArea;
   assert.ok(r.native.bounds.x>=area.x-1&&r.native.bounds.y>=area.y-1);
   assert.ok(r.native.bounds.x+r.native.bounds.width<=area.x+area.width+1&&r.native.bounds.y+r.native.bounds.height<=area.y+area.height+1);
  }await fs.writeFile(evidence+'/four-native-edge-regions.json',JSON.stringify(rows,null,2));
 });
 await check('single APS click expands inward on all edges without any drag gesture',async()=>{
  const background=await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL()==='aps://studio/');w.maximize();w.show();w.focus();return w.getNativeWindowHandle().readBigUInt64LE().toString();});
  await floating.evaluate(()=>{window.__edgeEvents=[];const add=e=>{window.__edgeEvents.push(e);window.__edgeEvents=window.__edgeEvents.slice(-50);};window.apsDesktop.onWindowState(s=>add({type:'state',mode:s.mode,peek:s.peek,at:Date.now()}));for(const type of ['pointerdown','pointerup','click','mouseenter','mouseleave'])document.addEventListener(type,e=>add({type,target:e.target?.closest?.('[data-testid]')?.dataset?.testid||e.target?.tagName,x:e.clientX,y:e.clientY,screenY:e.screenY,windowY:window.screenY,scrollY,innerHeight,bodyHeight:document.body.getBoundingClientRect().height,buttonTop:document.querySelector('[data-testid="float-expand"]')?.getBoundingClientRect().top,at:Date.now()}),true);});
  for(const edge of ['left','right','top','bottom']){
   await control('dock',{edge});await control('unpeek');const entry=await native();
   await promisify(execFile)('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.resolve('tests/click-owned-window.ps1'),'-WindowProcessId',String(entry.pid),'-TargetHandle',background,'-OverlayHandle',entry.handle,'-TargetX','0','-TargetY','0','-ApproachFirst','-ApproachOnly'],{windowsHide:true});
   await floating.getByTestId('float-expand').waitFor({timeout:2500});await floating.waitForFunction(edge=>document.body.dataset.edge===edge&&Math.abs((['left','right'].includes(edge)?document.body.getBoundingClientRect().width:document.body.getBoundingClientRect().height)-28)<1,edge);
   const peek=await state(),r=await region();assert.equal(['left','right'].includes(edge)?peek.bounds.width:peek.bounds.height,28);
   assert.ok((['left','right'].includes(edge)?r.width:r.height)<=Math.ceil(28*r.native.scale)+1);
   const button=await floating.getByTestId('float-expand').boundingBox();assert.ok(button?.width>10&&button?.height>10,'APS click target is visible');
   const click=await app.evaluate(({BrowserWindow,screen},box)=>{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/floating.html')),b=w.getContentBounds(),point=screen.dipToScreenPoint({x:b.x+box.x+box.width/2,y:b.y+box.y+box.height/2});return {pid:process.pid,handle:w.getNativeWindowHandle().readBigUInt64LE().toString(),point};},button);
   await promisify(execFile)('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.resolve('tests/click-owned-window.ps1'),'-WindowProcessId',String(click.pid),'-TargetHandle',click.handle,'-OverlayHandle',click.handle,'-TargetX',String(click.point.x),'-TargetY',String(click.point.y)],{windowsHide:true});
   await floating.waitForFunction(()=>document.body.dataset.mode==='DOCKED_EXPANDED',null,{timeout:3000});
   const expanded=await state();assert.equal(expanded.edge,edge);assert.equal(expanded.mode,'DOCKED_EXPANDED');assert.ok(expanded.bounds.width>=320&&expanded.bounds.height>=260);
   await control('expandedPinned',{value:true});await control('leave');assert.equal((await state()).mode,'DOCKED_EXPANDED');await control('expandedPinned',{value:false});await control('leave');
  }
 });
 await check('paused collection cannot erase the APS click target or require a drag to reopen',async()=>{
  await control('dock',{edge:'right'});await api(main,'pause');await control('peek');
  await floating.evaluate(()=>{window.__edgeInvalidated=false;window.apsDesktop.onPrivateClear(()=>window.__edgeInvalidated=true);});
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/floating.html')).webContents.send('aps:private-clear'));
  await floating.waitForFunction(()=>window.__edgeInvalidated===true,null,{timeout:1500});assert.equal((await state()).peek,true,'No mouse-leave transition occurred');assert.equal(await floating.getByTestId('float-expand').isVisible(),true,'Clearing session data must preserve the public APS window control');
  await floating.getByTestId('float-expand').click();assert.equal((await state()).mode,'DOCKED_EXPANDED');await api(main,'resume');await control('undock');
 });
 await check('real pointer proximity reveals APS, leaving shrinks it; clipped area passes through',async()=>{
  await control('alwaysOnTop',{value:true});await control('dock',{edge:'left'});await control('unpeek');
  const s=await state(),a=s.displays.find(d=>d.id===s.displayId).workArea;
  await app.evaluate(async({BrowserWindow},r)=>{const w=globalThis.__apsEdgeUnderlay=new BrowserWindow({x:r.x,y:r.y,width:500,height:250,frame:false,show:false,alwaysOnTop:true,webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true}});await w.loadURL('data:text/html,<html><body style="margin:0;background:%23ddd">SYNTHETIC APS TEST SURFACE</body></html>');w.showInactive();},{x:a.x,y:Math.max(a.y,s.bounds.y-50)});
  const move=async point=>{const v=await app.evaluate(({screen,BrowserWindow},point)=>({pid:process.pid,handle:globalThis.__apsEdgeUnderlay.getNativeWindowHandle().readBigUInt64LE().toString(),overlay:BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/floating.html')).getNativeWindowHandle().readBigUInt64LE().toString(),point:screen.dipToScreenPoint(point)}),point);await promisify(execFile)('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.resolve('tests/move-owned-pointer.ps1'),'-WindowProcessId',String(v.pid),'-WindowHandle',v.handle,'-OverlayHandle',v.overlay,'-TargetX',String(v.point.x),'-TargetY',String(v.point.y)],{windowsHide:true});};
  const far={x:a.x+180,y:s.bounds.y+12},near={x:a.x+10,y:s.bounds.y+12};await move(far);await control('unpeek');
  const clipped=await region();assert.ok(clipped.width<=Math.ceil(2*clipped.native.scale)+1);
  const boot=await api(main,'bootstrap');await move(near);await waitUntil(async()=>{const s=await state();return s.mode==='DOCKED_COLLAPSED'&&s.peek;},{timeout:2500});
  await floating.getByTestId('float-expand').waitFor();await floating.screenshot({path:evidence+'/native-small-aps-tag.png'});const peek=await state();assert.equal(peek.bounds.width,28);
  const during=await fs.readFile(profile+'/desktop-settings.json','utf8');assert.equal(JSON.parse(during).floating.peek,false,'Hover must never become a persisted expanded tag');
  await move(far);await floating.getByTestId('float-edge').waitFor({timeout:2500});await floating.screenshot({path:evidence+'/native-thin-edge.png'});assert.equal((await state()).bounds.width,2);
  assert.equal((await api(main,'bootstrap')).access.authorityInstanceId,boot.access.authorityInstanceId,'Hover reuses the same collector and authority');
  await control('peek');await control('hide');assert.equal((await state()).peek,false);await control('show');assert.equal((await state()).peek,false);await app.evaluate(()=>globalThis.__apsEdgeUnderlay.destroy());
 });
 await check('message popups follow visible sidebar on all edges and expansion despite legacy fixed position',async()=>{
  await api(main,'noticePreference',{key:'position',value:'top-left'});
  await app.evaluate(({app})=>{const load=process.getBuiltinModule('module').createRequire(app.getAppPath()+'/package.json'),{NotificationCenter}=load('./desktop/notices.mjs'),original=NotificationCenter.prototype.reposition;NotificationCenter.prototype.reposition=function(...args){globalThis.__apsEdgeNotice=this;return original.apply(this,args);};});
  await control('dock',{edge:'right'});await app.evaluate(()=>globalThis.__apsEdgeNotice.system('cache-cleaned'));await main.waitForFunction(()=>true);
  const notice=app.windows().find(p=>p.url().endsWith('/notice.html'))||await app.waitForEvent('window');await notice.locator('#notice p').waitFor();
  const rows=[];
  for(const edge of ['left','right','top','bottom']){
   await control('dock',{edge});await control('unpeek');
   for(const mode of ['collapsed','peek','expanded']){
    if(mode==='peek')await control('peek');if(mode==='expanded'){await control('expand');await control('expandedPinned',{value:true});}
    const s=await state(),v=await app.evaluate(({BrowserWindow})=>{const ws=BrowserWindow.getAllWindows(),n=ws.find(w=>w.webContents.getURL().endsWith('/notice.html'));return {notice:n.getBounds(),visible:n.isVisible()};}),r=s.visibleBounds||s.bounds,area=s.displays.find(d=>d.id===s.displayId).workArea,n=v.notice;
    let x=edge==='right'?r.x-n.width-8:r.x+r.width+8,y=r.y;if(edge==='top'){x=r.x;y=r.y+r.height+8;}if(edge==='bottom'){x=r.x;y=r.y-n.height-8;}
    x=Math.round(Math.max(area.x+8,Math.min(area.x+area.width-n.width-8,x)));y=Math.round(Math.max(area.y+8,Math.min(area.y+area.height-n.height-8,y)));
    assert.ok(Math.abs(n.x-x)<=2&&Math.abs(n.y-y)<=2,`${edge}/${mode} popup must attach to sidebar, actual ${JSON.stringify(n)} expected ${x},${y}`);
    rows.push({edge,mode,sidebar:r,popup:n});
   }await control('expandedPinned',{value:false});await control('leave');
  }await fs.writeFile(evidence+'/popup-anchor-geometries.json',JSON.stringify(rows,null,2));
 });
 await check('undocking restores full OS region and resizable floating window',async()=>{
  await control('undock');const n=await native(),r=await region();assert.ok(r.kind===0||r.width>=Math.floor(370*n.scale),'A thin clip must not survive in the full floating view');
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/floating.html')).isFocusable()),true,'Full views must retain keyboard input');
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/floating.html')).isResizable()),true);await floating.getByTestId('float-status').waitFor();
 });
 await check('free floating keeps an accessible resize control without exposing a general IPC operation',async()=>{
  await control('undock');assert.equal(await floating.getByTestId('float-resize').isVisible(),true);const before=await state();await floating.getByTestId('float-resize').focus();await floating.keyboard.press('ArrowRight');await waitUntil(async()=>(await state()).bounds.width>before.bounds.width,{timeout:1500});
  await floating.evaluate(()=>{window.__edgeResizeEvents=[];for(const type of ['pointerdown','pointerup','pointermove'])document.addEventListener(type,e=>{if(window.__edgeResizeEvents.length<50)window.__edgeResizeEvents.push({type,target:e.target.closest?.('[data-testid]')?.dataset.testid,clientX:e.clientX,clientY:e.clientY,screenX:e.screenX,screenY:e.screenY});},true);});await waitUntil(()=>floating.evaluate(async()=>{const s=await window.apsDesktop.floatingStatus();return Math.abs(innerWidth-s.bounds.width)<=1&&Math.abs(innerHeight-s.bounds.height)<=1;}));
  const sized=await state(),grip=await floating.getByTestId('float-resize').boundingBox(),drag=await app.evaluate(({BrowserWindow,screen},{bounds,grip})=>{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/floating.html')),b=w.getContentBounds();return {pid:process.pid,handle:w.getNativeWindowHandle().readBigUInt64LE().toString(),point:screen.dipToScreenPoint({x:bounds.x+45,y:bounds.y+45}),start:screen.dipToScreenPoint({x:b.x+grip.x+12,y:b.y+grip.y+12})};},{bounds:sized.bounds,grip});
  await promisify(execFile)('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.resolve('tests/drag-owned-window.ps1'),'-WindowProcessId',String(drag.pid),'-WindowHandle',drag.handle,'-TargetX',String(drag.point.x),'-TargetY',String(drag.point.y),'-ResizeGrip','-StartX',String(drag.start.x),'-StartY',String(drag.start.y)],{windowsHide:true});
  const resized=await state();assert.ok(resized.bounds.width>=sized.bounds.width+20&&resized.bounds.height>=sized.bounds.height+20,'Actual native mouse drag must resize the floating window');
  await assert.rejects(control('resize',{value:{width:500,height:400,path:'SYNTHETIC_FORBIDDEN'}}));await assert.rejects(control('resize',{value:{width:Infinity,height:400}}));await control('dock',{edge:'left'});await assert.rejects(control('resize',{value:{width:500,height:400}}));await control('undock');
 });
 await check('proximity polling stops when hidden and reuses the existing windows on restore',async()=>{
  await app.evaluate(({screen})=>{globalThis.__apsPointerCalls=0;const original=screen.getCursorScreenPoint;globalThis.__apsOriginalCursor=original;screen.getCursorScreenPoint=function(...args){globalThis.__apsPointerCalls++;return original.apply(this,args);};});
  await control('dock',{edge:'right'});await main.waitForFunction(()=>true);await new Promise(r=>setTimeout(r,500));assert.ok(await app.evaluate(()=>globalThis.__apsPointerCalls)>0);
  const count=app.windows().length;await control('hide');const before=await app.evaluate(()=>globalThis.__apsPointerCalls);await new Promise(r=>setTimeout(r,750));assert.equal(await app.evaluate(()=>globalThis.__apsPointerCalls),before,'Hidden monitoring must not poll cursor proximity');
  await control('show');assert.equal(app.windows().length,count,'Restore must not create another renderer or collector');await control('undock');
  await app.evaluate(({screen})=>{screen.getCursorScreenPoint=globalThis.__apsOriginalCursor;});
 });
 await check('drawer has dashboard above live authorized messages and a stable reply composer; revocation clears both',async()=>{
  const b=await api(main,'bootstrap');await api(main,'selectSource',{mode:'local',id:chatId,authorityInstanceId:b.access.authorityInstanceId,expectedPolicyRevision:b.access.policyRevision,selectionRevision:b.access.selectionRevision});
  await main.getByTestId('allow-content-access').click();await main.getByTestId('confirm-content-access').click();await control('dock',{edge:'right'});await control('expand');await control('expandedPinned',{value:true});
  await floating.getByTestId('float-dashboard').waitFor({timeout:2000});await floating.getByTestId('float-message').filter({hasText:'SYNTHETIC_SIDEBAR_REPLY'}).waitFor();
  const dashboard=await floating.getByTestId('float-dashboard').boundingBox(),chat=await floating.getByTestId('float-conversation').boundingBox();assert.ok(chat.y>=dashboard.y+dashboard.height-1,'Dashboard must be above messages');
  assert.equal(await floating.locator('#float-body img[src="x"]').count(),0,'Chat text cannot become HTML or executable content');assert.doesNotMatch(await floating.locator('body').innerText(),/SYNTHETIC_HIDDEN_MESSAGE/);
  await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:0,checkboxChecked:true});});await main.getByTestId('allow-reply-access').click();const input=floating.getByTestId('float-reply-text');await input.fill('SYNTHETIC_UNSENT_DRAFT');await input.focus();
  for(const language of ['zh-CN','en']){if(language==='en')await main.getByTestId('language-toggle').click();for(const edge of ['left','right','top','bottom']){
   await control('dock',{edge});await control('expand');await control('expandedPinned',{value:true});await input.waitFor();
   const layout=await floating.evaluate(()=>{const box=testId=>{const r=document.querySelector(`[data-testid="${testId}"]`).getBoundingClientRect();return {y:r.y,bottom:r.bottom,height:r.height};};return {height:innerHeight,dashboard:box('float-dashboard'),messages:box('float-messages'),input:box('float-reply-text'),send:box('float-reply-send')};});
   assert.ok(layout.messages.y>=layout.dashboard.bottom-1&&layout.messages.height>=30,edge+' dashboard must be above a usable message viewport');assert.ok(layout.input.bottom<=layout.height+1&&layout.send.bottom<=layout.height+1,edge+' reply controls must stay inside the drawer');
  }}await main.getByTestId('language-toggle').click();await control('dock',{edge:'right'});await control('expand');await control('expandedPinned',{value:true});await input.fill('SYNTHETIC_UNSENT_DRAFT');await input.focus();
  await fs.appendFile(chatFile,line({type:'agent_message',phase:'commentary',message:'SYNTHETIC_NEW_MESSAGE_WHILE_TYPING'}));await floating.getByTestId('float-message').filter({hasText:'SYNTHETIC_NEW_MESSAGE_WHILE_TYPING'}).waitFor({timeout:5000});assert.equal(await input.inputValue(),'SYNTHETIC_UNSENT_DRAFT');
  await floating.screenshot({path:evidence+'/dashboard-above-messages.png'});await main.getByTestId('revoke-content-access').click();await floating.waitForFunction(()=>!document.body.textContent.includes('SYNTHETIC_SIDEBAR_REPLY'));assert.equal(await floating.getByTestId('float-reply-text').count(),0);await control('expandedPinned',{value:false});
 });
 assert.deepEqual(errors,[]);await fs.writeFile(evidence+'/native-edge-results.json',JSON.stringify({syntheticOnly:true,packaged,checks:results,errors,otherDpi:'MANUAL_TEST_REQUIRED'},null,2));
}catch(error){await fs.writeFile(evidence+'/native-edge-failure.json',JSON.stringify({syntheticOnly:true,packaged,checks:results,error:error.message,stack:error.stack,diagnostic:{state:await state().catch(()=>null),native:await native().catch(()=>null),cursor:await app.evaluate(({screen})=>screen.getCursorScreenPoint()).catch(()=>null),view:await floating.evaluate(()=>({mode:document.body.dataset.mode,visibility:document.visibilityState,events:window.__edgeEvents,html:document.body.innerHTML})).catch(()=>null)}},null,2));throw error;}
finally{await app.close();}
