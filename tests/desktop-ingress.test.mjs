import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createConnection } from 'node:net';
import { SessionAccess, sessionRef } from '../src/core/session-access.mjs';
import { HookIngress } from '../desktop/hook-ingress.mjs';
import { writeMarker } from '../desktop/recorder.mjs';
import { runRecorder } from '../desktop/recorder.mjs';
import { Readable } from 'node:stream';
const send=(pipe,data)=>new Promise((resolve,reject)=>{const socket=createConnection(pipe);socket.once('error',reject);socket.once('connect',()=>socket.write(JSON.stringify(data)+'\n'));socket.once('data',chunk=>{socket.destroy();resolve(JSON.parse(chunk.toString()));});});
test('named-pipe Hook ingress requires secret and live original generation; close/regrant cannot renew it',async t=>{
  const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'aps-ingress-'))),access=new SessionAccess(),ref=sessionRef('hooks:'+root.toLowerCase(),'scope');
  await access.change(ref,{observe:true},access.revision);const permit=access.issue(ref,'observe'),ingress=await new HookIngress(root,access,permit).start();
  t.after(async()=>{ingress.close();await fs.rm(root,{recursive:true,force:true});});
  await writeMarker(root,{schema:1,enabled:true,instance:access.instanceId,generation:permit.dependency.generation,expiresAt:Date.now()+15000,pipe:ingress.pipe,token:ingress.token});
  const event={event_type:'Stop',session_id:'synthetic',turn_id:'turn',timestamp:new Date().toISOString()};
  assert.equal((await send(ingress.pipe,{token:'wrong',event})).ok,false);assert.equal((await fs.readdir(root)).filter(x=>/^\d/.test(x)).length,0);
  for(const invalid of [{...event,event_type:'PrivateEvent'},{...event,session_id:'invalid/id'},{...event,timestamp:'invalid'},{...event,tool_name:'unexpected',tool_status:'started'}]) {
    assert.equal((await send(ingress.pipe,{token:ingress.token,event:invalid})).ok,false);
    assert.equal((await fs.readdir(root)).filter(x=>/^\d/.test(x)).length,0,'Malformed metadata cannot reach persistence');
  }
  assert.equal((await send(ingress.pipe,{token:ingress.token,event})).ok,true);assert.equal((await fs.readdir(root)).filter(x=>/^\d/.test(x)).length,1);
  let output='';await runRecorder(root,Readable.from([Buffer.from(JSON.stringify({hook_event_name:'UserPromptSubmit',session_id:'synthetic-stdin',turn_id:null}))]),{write:x=>output+=x});assert.equal(output,'{}');assert.equal((await fs.readdir(root)).filter(x=>/^\d/.test(x)).length,2);
  await access.change(ref,{observe:false},access.revision);await access.change(ref,{observe:true},access.revision);
  assert.equal((await send(ingress.pipe,{token:ingress.token,event})).ok,false);assert.equal((await fs.readdir(root)).filter(x=>/^\d/.test(x)).length,2);
  ingress.close();await assert.rejects(send(ingress.pipe,{token:ingress.token,event}));
});
