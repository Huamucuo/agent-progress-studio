import test from 'node:test';import assert from 'node:assert/strict';import {WindowRegistry}from '../desktop/ipc-policy.mjs';
const fixture=()=>{const r=new WindowRegistry(),frame={url:'aps://studio/floating.html',origin:'aps://studio'},wc={id:2,mainFrame:frame},win={webContents:wc,isDestroyed:()=>false},event={sender:wc,senderFrame:frame};r.register(win,'floating',frame.url);return {r,win,event};};
test('floating role has no grants, export, paths, installs, arbitrary IPC or full snapshots',()=>{const {r,event}=fixture(),record=r.check(event);for(const op of ['sessionAccess','detail','exportReport','hookInstall','chooseDirectory','snapshot','eval','logs','preference'])assert.throws(()=>r.allow(record,op,{}));for(const op of ['monitor','bootstrap','pause','openMain','floatingControl'])assert.doesNotThrow(()=>r.allow(record,op,{}));assert.throws(()=>r.allow(record,'selectSource',{mode:'local'}));assert.doesNotThrow(()=>r.allow(record,'selectSource',{mode:'local',id:'selected'}));});
test('a subframe, remote URL, foreign sender, stale navigation or recreated window cannot publish',()=>{const {r,event,win}=fixture(),ticket=r.ticket(event);assert.throws(()=>r.check({...event,senderFrame:{...event.senderFrame}}));assert.throws(()=>r.check({...event,sender:{id:2,mainFrame:event.senderFrame}}));r.navigate(win);assert.throws(()=>r.check(event,ticket));const next=r.ticket(event);event.senderFrame.url='https://evil.invalid';assert.throws(()=>r.check(event,next));r.remove(win);assert.throws(()=>r.check(event));});
test('subscription gateway checks window role before invoking a snapshot producer',()=>{
 const {r,event,win}=fixture();let producers=0;
 const open=event=>{const result=r.subscription(event);producers++;return result;};
 assert.equal(open(event).projection,'monitor');assert.equal(producers,1);
 r.remove(win);event.senderFrame.url='aps://studio/notice.html';r.register(win,'notice',event.senderFrame.url);
 assert.throws(()=>open(event),/Notice|capability/i);assert.equal(producers,1);
 r.remove(win);event.senderFrame.url='aps://studio/';r.register(win,'main',event.senderFrame.url);
 assert.equal(open(event).projection,'snapshot');assert.equal(producers,2);
});
