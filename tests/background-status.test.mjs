import test from 'node:test';
import assert from 'node:assert/strict';
import {officialBackground,backgroundProjection} from '../desktop/background-status.mjs';
import {scanEnvelope} from '../src/adapters/rpc-envelope.mjs';
const id='abcdef12-abcd-4abc-8abc-abcdef123456',ref={backend:'rpc:fixture',id};
const envelope=result=>scanEnvelope(JSON.stringify({result,id:41}));

test('denied background observation performs no RPC read or connection',async()=>{
 let calls=0;const s={mode:'app-server',source:{experimentalApi:true,request(){calls++;}}};
 await assert.rejects(officialBackground({s,ref,check:()=>{throw Error('revoked');}}),/revoked/);
 assert.equal(calls,0);
});
test('missing experimental capability and Work metadata do not probe private thread status',async()=>{
 let calls=0;const source={experimentalApi:false,request(){calls++;}};
 assert.equal((await officialBackground({s:{mode:'app-server',source},ref,check:()=>{}})).supported,false);
 assert.equal((await officialBackground({s:{mode:'work-hooks',source},ref,check:()=>{}})).reason,'UNSUPPORTED_WORK_BACKGROUND_STATUS');
 assert.equal(calls,0);
});
test('authorized idle/background count projection accepts reordered public JSON and exports no terminal bodies',async()=>{
 const calls=[],s={mode:'app-server',source:{experimentalApi:true,async request(method,params,project){calls.push({method,params});return project(envelope(method==='thread/read'?{thread:{status:{type:'idle'},id}}:{nextCursor:null,data:[{command:'SYNTHETIC_PRIVATE_COMMAND',output:'SYNTHETIC_PRIVATE_OUTPUT'}]}));}}};
 const result=await officialBackground({s,ref,check:()=>{}});
 assert.deepEqual(result,{supported:true,idle:true,count:1,reason:null});assert.doesNotMatch(JSON.stringify(result),/PRIVATE/);
 assert.deepEqual(calls.map(c=>c.method),['thread/read','thread/backgroundTerminals/list']);assert.equal(calls[0].params.includeTurns,false);
});
test('revocation during thread status response prevents the subsequent terminal query',async()=>{
 let valid=true,calls=0;const s={mode:'app-server',source:{experimentalApi:true,async request(){calls++;valid=false;return {id,idle:true};}}};
 await assert.rejects(officialBackground({s,ref,check:()=>{if(!valid)throw Error('old generation');}}),/old generation/);assert.equal(calls,1);
});
test('late terminal response after revocation cannot return a completion proof',async()=>{
 let valid=true,calls=0;const s={mode:'app-server',source:{experimentalApi:true,async request(){calls++;if(calls===1)return {id,idle:true};valid=false;return {count:0};}}};
 await assert.rejects(officialBackground({s,ref,check:()=>{if(!valid)throw Error('old generation');}}),/old generation/);assert.equal(calls,2);
});
test('partial or unexpected background schema never counts as zero running jobs',()=>{
 assert.deepEqual(backgroundProjection(envelope({data:[],nextCursor:'remaining'})),{count:null});
 assert.throws(()=>backgroundProjection(envelope({data:[],nextCursor:null,hidden:'SYNTHETIC_PRIVATE'})),/Unknown/);
 assert.throws(()=>backgroundProjection(envelope({data:null,nextCursor:null})),/Unknown/);
});
