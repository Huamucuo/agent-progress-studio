import test from 'node:test';
import assert from 'node:assert/strict';
import {SessionAccess,sessionRef} from '../src/core/session-access.mjs';
const id='abcdef12-abcd-4abc-8abc-abcdef123456',ref=sessionRef('local:synthetic',id);
const change=(a,v)=>a.change(ref,v,a.revision);
test('reply is a separate default-deny capability and never follows content consent implicitly',async()=>{
 const a=new SessionAccess();assert.equal(a.can(ref,'reply'),false);
 await change(a,{origin:'codex',content:true});assert.equal(a.can(ref,'reply'),false);
 await change(a,{reply:true});const permit=a.issue(ref,'reply');assert.equal(a.valid(permit),true);
 await change(a,{reply:false});await change(a,{reply:true});assert.equal(a.valid(permit),false);
});
test('content revocation also revokes reply, and content regrant cannot resurrect it',async()=>{
 const a=new SessionAccess();await change(a,{origin:'codex',content:true,reply:true});const permit=a.issue(ref,'reply');
 const revoke=change(a,{content:false});assert.equal(a.can(ref,'reply'),false,'immediate deny before persistence');await revoke;
 await change(a,{content:true});assert.equal(a.can(ref,'reply'),false);assert.equal(a.valid(permit),false);
});
test('reply refuses unknown, Work, Hook, RPC and denied-content scopes',async()=>{
 for(const backend of ['local:synthetic','hooks:synthetic','rpc:ws://127.0.0.1:4567/']){
  const a=new SessionAccess(),r=sessionRef(backend,id);
  await assert.rejects(a.change(r,{reply:true},a.revision),/confirmed|Codex|content|local/i);
  if(!backend.startsWith('hooks:'))await a.change(r,{origin:'codex',content:true},a.revision);
  if(!backend.startsWith('local:'))await assert.rejects(a.change(r,{reply:true},a.revision));
 }
});
test('persisted reply consent is valid only with confirmed local content; older policy stays read-only',async()=>{
 const a=new SessionAccess();await change(a,{origin:'codex',content:true,reply:true});const saved=a.toJSON();
 assert.equal(new SessionAccess(saved).can(ref,'reply'),true);
 delete saved.entries[JSON.stringify(ref)].reply;assert.equal(new SessionAccess(saved).can(ref,'reply'),false);
 saved.entries[JSON.stringify(ref)].reply={allowed:true,generation:5};saved.entries[JSON.stringify(ref)].content.allowed=false;
 assert.equal(new SessionAccess(saved).can(ref,'reply'),false);
});
