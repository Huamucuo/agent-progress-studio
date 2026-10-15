import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Readable } from 'node:stream';
import { HookManager,installManagedHook } from '../desktop/hooks.mjs';
import { recordHook, runRecorder, writeMarker, removeMarker } from '../desktop/recorder.mjs';
import { readOwnedJSON,writeOwnedJSON } from '../desktop/owned-files.mjs';
async function fixture(t) { const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'aps-hook-desktop-'))); t.after(() => fs.rm(root, { recursive: true, force: true })); return root; }
test('official installed-array and marketplaceName are handled without guessing installation or reading bodies',async t=>{
 const root=await fixture(t);await fs.mkdir(root+'/legacy');await fs.writeFile(root+'/legacy/settings.json',JSON.stringify({eventsDir:root+'/events'}));
 const manager=new HookManager({directory:root+'/owned',executable:root+'/App.exe',spool:root+'/new',codex:root+'/codex.exe',run:async()=>({stdout:JSON.stringify({installed:[{name:'agent-progress-studio-desktop',marketplaceName:'aps-desktop-local',installed:true,enabled:true},{name:'aps-work-hook-probe',marketplaceName:'aps-local-hook-experiment',installed:true,enabled:true,source:{source:'local',path:root+'/legacy'}}]})})});
 const status=await manager.status();assert.equal(status.installed,true);assert.equal(status.existingProbe.eventsDir,root+'/events');assert.match(status.trust,/UNKNOWN/);
});
test('managed Hook consent uses only owned official commands and never bypasses trust', async t => {
  const root = await fixture(t), calls = [], exe = path.join(root, 'App.exe'); await fs.writeFile(exe, 'synthetic');
  const manager = new HookManager({ directory: root + '/marketplace', executable: exe, spool: root + '/events', codex: root + '/codex.exe', run: async (file,args) => { calls.push(args);return {stdout:JSON.stringify({installed:args[1]==='list'&&calls.some(c=>c[1]==='add')?[{name:'agent-progress-studio-desktop',marketplaceName:'aps-desktop-local',installed:true,source:{source:'local',path:root+'/marketplace/plugins/agent-progress-studio-desktop'}}]:[]})}; } });
  await assert.rejects(manager.install((await manager.prepare()).planId, async () => false)); assert.equal(calls.filter(args=>args[1]!=='list').length, 0);
  await manager.install((await manager.prepare()).planId, async () => true);
  assert.equal(calls.filter(args=>args[1]!=='list').length, 2); assert.equal(calls.some(args => args.join(' ').includes('bypass')), false);
  assert.equal(JSON.parse(await fs.readFile(root+'/marketplace/plugins/agent-progress-studio-desktop/.codex-plugin/plugin.json')).hooks,'./hooks/hooks.json');
  const hooks = JSON.parse(await fs.readFile(root + '/marketplace/plugins/agent-progress-studio-desktop/hooks/hooks.json'));
  assert.match(hooks.hooks.PreToolUse[0].hooks[0].command, /--aps-hook/); assert.doesNotMatch(hooks.hooks.PreToolUse[0].hooks[0].command, /\bnode\b|powershell/i);
  await manager.remove(async () => true); assert.deepEqual(calls.at(-1), ['plugin','remove','agent-progress-studio-desktop@aps-desktop-local','--json']);
});
test('bundled recorder retains exact metadata and refuses inactive collection before consuming stdin', async t => {
  const root = await fixture(t), dir = root + '/events', input = { hook_event_name: 'PostToolUse', session_id: 'work-a', turn_id: 'turn-a', tool_name: 'sleep', tool_response: { exit_code: 0, text: 'PRIVATE_TOOL_OUTPUT' }, prompt: 'PRIVATE_PROMPT' };
  let consumed = false, output = ''; const stream = Readable.from((async function* () { consumed = true; yield Buffer.from(JSON.stringify(input)); })());
  await runRecorder(dir, stream, { write: text => { output += text; } }); assert.equal(consumed, false); assert.equal(output, '{}');
  await writeMarker(dir, { schema: 1, enabled: true, instance: 'synthetic-instance', generation: 1, expiresAt: Date.now() + 15000 });
  assert.equal(await recordHook(dir, input), true);
  const files = (await fs.readdir(dir)).filter(x => /^\d.*\.json$/.test(x)); const raw = await fs.readFile(path.join(dir, files[0]), 'utf8'); assert.doesNotMatch(raw, /PRIVATE/);
  assert.deepEqual(Object.keys(JSON.parse(raw)).sort(), ['event_type','session_id','timestamp','tool_name','tool_status','turn_id']);
  await removeMarker(dir); await assert.rejects(recordHook(dir, input)); assert.equal((await fs.readdir(dir)).filter(x => /^\d.*\.json$/.test(x)).length, 1);
});
test('owned setup metadata rejects hardlinks before reading and cannot choose an executable from a record',async t=>{
  const root=await fixture(t),file=root+'/owned.json',alias=root+'/alias.json';await fs.writeFile(file,JSON.stringify({private:'SYNTHETIC_PRIVATE'}));await fs.link(file,alias);
  await assert.rejects(readOwnedJSON(root,alias),/denied/);await assert.rejects(writeOwnedJSON(root,alias,{}),/alias/);assert.match(await fs.readFile(file,'utf8'),/SYNTHETIC_PRIVATE/);
  const calls=[],manager=new HookManager({directory:root+'/plugin',executable:root+'/App.exe',spool:root+'/events',codex:root+'/official/codex.exe',run:async(f,args)=>{calls.push({f,args});return {stdout:JSON.stringify({installed:[{name:'agent-progress-studio-desktop',marketplaceName:'aps-desktop-local',installed:true,source:{source:'local',path:root+'/plugin/plugins/agent-progress-studio-desktop'}}]})};}});
  await fs.mkdir(root+'/plugin/plugins/agent-progress-studio-desktop',{recursive:true});
  await writeOwnedJSON(root,root+'/plugin/desktop-plugin-ownership.json',{schema:1,plugin:'agent-progress-studio-desktop@aps-desktop-local',codex:root+'/attacker/codex.exe'});
  let paused=false;await manager.remove(async()=>true,async()=>{paused=true;});assert.equal(paused,true);assert.equal(calls.at(-1).f,root+'/official/codex.exe');
});
test('approved managed install changes only the selected event directory and clears old session after success',async()=>{
  const settings={value:{mode:'work-hooks',workHooksDir:'old-probe',selectionId:'old-id'},async save(value){Object.assign(this.value,value);}},manager={async install(_id,confirm){if(!await confirm())throw Error('Not authorized');return {installed:true};}};let restarts=0;
  await assert.rejects(installManagedHook(manager,'plan',async()=>false,settings,'own-spool',async()=>restarts++));assert.equal(settings.value.workHooksDir,'old-probe');assert.equal(restarts,0);
  await installManagedHook(manager,'plan',async()=>true,settings,'own-spool',async()=>restarts++);assert.equal(settings.value.workHooksDir,'own-spool');assert.equal(settings.value.selectionId,'');assert.equal(restarts,1);
});
test('owned retention rotates only its namespace without reading retained bodies and survives a fresh writer',async t=>{
  const root=await fixture(t),marker={schema:1,enabled:true,instance:'fixture',generation:1,expiresAt:Date.now()+15000};await writeMarker(root,marker);
  const input={hook_event_name:'Stop',session_id:'synthetic',turn_id:null};
  for(let i=0;i<4;i++)assert.equal(await recordHook(root,input,{retentionLimit:2}),true);
  const owned=(await fs.readdir(root)).filter(x=>x.includes('-a95de510-'));assert.equal(owned.length,2);
  const external=root+'/1000000000000-aaaaaaaa-0000-4000-8000-000000000001.json';await fs.writeFile(external,'SYNTHETIC_INDEPENDENT_DATA');await writeMarker(root,{...marker,generation:2});
  assert.equal(await recordHook(root,input,{retentionLimit:2}),true);assert.equal((await fs.readdir(root)).filter(x=>x.includes('-a95de510-')).length,2);assert.equal(await fs.readFile(external,'utf8'),'SYNTHETIC_INDEPENDENT_DATA');
});
test('installed desktop plugin in a different profile is not treated as the current observation target',async t=>{
  const root=await fixture(t),exe=root+'/App.exe',codex=root+'/codex.exe',other=root+'/other/plugins/agent-progress-studio-desktop';
  await fs.writeFile(exe,'synthetic');await fs.writeFile(codex,'synthetic');await fs.mkdir(other,{recursive:true});
  const calls=[],manager=new HookManager({directory:root+'/current',executable:exe,spool:root+'/events',codex,inspect:async()=>[],run:async(_f,args)=>{calls.push(args);return {stdout:JSON.stringify({installed:[{name:'agent-progress-studio-desktop',marketplaceName:'aps-desktop-local',installed:true,enabled:true,source:{source:'local',path:other}}]})};}});
  assert.equal((await manager.status()).installationTarget,'OTHER_PROFILE');
  await assert.rejects(manager.prepare(),/another profile/i);
  assert.equal(calls.every(args=>['plugin list --marketplace aps-desktop-local --json','plugin list --marketplace aps-local-hook-experiment --json'].includes(args.join(' '))),true);
  await assert.rejects(fs.stat(root+'/current'),{code:'ENOENT'});
});
test('status restricts discovery to APS local markets, coalesces in-flight checks and never caches trust across checks',async t=>{
  const root=await fixture(t),codex=root+'/codex.exe';await fs.writeFile(codex,'synthetic');
  let release,calls=[],checks=0;const gate=new Promise(resolve=>release=resolve);
  const manager=new HookManager({directory:root+'/owned',executable:root+'/App.exe',spool:root+'/events',codex,inspect:async()=>{checks++;return [];},run:async(_file,args)=>{
    calls.push(args);assert.equal(args[2],'--marketplace');await gate;
    if(args[3]==='aps-local-hook-experiment')throw Error('Synthetic independent market failure');
    return {stdout:JSON.stringify({installed:[{name:'agent-progress-studio-desktop',marketplaceName:'aps-desktop-local',installed:true,enabled:true}]})};
  }});
  const a=manager.status(),b=manager.status();release();const values=await Promise.all([a,b]);
  assert.equal(values[0].installed,true);assert.equal(values[1].installed,true);assert.equal(calls.length,2);assert.equal(checks,1);
  assert.equal(values[0].query,'AVAILABLE');await manager.status();assert.equal(calls.length,4);assert.equal(checks,2);
});
test('failed official own-market discovery stays unknown while independent legacy discovery remains usable',async t=>{
 const root=await fixture(t);await fs.mkdir(root+'/legacy');await fs.writeFile(root+'/legacy/settings.json',JSON.stringify({eventsDir:root+'/events'}));
 const manager=new HookManager({directory:root+'/owned',executable:root+'/App.exe',spool:root+'/events',codex:root+'/codex.exe',run:async(_file,args)=>{
  if(args[3]!=='aps-local-hook-experiment')throw Error('Synthetic own market failure');
  return {stdout:JSON.stringify({installed:[{name:'aps-work-hook-probe',marketplaceName:'aps-local-hook-experiment',installed:true,enabled:true,source:{source:'local',path:root+'/legacy'}}]})};
 }});
 const status=await manager.status();assert.equal(status.installed,null);assert.equal(status.query,'UNAVAILABLE');assert.equal(status.existingProbe.eventsDir,root+'/events');
});
test('an installed plugin with unverified source cannot silently replace a marketplace',async t=>{
  const root=await fixture(t),exe=root+'/App.exe';await fs.writeFile(exe,'synthetic');
  const manager=new HookManager({directory:root+'/current',executable:exe,spool:root+'/events',codex:root+'/codex.exe',run:async()=>({stdout:JSON.stringify({installed:[{name:'agent-progress-studio-desktop',marketplaceName:'aps-desktop-local',installed:true}]})})});
  assert.equal((await manager.status()).installationTarget,'UNKNOWN');await assert.rejects(manager.prepare(),/installation target/i);
});
