import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const repository=process.cwd(), evidence=path.resolve(process.env.APS_EVIDENCE_DIR||'../../outputs/floating-evidence');await fs.mkdir(evidence,{recursive:true});
const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'aps-native-ui-'))), home=path.join(root,'codex'), profile=path.join(root,'profile'), events=path.join(root,'events');
const id='abcdef12-abcd-4abc-8abc-abcdef123456';
await fs.mkdir(home+'/sessions',{recursive:true});await fs.mkdir(events);
await fs.writeFile(home+'/sessions/'+id+'.jsonl',JSON.stringify({type:'session_meta',payload:{id}})+'\n'+JSON.stringify({type:'event_msg',payload:{type:'user_message',message:'SYNTHETIC_DESKTOP_TASK'}})+'\n');
const app=await electron.launch({executablePath:path.join(repository,'node_modules/electron/dist/electron.exe'),args:[repository,'--aps-profile',profile,'--aps-codex-home',home,'--aps-hook-directory',events],timeout:30000});
const results=[], errors=[], page=await app.firstWindow(); page.on('pageerror',error=>errors.push(error.message));
const check=async(name, action)=>{await action();results.push({name,passed:true});console.log('PASS '+name);};
const call=async(op,input={})=>page.evaluate(({op,input})=>window.apsDesktop[op](input),{op,input});
const scope=async()=>{const b=await call('bootstrap');return {authorityInstanceId:b.access.authorityInstanceId,expectedPolicyRevision:b.access.policyRevision,selectionRevision:b.access.selectionRevision};};
try {
  await check('native first-run window, sandbox and packaged-only navigation',async()=>{
    await page.getByTestId('onboard-codex').waitFor(); assert.equal(page.url(),'aps://studio/');
    await app.evaluate(async ({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];if(!w.isVisible())await new Promise(resolve=>w.once('show',resolve));});
    assert.deepEqual(await page.evaluate(()=>({require:typeof require,process:typeof process,bridge:typeof window.apsDesktop.snapshot})),{require:'undefined',process:'undefined',bridge:'function'});
    const options=await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];const p=w.webContents.getLastWebPreferences();return {contextIsolation:p.contextIsolation,nodeIntegration:p.nodeIntegration,sandbox:p.sandbox,visible:w.isVisible()};});
    assert.deepEqual(options,{contextIsolation:true,nodeIntegration:false,sandbox:true,visible:true});
    await page.screenshot({path:path.join(evidence,'desktop-first-run.png')});
    await page.getByTestId('onboard-codex').click();await page.getByTestId('allow-content-access').waitFor();
    assert.doesNotMatch(await page.locator('#app').innerText(),/SYNTHETIC_DESKTOP_TASK/);
  });
  await check('Codex synthetic activity, explicit permission, native export and revoke',async()=>{
    await page.getByTestId('allow-content-access').click();await page.getByTestId('confirm-content-access').click();await page.getByTestId('revoke-content-access').waitFor();
    await page.getByRole('heading',{name:'SYNTHETIC_DESKTOP_TASK',exact:true}).waitFor();
    const report=path.join(root,'export.json');await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},report);
    await page.getByTestId('export').click();await page.waitForFunction(()=>document.getElementById('toast').textContent.includes('报告已保存'));
    assert.match(await fs.readFile(report,'utf8'),/SYNTHETIC_DESKTOP_TASK/);
    await page.getByTestId('revoke-content-access').click();await page.getByTestId('allow-content-access').waitFor();assert.doesNotMatch(await page.locator('#app').innerText(),/SYNTHETIC_DESKTOP_TASK/);
  });
  await check('Work lifecycle fixture, automatic discovery and selected-session stability',async()=>{
    await page.getByTestId('monitor-source').selectOption('work-hooks');await page.getByTestId('monitor-session').waitFor();
    const event=(name,session='work-synthetic')=>({event_type:name,session_id:session,turn_id:'turn-fixture',timestamp:new Date().toISOString(),...(name==='PreToolUse'?{tool_name:'fixture-sleep',tool_status:'started'}:name==='PostToolUse'?{tool_name:'fixture-sleep',tool_status:'succeeded'}:{})});
    let n=0;const append=async data=>fs.writeFile(path.join(events,`${Date.now()}-00000000-0000-4000-8000-${String(++n).padStart(12,'0')}.json`),JSON.stringify(data));
    await append(event('SessionStart'));await append(event('UserPromptSubmit'));await append(event('PreToolUse'));
    try { await page.getByTestId('monitor-status').filter({hasText:'已观测到工具开始执行'}).waitFor({timeout:10000}); }
    catch(e) {const s=await call('snapshot');console.log(JSON.stringify({source:s.source,monitor:s.monitor,events:s.task.events.map(e=>({name:e.name,at:e.at})),statusText:await page.getByTestId('monitor-status').innerText()}));await page.screenshot({path:path.join(evidence,'desktop-work-failure.png')});throw e;}
    assert.equal(await page.getByTestId('overall-progress').innerText(),'未知');
    await append(event('PostToolUse'));await append(event('Stop'));await page.getByTestId('monitor-status').filter({hasText:'最近回合已停止'}).waitFor();
    await append(event('SessionStart','work-new'));await page.waitForFunction(()=>document.querySelector('[data-testid="monitor-session"]').options.length>=2);assert.equal(await page.getByTestId('monitor-session').inputValue(),'work-synthetic');
    await page.getByTestId('monitor-session').selectOption('work-new');await page.waitForFunction(()=>document.querySelector('[data-testid="monitor-session"]')?.value==='work-new');
  });
  await check('pause, fresh restart, settings defaults and tray close semantics',async()=>{
    const before=await call('status');assert.equal(before.openAtLogin,false);assert.equal(before.closeToTray,false);assert.equal(before.runtime.httpListener,false);
    await page.getByTestId('desktop-monitor-toggle').click();await page.waitForFunction(()=>document.querySelector('[data-testid="desktop-monitor-toggle"]').textContent.includes('恢复'));
    await page.getByTestId('desktop-monitor-toggle').click();await page.getByTestId('monitor-source').waitFor();
    await call('preference',{key:'closeToTray',value:true});await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL()==='aps://studio/').close());assert.equal((await call('status')).windowVisible,false);
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL()==='aps://studio/').show());await call('preference',{key:'closeToTray',value:false});
  });
  await check('English/light mode, demo validation and desktop screenshot',async()=>{
    await page.getByTestId('monitor-source').selectOption('demo');await page.getByTestId('replay-finish').click();
    await page.getByTestId('language-toggle').click();await page.getByTestId('theme-toggle').click();
    await page.waitForFunction(()=>document.documentElement.lang==='en'&&document.documentElement.dataset.theme==='light');await page.screenshot({path:path.join(evidence,'desktop-light-en.png')});
    await page.getByTestId('language-toggle').click();await page.getByTestId('theme-toggle').click();await page.screenshot({path:path.join(evidence,'desktop-dark-zh.png')});
  });
  assert.deepEqual(errors,[]);
  const diagnostics=await call('logs');assert.doesNotMatch(diagnostics.text,/SYNTHETIC_DESKTOP_TASK|fixture-sleep/);
  await fs.writeFile(path.join(evidence,'desktop-window-results.json'),JSON.stringify({syntheticOnly:true,results,errors,nativeWindow:true,saveDialog:'test-stubbed native picker; real export writer exercised',runtime:await call('status')},null,2));
} finally {await app.close();await fs.rm(root,{recursive:true,force:true}).catch(()=>{});}
