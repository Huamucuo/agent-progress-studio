import {setTimeout as delay} from 'node:timers/promises';

// Playwright 1.56's waitForFunction tests the immediate return value, so an
// async predicate's Promise is truthy even if it eventually resolves false.
// Poll IPC promises from the test process, awaiting each actual boolean.
export async function waitUntil(predicate,{timeout=10000,interval=40}={}){
 const deadline=performance.now()+timeout;
 for(;;){if(await predicate())return;if(performance.now()>=deadline)throw Error('Timed out waiting for asynchronous test condition');await delay(interval);}
}
