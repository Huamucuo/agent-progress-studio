import test from 'node:test';import assert from 'node:assert/strict';
import {SessionAccess,sessionRef}from '../src/core/session-access.mjs';
import {Publication}from '../src/core/publication.mjs';import {DesktopHost}from '../desktop/host.mjs';
const id='abcdef12-abcd-4abc-8abc-abcdef123456';
test('pet current/cache/output/regrant retains original permits while stripping private transport identifiers',async()=>{
 const access=new SessionAccess(),ref=sessionRef('local:C:/PRIVATE_BACKEND',id);await access.change(ref,{origin:'codex',content:true},0);
 const publication=new Publication(access,()=>0),permit=access.issue(ref,'content');let reads=0;
 const value=publication.seal({source:{mode:'local',origin:'codex',connected:true,contentAccess:{readable:true}},task:{id,title:'PRIVATE_TITLE',events:[{text:'PRIVATE_BODY'}],cwd:'PRIVATE_PATH'},monitor:{status:'tool_running',fresh:true},progress:{plan:{total:1,completed:0}},acceptance:{met:0}},{permits:[permit],ref});
 const s={access,publication,snapshot:value,selectionRevision:0,closed:false,refresh(){reads++;throw Error('Pet must use existing state');}};
 const host=new DesktopHost({interval:0});host.service=s;host.state='running';
 const result=await host.request('petState',{},'pet');assert.equal(reads,0);assert.equal(result.petState.animation,'working');assert.equal(result.access.sessionRef,null);assert.deepEqual(result.access.dependencies,[]);
 assert.doesNotMatch(JSON.stringify(result),/PRIVATE_|abcdef12|conversation/);
 const out=[];host.subscribe('pet-safe',{authorityInstanceId:access.instanceId,expectedPolicyRevision:access.revision,selectionRevision:0},f=>out.push(f),'pet');assert.equal(out.length,1);assert.doesNotMatch(out[0].data,/PRIVATE_|abcdef12/);
 await access.change(ref,{content:false},access.revision);host.invalidate();let publications=0;assert.throws(()=>host.sendResponse(result,()=>publications++));assert.equal(publications,0);
 await access.change(ref,{content:true},access.revision);assert.throws(()=>host.sendResponse(result,()=>publications++));assert.equal(publications,0);assert.throws(()=>host.subscribe('old-bootstrap',{authorityInstanceId:access.instanceId,expectedPolicyRevision:1,selectionRevision:0},()=>{},'pet'));
 assert.equal(reads,0);host.state='paused';await access.close();
});
test('Work pet reads authorized observed metadata without acquiring or invoking a body reader',async()=>{
 const access=new SessionAccess(),ref=sessionRef('hooks:C:/PRIVATE_EVENTS','scope');await access.change(ref,{observe:true},0);const publication=new Publication(access,()=>0),permit=access.issue(ref,'observe');let bodyReads=0;
 const value=publication.seal({source:{mode:'work-hooks',origin:'work-local',connected:true},task:{id,title:'PRIVATE_WORK'},monitor:{status:'tool_running',fresh:true}},{permits:[permit],ref});
 const s={access,publication,snapshot:value,selectionRevision:0,closed:false,refresh(){bodyReads++;throw Error('Unexpected reader');}};const host=new DesktopHost({interval:0});host.service=s;host.state='running';
 const result=await host.request('petState',{},'pet');assert.equal(result.petState.animation,'working');assert.equal(bodyReads,0);assert.doesNotMatch(JSON.stringify(result),/PRIVATE_|abcdef12/);
 await access.change(ref,{observe:false},access.revision);let emits=0;assert.throws(()=>host.sendResponse(result,()=>emits++));assert.equal(emits,0);assert.equal(bodyReads,0);host.state='paused';await access.close();
});
