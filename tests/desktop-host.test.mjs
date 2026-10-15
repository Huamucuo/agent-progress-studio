import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { DesktopHost, validateDesktopInput } from '../desktop/host.mjs';
const id = 'abcdef12-abcd-4abc-8abc-abcdef123456';
async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'aps-desktop-')));
  await fs.mkdir(root + '/codex/sessions', { recursive: true });
  await fs.writeFile(root + '/codex/sessions/' + id + '.jsonl', JSON.stringify({ type: 'session_meta', payload: { id } }) + '\n' + JSON.stringify({ type: 'event_msg', payload: { type: 'user_message', message: 'SYNTHETIC_DESKTOP_PRIVATE' } }) + '\n');
  const host = new DesktopHost({ dataDir: root + '/data', codexHome: root + '/codex', workHooksDir: root + '/events', interval: 0 });
  await host.start(); t.after(async () => { await host.close(); await fs.rm(root, { recursive: true, force: true }); }); return { host, root };
}
const scope = h => ({ authorityInstanceId: h.service.access.instanceId, expectedPolicyRevision: h.service.access.revision, selectionRevision: h.service.selectionRevision });
test('sidebar chat crosses the same body gateway; denied/revoked readers call openLog zero and old messages cannot return after regrant',async t=>{
 const {host,root}=await fixture(t);await fs.appendFile(root+'/codex/sessions/'+id+'.jsonl',JSON.stringify({type:'event_msg',payload:{type:'agent_message',phase:'final_answer',message:'SYNTHETIC_SIDEBAR_PUBLIC'}})+'\n');
 let reads=0;const original=host.service.gateway.openLog.bind(host.service.gateway);host.service.gateway.openLog=(...args)=>{reads++;return original(...args);};
 const denied=await host.request('monitor');assert.equal(reads,0);assert.deepEqual(denied.conversation.messages,[]);
 await host.request('sessionAccess',{sessionId:id,decision:'allow-codex',...scope(host)});const allowed=await host.request('monitor');assert.ok(reads>0,'Real granted read proves the I/O counter works');assert.equal(allowed.conversation.messages.at(-1).text,'SYNTHETIC_SIDEBAR_PUBLIC');
 await host.request('sessionAccess',{sessionId:id,decision:'revoke',...scope(host)});const after=reads;assert.deepEqual((await host.request('monitor')).conversation.messages,[]);assert.equal(reads,after,'Revoked chat must never enter the body reader');
 await host.request('sessionAccess',{sessionId:id,decision:'allow-codex',...scope(host)});let outputs=0;assert.throws(()=>host.sendResponse(allowed,()=>outputs++));assert.equal(outputs,0,'A regrant must not revive the old chat publication');
});
test('floating source mutations return only the sealed monitor view; main retains full evidence and revoke rejects old output',async t=>{
 const {host,root}=await fixture(t);
 await fs.appendFile(root+'/codex/sessions/'+id+'.jsonl',[
  {type:'response_item',payload:{type:'function_call',call_id:'private-fixture',name:'exec_command',arguments:JSON.stringify({command:'SYNTHETIC_TOOL_ARGUMENTS'})}},
  {type:'response_item',payload:{type:'function_call_output',call_id:'private-fixture',output:'SYNTHETIC_TOOL_OUTPUT'}}
 ].map(e=>JSON.stringify(e)+'\n').join(''));
 await host.request('sessionAccess',{sessionId:id,decision:'allow-codex',...scope(host)});
 const main=await host.request('snapshot');assert.match(JSON.stringify(main),/SYNTHETIC_TOOL_ARGUMENTS/);
 const selected=await host.request('selectSource',{mode:'local',id,...scope(host)},'monitor');
 assert.equal(selected.task.events,undefined);assert.equal(selected.evidence,undefined);assert.doesNotMatch(JSON.stringify(selected),/SYNTHETIC_TOOL_ARGUMENTS|SYNTHETIC_TOOL_OUTPUT/);
 assert.equal(selected.task.title,'SYNTHETIC_DESKTOP_PRIVATE');let wire;
 host.sendResponse(selected,text=>wire=text);assert.doesNotMatch(wire,/SYNTHETIC_TOOL_ARGUMENTS|SYNTHETIC_TOOL_OUTPUT/);
 await host.request('sessionAccess',{sessionId:id,decision:'revoke',...scope(host)});let sends=0;assert.throws(()=>host.sendResponse(selected,()=>sends++));assert.equal(sends,0);
 let reads=0;const open=host.service.gateway.openLog.bind(host.service.gateway);host.service.gateway.openLog=(...args)=>{reads++;return open(...args);};
 const denied=await host.request('selectSource',{mode:'local',id,...scope(host)},'monitor');assert.equal(reads,0);assert.equal(denied.task.title,'');
});
test('floating projection shares authority, avoids denied reads and invalidates late data for every window',async t=>{
 const {host}=await fixture(t);let reads=0;const entry=host.service.gateway.openLog.bind(host.service.gateway);host.service.gateway.openLog=(...a)=>{reads++;return entry(...a);};
 const denied=await host.request('monitor');assert.equal(denied.task.title,'');assert.equal(reads,0,'projection never opens a denied body');
 await host.request('sessionAccess',{sessionId:id,decision:'allow-codex',...scope(host)});
 const m=await host.request('monitor');assert.equal(m.task.title,'SYNTHETIC_DESKTOP_PRIVATE');assert.equal(m.evidence,undefined);assert.equal(m.task.events,undefined);
 const main=[],floating=[];host.subscribe('main-shared',scope(host),x=>main.push(x));host.subscribe('float-shared',scope(host),x=>floating.push(x),'monitor');
 assert.match(floating[0].data,/SYNTHETIC_DESKTOP_PRIVATE/);
 await host.request('sessionAccess',{sessionId:id,decision:'revoke',...scope(host)});assert.equal(main.at(-1).type,'invalidate');assert.equal(floating.at(-1).type,'invalidate');
 const afterReads=reads;assert.equal((await host.request('monitor')).task.title,'');assert.equal(reads,afterReads,'revoked monitor does not read a body');
 await host.request('sessionAccess',{sessionId:id,decision:'allow-codex',...scope(host)});let sends=0;assert.throws(()=>host.sendResponse(m,()=>sends++));assert.equal(sends,0,'old projected grant cannot be restored');
 assert.equal(floating.filter(x=>x.type==='snapshot').length,1,'revoked subscription has no replay');
});
test('desktop IPC input rejects arbitrary methods, unknown fields and missing mutation scope', () => {
  assert.throws(() => validateDesktopInput('exec', { command: 'anything' }));
  assert.throws(() => validateDesktopInput('snapshot', { path: 'private' }));
  assert.throws(() => validateDesktopInput('sessionAccess', { sessionId: id, decision: 'allow-codex' }));
  assert.doesNotThrow(()=>validateDesktopInput('selectSource',{mode:'work-hooks',endpoint:null,authorityInstanceId:'synthetic',expectedPolicyRevision:1,selectionRevision:1}));
});
test('desktop authority precedes body reads; stale requests and old subscription outputs are rejected', async t => {
  const { host } = await fixture(t);
  assert.equal((await host.request('snapshot', {})).task.title, '');
  await host.request('sessionAccess', { sessionId: id, decision: 'allow-codex', ...scope(host) });
  const events = [], oldScope = scope(host); host.subscribe('old', oldScope, frame => events.push(frame));
  assert.match(JSON.stringify(await host.request('snapshot', {})), /SYNTHETIC_DESKTOP_PRIVATE/);
  await host.request('sessionAccess', { sessionId: id, decision: 'revoke', ...scope(host) });
  const count = events.length;
  await host.request('sessionAccess', { sessionId: id, decision: 'allow-codex', ...scope(host) }); await host.tick();
  assert.equal(events.length, count, 'Invalidated subscriptions never receive regranted content');
  await assert.rejects(host.request('sessionAccess', { sessionId: id, decision: 'allow-codex', ...oldScope }), /scope|stale/i);
});
test('pause and restart clear content and create a fresh authority instance', async t => {
  const { host } = await fixture(t), first = host.service.access.instanceId;
  await host.pause(); assert.equal(host.state, 'paused'); await assert.rejects(host.request('snapshot', {}));
  await host.start(); assert.notEqual(host.service.access.instanceId, first); assert.equal((await host.request('snapshot', {})).task.title, '');
});
test('restore never substitutes another session or re-enables revoked Work observation',async t=>{
  const {host,root}=await fixture(t);
  await host.pause();host.options.initialSelection={id:'11111111-1111-4111-8111-111111111111'};await host.start();
  const snapshot=await host.request('snapshot');assert.equal(snapshot.task.id,host.options.initialSelection.id);assert.equal(snapshot.task.title,'');assert.equal(snapshot.source.connected,false);
  const restoredId=host.options.initialSelection.id;
  await fs.writeFile(root+'/codex/sessions/'+restoredId+'.jsonl',JSON.stringify({type:'session_meta',payload:{id:restoredId}})+'\n'+JSON.stringify({type:'event_msg',payload:{type:'user_message',message:'SYNTHETIC_RETURNED_TASK'}})+'\n');
  let bodyEntries=0;const entry=host.service.gateway.openLog.bind(host.service.gateway);host.service.gateway.openLog=(...args)=>{bodyEntries++;return entry(...args);};
  assert.equal((await host.request('snapshot')).task.title,'','Reappearance alone never grants content');assert.equal(host.service.source.file,path.join(root,'codex','sessions',restoredId+'.jsonl'));assert.equal(bodyEntries,0,'Unknown returned session does not call the body entry');await host.request('sessionAccess',{sessionId:restoredId,decision:'allow-codex',...scope(host)});assert.equal((await host.request('snapshot')).task.title,'SYNTHETIC_RETURNED_TASK');assert.ok(bodyEntries>0);
  await host.request('selectSource',{mode:'work-hooks',...scope(host)});
  await host.request('sessionAccess',{sessionRef:{backend:host.service.hookBackend,id:'scope'},decision:'revoke-observation',...scope(host)});
  await host.pause();host.options.mode='work-hooks';host.options.initialSelection={};await host.start();
  assert.equal(host.service.access.can({backend:host.service.hookBackend,id:'scope'},'observe'),false);
  await fs.mkdir(root+'/events',{recursive:true});await fs.writeFile(root+'/events/1-00000000-0000-4000-8000-000000000001.json',JSON.stringify({event_type:'UserPromptSubmit',session_id:'synthetic',turn_id:null,timestamp:new Date().toISOString()}));
  assert.equal((await host.request('snapshot')).task.events.length,0);
});
test('unavailable restored RPC starts a disconnected desktop and retains recoverable controls',async t=>{
  const {host}=await fixture(t);await host.pause();host.options.mode='app-server';host.options.initialSelection={endpoint:'ws://127.0.0.1:9/'};
  await host.start();const snapshot=await host.request('snapshot');assert.equal(host.state,'running');assert.equal(snapshot.source.connected,false);assert.deepEqual(snapshot.sessions,[]);assert.equal(snapshot.progress.overall.percent,null);
});
test('final native IPC send rejects old response lineage after revoke/regrant and restart', async t => {
  const {host}=await fixture(t);await host.request('sessionAccess',{sessionId:id,decision:'allow-codex',...scope(host)});
  const old=await host.request('snapshot',{});let sends=0;
  await host.request('sessionAccess',{sessionId:id,decision:'revoke',...scope(host)});await host.request('sessionAccess',{sessionId:id,decision:'allow-codex',...scope(host)});
  assert.throws(()=>host.sendResponse(old,()=>sends++));assert.equal(sends,0);
  const next=await host.request('snapshot',{});host.sendResponse(next,()=>sends++);assert.equal(sends,1);
  await host.pause();await host.start();assert.throws(()=>host.sendResponse(next,()=>sends++));assert.throws(()=>host.sendResponse({...next},()=>sends++));assert.equal(sends,1);
});
test('native export rechecks original dependencies after the save dialog and cannot write revoked content', async t => {
  const { host, root } = await fixture(t);
  await host.request('sessionAccess', { sessionId: id, decision: 'allow-codex', ...scope(host) });
  let release, entered; const ready = new Promise(r => { entered = r; }), gate = new Promise(r => { release = r; });
  const target = root + '/report.json', saving = host.exportReport(async () => { entered(); await gate; return target; });
  await ready; await host.request('sessionAccess', { sessionId: id, decision: 'revoke', ...scope(host) }); release();
  await assert.rejects(saving, /stale|scope|revoked/i); await assert.rejects(fs.stat(target), { code: 'ENOENT' });
  await host.request('sessionAccess', { sessionId: id, decision: 'allow-codex', ...scope(host) });
  const result = await host.exportReport(async () => target); assert.equal(result.desktopSaved, true);
  assert.match(await fs.readFile(target, 'utf8'), /SYNTHETIC_DESKTOP_PRIVATE/);
});
