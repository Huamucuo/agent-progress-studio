import test from 'node:test';
import assert from 'node:assert/strict';
import * as status from '../desktop/hook-status.mjs';
import {scanEnvelope} from '../src/adapters/rpc-envelope.mjs';

// Actual official hooks/list metadata observed on 2026-10-14. All cwd,
// handler IDs, command paths, and unrelated plugin rows have been stripped.
const pluginId='agent-progress-studio-desktop@aps-desktop-local';
const officialResponse={data:[{hooks:[
 {eventName:'preToolUse',enabled:true,trustStatus:'trusted',pluginId},
 {eventName:'postToolUse',enabled:true,trustStatus:'trusted',pluginId},
 {eventName:'sessionStart',enabled:true,trustStatus:'trusted',pluginId},
 {eventName:'userPromptSubmit',enabled:true,trustStatus:'trusted',pluginId},
 {eventName:'stop',enabled:true,trustStatus:'trusted',pluginId}
]}]};
const expected=['PreToolUse','PostToolUse','SessionStart','UserPromptSubmit','Stop'];

test('official lowercase HookEventName values become the five canonical observer events',()=>{
 const definitions=status.summarizeHooks(officialResponse);
 assert.deepEqual(definitions.map(h=>h.event),expected);
 assert.equal(definitions.every(h=>h.enabled&&h.trust==='trusted'),true);
});

test('unknown event spellings and unrelated plugins cannot establish trusted definitions',()=>{
 const response={data:[{hooks:[
  {eventName:'PRETOOLUSE',enabled:true,trustStatus:'trusted',pluginId},
  {eventName:'permissionRequest',enabled:true,trustStatus:'trusted',pluginId},
  {eventName:'futureEvent',enabled:true,trustStatus:'trusted',pluginId},
  {eventName:'preToolUse',enabled:true,trustStatus:'trusted',pluginId:'unrelated@local'}
 ]}]};
 assert.deepEqual(status.summarizeHooks(response),[]);
});

test('canonical compatibility aliases preserve exact enabled and trust semantics',()=>{
 const response={data:[{hooks:[
  {eventName:'PreToolUse',enabled:false,trustStatus:'managed',pluginId},
  {eventName:'Stop',enabled:'true',trustStatus:'future',pluginId}
 ]}]};
 assert.deepEqual(status.summarizeHooks(response),[
  {event:'PreToolUse',enabled:false,trust:'managed'},
  {event:'Stop',enabled:false,trust:'unknown'}
 ]);
});

test('wire metadata projection uses the same official enum mapping and drops unknown names',()=>{
 assert.equal(typeof status.summarizeHookWire,'function');
 const response=structuredClone(officialResponse);
 response.data[0].hooks.push({eventName:'futureEvent',enabled:true,trustStatus:'trusted',pluginId});
 const wire=scanEnvelope(JSON.stringify({id:1,result:response}));
 assert.deepEqual(status.summarizeHookWire(wire),status.summarizeHooks(officialResponse));
});
