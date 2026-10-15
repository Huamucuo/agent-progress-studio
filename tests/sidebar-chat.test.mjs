import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeRecord,normalizeNotification}from '../src/adapters/normalize.mjs';
import {createState,reduceEvent}from '../src/core/engine.mjs';import {projectMonitor}from '../public/monitor-model.mjs';
const source=()=>({mode:'local',origin:'codex',connected:true,contentAccess:{granted:true,readable:true}});
const snapshot=task=>({source:source(),task,monitor:{status:'waiting_event'},acceptance:{criteria:[]},sessions:[]});
const record=(payload,id)=>normalizeRecord({type:'event_msg',timestamp:'2026-01-01T00:00:00Z',payload},id);
function task(){let s=createState('synthetic-chat');for(const e of [...record({type:'user_message',message:'SYNTHETIC_USER_QUESTION'},'u'),...record({type:'agent_message',message:'SYNTHETIC_PUBLIC_REPLY',phase:'final_answer'},'a')])s=reduceEvent(s,e);return s;}
test('sidebar projects real normalized user/assistant text only within an authorized Codex source',()=>{
 const s=snapshot(task()),m=projectMonitor(s);assert.equal(m.conversation.state,'AVAILABLE');assert.deepEqual(m.conversation.messages.map(m=>[m.role,m.text]),[['user','SYNTHETIC_USER_QUESTION'],['assistant','SYNTHETIC_PUBLIC_REPLY']]);
 assert.equal(m.task.events,undefined);assert.equal(m.evidence,undefined);assert.equal(m.progress.overall.percent,null);
});
test('Work, unknown, missing and revoked body permission cannot project chat even if cached events remain',()=>{
 const s=snapshot(task());for(const variant of [{mode:'work-hooks',origin:'work-local',contentAccess:{granted:true,readable:true}},{mode:'local',origin:'unknown',contentAccess:{granted:true,readable:true}},{mode:'local',origin:'codex',contentAccess:{granted:false,readable:true}},{mode:'local',origin:'codex',contentAccess:{granted:true,readable:false}},{mode:'local',origin:'codex'}]){s.source=variant;const m=projectMonitor(s);assert.deepEqual(m.conversation.messages,[]);assert.doesNotMatch(JSON.stringify(m.conversation),/SYNTHETIC_(?:USER|PUBLIC)/);}
});
test('reasoning, unknown channels, developer/system, tool arguments and outputs never become sidebar messages',()=>{
 for(const payload of [{type:'agent_message',channel:'analysis',message:'SYNTHETIC_HIDDEN'},{type:'agent_message',phase:'analysis',message:'SYNTHETIC_HIDDEN'},{type:'agent_message',channel:'unknown',message:'SYNTHETIC_HIDDEN'},{type:'agent_reasoning',text:'SYNTHETIC_HIDDEN'}])assert.deepEqual(record(payload,'bad'),[]);
 assert.deepEqual(normalizeNotification({method:'item/completed',params:{item:{type:'agentMessage',channel:'analysis',text:'SYNTHETIC_HIDDEN'}}},'rpc-private'),[]);
 let t=task();for(const e of normalizeRecord({type:'response_item',payload:{type:'message',role:'developer',content:[{type:'input_text',text:'SYNTHETIC_SYSTEM'}]}},'system'))t=reduceEvent(t,e);
 for(const e of normalizeRecord({type:'response_item',payload:{type:'function_call_output',call_id:'cmd',output:'SYNTHETIC_TOOL_OUTPUT'}},'out'))t=reduceEvent(t,e);
 const m=projectMonitor(snapshot(t));assert.doesNotMatch(JSON.stringify(m.conversation),/HIDDEN|SYSTEM|TOOL_OUTPUT/);
});
test('chat memory is bounded, plain text and redacted without retaining extra raw fields',()=>{
 let t=createState('synthetic-chat');for(let i=0;i<60;i++)for(const e of record({type:'agent_message',message:'x'.repeat(7000)},'m'+i))t=reduceEvent(t,e);
 const m=projectMonitor(snapshot(t));assert.equal(m.conversation.messages.length,20);assert.ok(m.conversation.messages.every(m=>m.text.length<=2000&&m.truncated));assert.ok(m.conversation.messages.reduce((n,m)=>n+m.text.length,0)<=40000);
 t=createState('synthetic-chat');for(const e of record({type:'agent_message',message:'password=PRIVATE_VALUE api_key: PRIVATE_KEY <img src=x onerror=alert(1)> sk-abcdefghijklmnop'},'s'))t=reduceEvent(t,e);
 const message=projectMonitor(snapshot(t)).conversation.messages[0];assert.doesNotMatch(message.text,/PRIVATE_VALUE|PRIVATE_KEY|abcdefghijklmnop/);assert.match(message.text,/<img/);assert.deepEqual(Object.keys(message).sort(),['at','id','role','text','truncated']);
});
