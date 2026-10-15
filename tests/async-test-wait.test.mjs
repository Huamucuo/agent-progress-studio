import test from 'node:test';
import assert from 'node:assert/strict';
import {waitUntil} from './helpers/wait-until.mjs';
test('native acceptance waits for true IPC result rather than a truthy Promise',async()=>{let calls=0;await waitUntil(async()=>++calls>=3,{interval:1});assert.equal(calls,3);});
test('a perpetually false asynchronous result cannot pass native acceptance',async()=>{await assert.rejects(waitUntil(async()=>false,{timeout:5,interval:1}),/Timed out/);});
