import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter}from 'node:events';
const module=await import('../desktop/local-rpc.mjs').catch(()=>null);
function child(){const c=new EventEmitter();c.stdout=new EventEmitter();c.stdin=new EventEmitter();c.writes=[];c.stdin.write=s=>{c.writes.push(JSON.parse(s));};c.stdin.end=()=>{};c.kill=()=>{c.killed=true;};return c;}
test('local RPC uses structure/request ID, ignores unsolicited bodies and preserves argument privacy',async()=>{
 assert.ok(module,'controlled local RPC module required');const c=child();let args,options;
 const r=new module.LocalRpc({executable:'C:/official/codex.exe',codexHome:'C:/approved/home',spawn:(f,a,o)=>{args=a;options=o;return c;},check:()=>{},timeoutMs:100});r.open();
 const p=r.request('thread/loaded/list',{limit:10},wire=>wire.at('result','data').values.map(n=>wire.scalar(n)));
 c.stdout.emit('data',Buffer.from('{"method":"item/reasoning/textDelta","params":{"delta":"SYNTHETIC_PRIVATE"}}\n'));
 c.stdout.emit('data',Buffer.from(JSON.stringify({result:{data:['known'],nextCursor:null},id:c.writes[0].id})+'\n'));
 assert.deepEqual(await p,['known']);assert.deepEqual(args,['app-server','proxy']);assert.equal(options.shell,false);assert.equal(options.env.CODEX_HOME,'C:/approved/home');assert.doesNotMatch(JSON.stringify(args),/PRIVATE/);r.close();assert.equal(c.killed,true);
});
test('scope revoked before reply response prevents result projection and cannot be renewed by reconnect',async()=>{
 assert.ok(module);const c=child();let allowed=true,parsed=0;const r=new module.LocalRpc({executable:'C:/official/codex.exe',spawn:()=>c,check:()=>{if(!allowed)throw Error('revoked');},timeoutMs:100});r.open();
 const p=r.request('turn/start',{threadId:'known',input:[{type:'text',text:'SYNTHETIC_USER_MESSAGE'}]},()=>{parsed++;return 'accepted';});allowed=false;c.stdout.emit('data',Buffer.from(JSON.stringify({id:c.writes[0].id,result:{turn:{id:'turn-new'}}})+'\n'));
 await assert.rejects(p,/revoked/);assert.equal(parsed,0);assert.throws(()=>r.open(),/revoked/);r.close();
});
test('unsupported method, duplicate fields and timeouts do not send retries or leak error content',async()=>{
 assert.ok(module);const c=child(),r=new module.LocalRpc({executable:'C:/official/codex.exe',spawn:()=>c,check:()=>{},timeoutMs:20});r.open();await assert.rejects(r.request('thread/resume',{},()=>{}),/denied/);assert.equal(c.writes.length,0);
 const p=r.request('turn/steer',{},()=>{});await assert.rejects(p,/timeout/);assert.equal(c.writes.length,1);r.close();
});
