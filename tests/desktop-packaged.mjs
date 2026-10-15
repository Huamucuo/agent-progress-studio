import {waitUntil}from './helpers/wait-until.mjs';
import { chromium } from 'playwright';
import { spawn,execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { SessionAccess,sessionRef } from '../src/core/session-access.mjs';
import { HookIngress } from '../desktop/hook-ingress.mjs';
import { writeMarker,removeMarker } from '../desktop/recorder.mjs';
import {VERSION}from '../src/version.mjs';
const executable=path.resolve(process.argv[2]),evidence=path.resolve(process.env.APS_EVIDENCE_DIR||'../../outputs/floating-evidence'),label=process.argv[3]||'portable';await fs.mkdir(evidence,{recursive:true});
const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'aps-packaged-'+label+'-'))),profile=label==='portable'?path.join(path.dirname(executable),'APS Desktop Data'):root+'/profile',home=root+'/codex',events=profile+'/hook-events';
if(label==='portable')await assert.rejects(fs.stat(profile),{code:'ENOENT'},'Default portable profile must be fresh');
await fs.mkdir(home+'/sessions',{recursive:true});await fs.mkdir(events,{recursive:true});const id='abcdef12-abcd-4abc-8abc-abcdef123456';
await fs.writeFile(home+'/sessions/'+id+'.jsonl',JSON.stringify({type:'session_meta',payload:{id}})+'\n'+JSON.stringify({type:'event_msg',payload:{type:'user_message',message:'SYNTHETIC_PACKAGED_TASK'}})+'\n');
const env={...process.env,PATH:path.join(process.env.SystemRoot,'System32')};for(const key of ['ELECTRON_RUN_AS_NODE','NODE_OPTIONS','CODEX_HOME','CODEX_THREAD_ID'])delete env[key];
const reserve=createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));
const args=[...(label==='portable'?[]:['--aps-profile',profile]),'--aps-codex-home',home,'--aps-power-dry-run'];
const child=spawn(executable,[...args,'--remote-debugging-address=127.0.0.1','--remote-debugging-port='+port],{env,windowsHide:false,stdio:'ignore'});
const ownedScript=async(name,extra=[])=>promisify(execFile)('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.resolve('tests/'+name),'-WindowProcessId',String(child.pid),...extra],{windowsHide:true});
const ownedWindow=async kind=>JSON.parse((await ownedScript('find-owned-window.ps1',['-WindowKind',kind])).stdout);
let browser,page,context;const results=[],edgeDiagnostics=[];const check=async(name,action)=>{await action();results.push({name,passed:true});console.log('PASS '+label+' '+name);};
const exit=process=>new Promise(resolve=>{if(process.exitCode!==null)resolve(process.exitCode);else process.once('exit',resolve);});
try{
  for(let attempt=0;attempt<100;attempt++){try{browser=await chromium.connectOverCDP('http://127.0.0.1:'+port,{timeout:800});break;}catch{if(child.exitCode!==null)throw Error('Packaged app exited '+child.exitCode);await new Promise(r=>setTimeout(r,100));}}
  assert.ok(browser,'Packaged Chromium debug connection for isolated acceptance only');context=browser.contexts()[0];page=context.pages()[0]||await context.waitForEvent('page',{timeout:15000});
  const call=(op,input={})=>page.evaluate(({op,input})=>window.apsDesktop[op](input),{op,input});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await check('fresh native window without external Node, npm, HTTP service or browser',async()=>{
    await page.getByTestId('onboard-codex').waitFor();await waitUntil(async()=>(await call('status')).windowVisible);
    assert.equal(page.url(),'aps://studio/');assert.deepEqual(await page.evaluate(()=>({require:typeof require,process:typeof process})),{require:'undefined',process:'undefined'});
    const status=await call('status');assert.equal(status.runtime.externalNodeRequired,false);assert.equal(status.runtime.httpListener,false);assert.equal(status.openAtLogin,false);assert.equal(status.version,VERSION);
    if(label==='portable'){assert.equal(status.portable,true);assert.equal(status.dataDirectory,path.resolve(profile));}
    const processes=JSON.parse((await promisify(execFile)('powershell.exe',['-NoProfile','-Command',`Get-CimInstance Win32_Process -Filter "ParentProcessId = ${child.pid}" | Select-Object Name | ConvertTo-Json -Compress`],{windowsHide:true})).stdout||'[]');
    assert.ok(![processes].flat().some(p=>/node|chrome|msedge|cmd/i.test(p?.Name||'')));
    await page.screenshot({path:evidence+'/'+label+'-packaged-first-run.png'});
    await promisify(execFile)('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.resolve('tests/capture-window.ps1'),'-WindowProcessId',String(child.pid),'-OutputPath',evidence+'/'+label+'-native-window.png'],{windowsHide:true});
  });
  await check('single instance focuses existing window and exits duplicate',async()=>{const duplicate=spawn(executable,args,{env,windowsHide:true,stdio:'ignore'});const code=await Promise.race([exit(duplicate),new Promise((_,reject)=>setTimeout(()=>{duplicate.kill();reject(Error('Duplicate timeout'));},10000))]);assert.equal(code,0);assert.equal((await call('status')).windowVisible,true);});
  await check('packaged Codex consent, session switch and Work lifecycle metadata',async()=>{
    await page.getByTestId('onboard-codex').click();await page.getByTestId('allow-content-access').click();await page.getByTestId('confirm-content-access').click();await page.getByRole('heading',{name:'SYNTHETIC_PACKAGED_TASK',exact:true}).waitFor();
    await page.getByTestId('revoke-content-access').click();await page.getByTestId('allow-content-access').waitFor();assert.doesNotMatch(await page.locator('#app').innerText(),/SYNTHETIC_PACKAGED_TASK/);
    await page.getByTestId('monitor-source').selectOption('work-hooks');await page.getByTestId('monitor-session').waitFor();
    const event=(type,session)=>({event_type:type,session_id:session,turn_id:'synthetic-turn',timestamp:new Date().toISOString(),...(['PreToolUse','PostToolUse'].includes(type)?{tool_name:'synthetic-sleep',tool_status:type==='PreToolUse'?'started':'succeeded'}:{})});let n=0;
    const append=async(type,session)=>fs.writeFile(events+'/'+Date.now()+'-00000000-0000-4000-8000-'+String(++n).padStart(12,'0')+'.json',JSON.stringify(event(type,session)));
    await append('SessionStart','packaged-work-a');await append('PreToolUse','packaged-work-a');await page.getByTestId('monitor-status').filter({hasText:'已观测到工具开始执行'}).waitFor({timeout:10000});
    const runner=spawn(executable,['--aps-hook','--aps-hook-spool',events],{env,windowsHide:true,stdio:['pipe','pipe','ignore']});runner.stdin.end(JSON.stringify({hook_event_name:'PostToolUse',session_id:'packaged-work-a',turn_id:'synthetic-turn',tool_name:'synthetic-sleep',tool_response:{exit_code:0,text:'PRIVATE_OUTPUT'}}));assert.equal(await exit(runner),0);await page.getByTestId('monitor-status').filter({hasText:'已观测到工具返回'}).waitFor();assert.equal((await fs.readdir(events)).filter(n=>n.includes('-a95de510-')).length,1,'Owned GUI ingress and standalone EXE meet on the real named pipe');
    await append('PostToolUse','packaged-work-a');await append('Stop','packaged-work-a');await page.getByTestId('monitor-status').filter({hasText:'最近回合已停止'}).waitFor();
    await append('UserPromptSubmit','packaged-work-b');await page.waitForFunction(()=>document.querySelector('[data-testid="monitor-session"]').options.length>=2);assert.equal(await page.getByTestId('monitor-session').inputValue(),'packaged-work-a');
    await page.getByTestId('monitor-session').selectOption('packaged-work-b');await page.waitForFunction(()=>document.querySelector('[data-testid="monitor-session"]')?.value==='packaged-work-b');assert.equal(await page.getByTestId('overall-progress').innerText(),'未知');
  });
  await check('pause/restart retains chosen session; English and light theme',async()=>{
    await page.getByTestId('desktop-monitor-toggle').click();await page.waitForFunction(()=>document.querySelector('[data-testid="desktop-monitor-toggle"]').textContent.includes('恢复'));
    await page.getByTestId('desktop-monitor-toggle').click();await page.waitForFunction(()=>document.querySelector('[data-testid="monitor-session"]')?.value==='packaged-work-b');
    await page.getByTestId('language-toggle').click();await page.getByTestId('theme-toggle').click();await page.waitForFunction(()=>document.documentElement.lang==='en'&&document.documentElement.dataset.theme==='light');await page.screenshot({path:evidence+'/'+label+'-packaged-monitor.png'});
    await promisify(execFile)('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.resolve('tests/capture-window.ps1'),'-WindowProcessId',String(child.pid),'-OutputPath',evidence+'/'+label+'-native-monitor.png'],{windowsHide:true});
    assert.deepEqual(errors,[]);
  });
  await check('packaged native floating window, four opacity-controlled drawers and shared permissions',async()=>{
    await call('floatingControl',{action:'show'});
    let floating;for(let i=0;i<40&&!floating;i++){floating=context.pages().find(p=>p.url()==='aps://studio/floating.html');if(!floating)await new Promise(r=>setTimeout(r,100));}
    assert.ok(floating);await floating.getByTestId('float-status').waitFor();
    await floating.evaluate(()=>{window.__packagedEdgeEvents=[];const add=entry=>{window.__packagedEdgeEvents.push(entry);window.__packagedEdgeEvents=window.__packagedEdgeEvents.slice(-50);};window.apsDesktop.onWindowState(s=>add({type:'state',mode:s.mode,edge:s.edge,peek:s.peek,opacity:s.opacity,at:Date.now()}));for(const type of ['pointerdown','pointerup','click'])document.addEventListener(type,e=>{const b=document.querySelector('[data-testid="float-expand"]')?.getBoundingClientRect();add({type,testId:e.target.closest?.('[data-testid]')?.dataset.testid,target:e.target.tagName,client:{x:e.clientX,y:e.clientY},screen:{x:e.screenX,y:e.screenY},button:b&&{x:b.x,y:b.y,width:b.width,height:b.height},at:Date.now()});},true);});
    assert.deepEqual(await floating.evaluate(()=>({require:typeof require,process:typeof process})),{require:'undefined',process:'undefined'});
    await assert.rejects(floating.evaluate(()=>window.apsDesktop.snapshot()));await assert.rejects(floating.evaluate(()=>window.apsDesktop.exportReport()));
    const bootstrap=await call('bootstrap');
    const background=JSON.parse((await ownedScript('find-owned-window.ps1',['-WindowKind','main','-MaximizeMain'])).stdout);
    const regionRows=[];
    for(const edge of ['left','right','top','bottom']){
      const prior=await ownedWindow('floating');await ownedScript('move-owned-pointer.ps1',['-WindowHandle',background.handle,'-OverlayHandle',prior.handle,'-TargetX',String(background.x+300),'-TargetY',String(background.y+300)]);
      const small=await call('floatingControl',{action:'dock',edge});await call('floatingControl',{action:'unpeek'});assert.equal(small.mode,'DOCKED_COLLAPSED');assert.ok(Math.abs((await call('floatingStatus')).opacity)<.01,'Idle native cue must be completely transparent');assert.equal(['left','right'].includes(edge)?small.bounds.width:small.bounds.height,2);
      const native=await ownedWindow('floating'),region=JSON.parse((await ownedScript('inspect-owned-region.ps1',['-WindowHandle',native.handle])).stdout),vertical=['left','right'].includes(edge);
      assert.ok(region.kind>1);assert.ok((vertical?region.width:region.height)<=Math.ceil(2*native.scale)+1&&(vertical?region.height:region.width)<=Math.ceil(24*native.scale)+1,'Packaged native edge must actually be short and thin');regionRows.push({edge,native,region});
      const pixelArgs=['-WindowHandle',background.handle,'-TargetX',String(Math.floor(native.x+region.x+region.width/2)),'-TargetY',String(Math.floor(native.y+region.y+region.height/2))];
      await call('floatingControl',{action:'hide'});const before=JSON.parse((await ownedScript('sample-owned-pixel.ps1',pixelArgs)).stdout);await call('floatingControl',{action:'show'});const after=JSON.parse((await ownedScript('sample-owned-pixel.ps1',pixelArgs)).stdout);assert.equal(after.color,before.color,'Packaged invisible cue must show the actual underlying pixels');regionRows.at(-1).underlyingPixel={before,after};
      await ownedScript('click-owned-window.ps1',['-TargetHandle',background.handle,'-OverlayHandle',native.handle,'-TargetX','0','-TargetY','0','-ApproachFirst','-ApproachOnly']);await floating.getByTestId('float-expand').waitFor();await floating.waitForFunction(edge=>document.body.dataset.edge===edge&&Math.abs((['left','right'].includes(edge)?document.body.getBoundingClientRect().width:document.body.getBoundingClientRect().height)-28)<1,edge);
      assert.ok(Math.abs((await call('floatingStatus')).opacity-.5)<.01,'Nearby native tag opacity must be 50%');
      // Read the already synchronized renderer geometry without another slow
      // PowerShell compilation between hover and click. Win32 owns the handle,
      // scale and hit-test guard; these tests run on the recorded single screen.
      const button=await floating.getByTestId('float-expand').boundingBox();assert.ok(button);const view=await floating.evaluate(()=>({x:screenX,y:screenY})),point={x:Math.round((view.x+button.x+button.width/2)*native.scale),y:Math.round((view.y+button.y+button.height/2)*native.scale)};edgeDiagnostics.push({edge,stage:'before-click',view,button,point});await ownedScript('click-owned-window.ps1',['-TargetHandle',native.handle,'-OverlayHandle',native.handle,'-TargetX',String(point.x),'-TargetY',String(point.y)]);
      await floating.waitForFunction(()=>document.body.dataset.mode==='DOCKED_EXPANDED');await call('floatingControl',{action:'expandedPinned',value:true});
      const full=await call('floatingStatus');assert.equal(full.mode,'DOCKED_EXPANDED');assert.ok(Math.abs(full.opacity-1)<.01,'Expanded native drawer opacity must be 100%');
      await floating.getByTestId('float-session').waitFor();await floating.waitForFunction(()=>document.documentElement.lang==='en'&&document.documentElement.dataset.theme==='light');
      const area=full.displays.find(d=>d.id===full.displayId).workArea;
      if(edge==='left')assert.equal(full.bounds.x,area.x);if(edge==='right')assert.equal(full.bounds.x+full.bounds.width,area.x+area.width);
      if(edge==='top')assert.equal(full.bounds.y,area.y);if(edge==='bottom')assert.equal(full.bounds.y+full.bounds.height,area.y+area.height);
      await floating.screenshot({path:evidence+'/'+label+'-native-drawer-'+edge+'.png'});
      await call('floatingControl',{action:'expandedPinned',value:false});await call('floatingControl',{action:'undock'});
    }
    await fs.writeFile(evidence+'/'+label+'-native-edge-regions.json',JSON.stringify(regionRows,null,2));
    await call('floatingControl',{action:'hide'});await call('floatingControl',{action:'show'});
    assert.equal((await call('bootstrap')).access.authorityInstanceId,bootstrap.access.authorityInstanceId);
    assert.equal((await call('powerStatus')).simulation,true);assert.equal((await call('powerStatus')).state,'DISABLED');
    const b=await call('bootstrap'),scope={authorityInstanceId:b.access.authorityInstanceId,expectedPolicyRevision:b.access.policyRevision,selectionRevision:b.access.selectionRevision};
    const reduced=await floating.evaluate(input=>window.apsDesktop.selectSource(input),{mode:'work-hooks',id:'packaged-work-b',...scope});assert.equal(reduced.task.events,undefined);assert.equal(reduced.evidence,undefined);
    await call('cacheClean');let notice;for(let i=0;i<50&&!notice;i++){notice=context.pages().find(p=>p.url()==='aps://studio/notice.html');if(!notice)await new Promise(r=>setTimeout(r,100));}assert.ok(notice);
    const current=await call('bootstrap'),currentScope={authorityInstanceId:current.access.authorityInstanceId,expectedPolicyRevision:current.access.policyRevision,selectionRevision:current.access.selectionRevision};
    const first=await notice.evaluate(scope=>new Promise(resolve=>{let stop=()=>{};stop=window.apsDesktop.observe(scope,frame=>{stop();resolve(frame.type);});setTimeout(()=>{stop();resolve('timeout');},3000);}),currentScope);assert.equal(first,'invalidate');
    await call('floatingControl',{action:'hide'});
  });
  if(label==='installed')await check('explicit login startup registers only installed executable',async()=>{await call('preference',{key:'openAtLogin',value:true});assert.equal((await call('status')).openAtLogin,true);const value=(await promisify(execFile)('powershell.exe',['-NoProfile','-Command',"(Get-ItemPropertyValue -LiteralPath 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' -Name 'Agent Progress Studio Desktop')"],{windowsHide:true})).stdout.trim();assert.equal(value,'"'+executable+'" --aps-start-hidden');});
  await check('clean quit exits collectors and process',async()=>{await page.getByTestId('desktop-quit').click();await Promise.race([exit(child),new Promise((_,reject)=>setTimeout(()=>reject(Error('Quit timeout')),10000))]);assert.equal(child.exitCode,0);});
  await check('bundled EXE Hook runner projects exact six fields without external Node',async()=>{
    const directory=root+'/own-spool',access=new SessionAccess(),ref=sessionRef('hooks:'+directory.toLowerCase(),'scope');await access.change(ref,{observe:true},access.revision);const permit=access.issue(ref,'observe'),ingress=await new HookIngress(directory,access,permit).start();
    try{await writeMarker(directory,{schema:1,enabled:true,instance:access.instanceId,generation:permit.dependency.generation,expiresAt:Date.now()+15000,pipe:ingress.pipe,token:ingress.token});
      const runner=spawn(executable,['--aps-hook','--aps-hook-spool',directory],{env,windowsHide:true,stdio:['pipe','pipe','ignore']});let stdout='';runner.stdout.on('data',b=>stdout+=b);runner.stdin.end(JSON.stringify({hook_event_name:'PostToolUse',session_id:'synthetic-host',turn_id:null,tool_name:'sleep',tool_response:{exit_code:0,text:'PRIVATE_OUTPUT'},prompt:'PRIVATE_PROMPT'}));assert.equal(await exit(runner),0);assert.deepEqual(JSON.parse(stdout),{});
      const files=(await fs.readdir(directory)).filter(x=>/^\d/.test(x));assert.equal(files.length,1);const text=await fs.readFile(directory+'/'+files[0],'utf8');assert.doesNotMatch(text,/PRIVATE/);assert.deepEqual(Object.keys(JSON.parse(text)).sort(),['event_type','session_id','timestamp','tool_name','tool_status','turn_id']);
      await access.change(ref,{observe:false},access.revision);ingress.close();await removeMarker(directory);
      const inactive=spawn(executable,['--aps-hook','--aps-hook-spool',directory],{env,windowsHide:true,stdio:['pipe','pipe','ignore']});inactive.stdin.end('{}');assert.equal(await exit(inactive),0);assert.equal((await fs.readdir(directory)).length,1);
    }finally{ingress.close();}
  });
  await fs.writeFile(evidence+'/'+label+'-packaged-results.json',JSON.stringify({syntheticOnly:true,executable,pathWithoutNode:env.PATH,debugPortOnlyForAcceptance:true,edgeDiagnostics,results},null,2));
}catch(error){const floating=context?.pages().find(p=>p.url()==='aps://studio/floating.html');await fs.writeFile(evidence+'/'+label+'-packaged-failure.json',JSON.stringify({syntheticOnly:true,results,error:error.message,edgeDiagnostics,native:await ownedWindow('floating').catch(()=>null),diagnostic:await floating?.evaluate(async()=>({state:await window.apsDesktop.floatingStatus(),mode:document.body.dataset.mode,events:window.__packagedEdgeEvents,rect:{x:screenX,y:screenY,width:innerWidth,height:innerHeight}})).catch(()=>null)},null,2));throw error;
}finally{await browser?.close().catch(()=>{});if(child.exitCode===null)child.kill();await fs.rm(root,{recursive:true,force:true}).catch(()=>{});}
