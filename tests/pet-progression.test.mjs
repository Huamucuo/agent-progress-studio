import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, link, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { PetProgression } from '../src/pet/progression.mjs';
import { PET_CHARACTERS, PET_ITEMS } from '../src/pet/catalog.mjs';

const at = Date.now();
const live = (id = 'turn-1', extra = {}) => ({ kind:'live-turn-activity', canonicalSessionKey:'confirmed:session-private', turnId:id, at:new Date(at).toISOString(), origin:'codex', live:true, demo:false, ...extra });
const criterion = (id = 'criterion-1', extra = {}) => live(undefined, {kind:'criterion-auto-verified', criterionId:id, definitionKey:'task-definition', evidenceCurrent:true, implemented:true, automated:true, checksRequired:true, requiresHuman:false, ...extra});
const valid = {validate:() => true};
async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'aps-pet-test-'));
  const pet = new PetProgression(directory, {now:() => at}); await pet.init();
  t.after(async () => { await pet.close(); await rm(directory, {recursive:true, force:true}); });
  return {pet, directory};
}

test('free characters and five usable shop slots have stable IDs', () => {
  assert.deepEqual(PET_CHARACTERS.map(c => c.id), ['aps-dog','aps-cat','aps-capybara','aps-outline-dog']);
  assert.deepEqual(PET_ITEMS.map(i => [i.id,i.slot]), [['hat','hat'],['scarf','scarf'],['wave','action'],['mat','background'],['dog-copper','skin']]);
  assert.ok(PET_ITEMS.every(i => Number.isSafeInteger(i.price) && i.price > 0));
});
test('concurrent repeated activity is once across restart and sanitized on disk', async t => {
  const {pet,directory} = await fixture(t);
  await Promise.all(Array.from({length:10}, () => pet.consume(live(),valid)));
  assert.equal(pet.snapshot().totalXp,1);
  const text = await readFile(path.join(directory,'pet-progress.json'),'utf8');
  assert.equal(text.includes('session-private'),false); assert.equal(text.includes('turn-1'),false);
  await pet.close(); const reopened = new PetProgression(directory,{now:() => at}); await reopened.init();
  await reopened.consume(live(),valid); assert.equal(reopened.snapshot().totalXp,1); await reopened.close();
});
test('nonlive, history, unknown, demo, stale and unvalidated facts never pay', async t => {
  const {pet} = await fixture(t);
  for (const extra of [{live:false},{demo:true},{origin:'bootstrap'},{origin:'replay'},{origin:'unknown'},{canonicalSessionKey:''},{turnId:''},{at:new Date(at-30001).toISOString()},{at:new Date(at+3000).toISOString()}]) await pet.consume(live('bad',extra),valid);
  await pet.consume(live()); await pet.consume(live(),{validate:() => false});
  assert.equal(pet.snapshot().totalXp,0);
});
test('revocation at any awaited persistence boundary discards staged grant', async t => {
  const {pet} = await fixture(t);
  for (let limit=1;limit<=7;limit++) { let checks=0; await pet.consume(live('revoked-'+limit),{validate:() => ++checks < limit}); }
  assert.equal(pet.snapshot().totalXp,0);
  await pet.consume(live('revoked-6'),valid); assert.equal(pet.snapshot().totalXp,1);
});
test('live activity daily XP cap is eight and acceptance pays disjoint once', async t => {
  const {pet} = await fixture(t);
  for(let i=0;i<12;i++) await pet.consume(live('turn-'+i),valid);
  assert.equal(pet.snapshot().totalXp,8);
  await pet.consume(criterion(),valid); assert.equal(pet.snapshot().coins,2);
  await pet.consume(criterion(undefined,{fingerprint:'new-evidence', ruleVersion:99}),valid);
  await pet.consume(criterion(undefined,{kind:'criterion-human-accepted',requiresHuman:true,humanAccepted:true}),valid);
  assert.equal(pet.snapshot().totalXp,13); assert.equal(pet.snapshot().coins,2);
  await pet.consume(criterion('human',{requiresHuman:true}),valid); assert.equal(pet.snapshot().coins,2);
  await pet.consume(criterion('human',{kind:'criterion-human-accepted',requiresHuman:true,humanAccepted:true}),valid);
  assert.equal(pet.snapshot().totalXp,21); assert.equal(pet.snapshot().coins,5);
  assert.deepEqual([pet.snapshot().level,pet.snapshot().xp,pet.snapshot().nextLevelXp],[2,1,30]);
});
test('criteria require current evidence and explicit applicable acceptance', async t => {
  const {pet} = await fixture(t);
  for(const extra of [{evidenceCurrent:false},{automated:false},{definitionKey:''},{criterionId:''},{requiresHuman:true},{kind:'criterion-human-accepted',requiresHuman:false,humanAccepted:true},{kind:'criterion-human-accepted',requiresHuman:true,humanAccepted:false}]) await pet.consume(criterion('bad',extra),valid);
  assert.equal(pet.snapshot().totalXp,0);
});
test('test-only automatic criteria and implementation-only human criteria are eligible', async t => {
  const {pet}=await fixture(t);
  await pet.consume(criterion('tests-only',{implemented:false}),valid);
  await pet.consume(criterion('human-no-tests',{kind:'criterion-human-accepted',requiresHuman:true,humanAccepted:true,checksRequired:false,automated:false}),valid);
  assert.equal(pet.snapshot().totalXp,13);
  await pet.consume(criterion('human-tests-needed',{kind:'criterion-human-accepted',requiresHuman:true,humanAccepted:true,checksRequired:true,automated:false}),valid);
  assert.equal(pet.snapshot().totalXp,13);
});
test('purchase, repeat purchase, equip and unequip persist without overspending', async t => {
  const {pet,directory} = await fixture(t);
  await assert.rejects(pet.purchase('hat'), /balance/i);
  await assert.rejects(pet.purchase('../other'), /item/i);
  await assert.rejects(pet.equip('hat','hat'), /owned/i);
  for(let i=0;i<20;i++) await pet.consume(criterion('buy-'+i),valid);
  const price=PET_ITEMS.find(i => i.id==='hat').price;
  await Promise.all([pet.purchase('hat'),pet.purchase('hat')]); assert.equal(pet.snapshot().coins,40-price);
  await pet.equip('hat','hat'); await assert.rejects(pet.equip('skin','hat'), /slot/i);
  await pet.close(); const reopened = new PetProgression(directory,{now:() => at}); await reopened.init();
  assert.equal(reopened.snapshot().equipped.hat,'hat'); await reopened.equip('hat',null);
  assert.equal(reopened.snapshot().equipped.hat,null); await reopened.close();
});
test('corrupt storage and hard-link replacement fail closed', async t => {
  const {pet,directory} = await fixture(t); await pet.close();
  await writeFile(path.join(directory,'pet-progress.json'),'{}');
  const corrupt=new PetProgression(directory); await assert.rejects(corrupt.init(), /storage/i); await corrupt.close();
  await rm(path.join(directory,'pet-progress.json')); const fresh=new PetProgression(directory,{now:() => at}); await fresh.init();
  await link(path.join(directory,'pet-progress.json'),path.join(directory,'alias.json'));
  await assert.rejects(fresh.consume(live(),valid), /identity|alias/i); assert.equal(fresh.snapshot().totalXp,0); await fresh.close();
});
test('disk staging failure leaves wallet and dedup unchanged', async t => {
  const {pet,directory}=await fixture(t); const file=path.join(directory,'pet-progress.json');
  await rm(file); await mkdir(file);
  await assert.rejects(pet.consume(live(),valid)); assert.equal(pet.snapshot().totalXp,0);
});
test('rename failure after fsync discards pending wallet and can retry', async t => {
  const {pet,directory}=await fixture(t);
  const fail=t.mock.method(fs,'renameSync',()=>{throw Error('Injected disk rename failure');});
  await assert.rejects(pet.consume(live(),valid), /disk rename failure/);
  assert.equal(pet.snapshot().totalXp,0);
  const saved=JSON.parse(await readFile(path.join(directory,'pet-progress.json'),'utf8'));
  assert.equal(saved.totalXp,0);assert.equal(saved.keys.length,0);fail.mock.restore();
  await pet.consume(live(),valid);assert.equal(pet.snapshot().totalXp,1);
});
test('criterion dedup survives a rule-version change and session/source switch', async t => {
  const {pet,directory}=await fixture(t);await pet.consume(criterion(),valid);await pet.close();
  const file=path.join(directory,'pet-progress.json'),saved=JSON.parse(await readFile(file,'utf8'));saved.rulesVersion=2;await writeFile(file,JSON.stringify(saved));
  const reopened=new PetProgression(directory,{now:()=>at});await reopened.init();
  await reopened.consume(criterion(undefined,{origin:'work-local',canonicalSessionKey:'other-confirmed-session',fingerprint:'changed',authorityGeneration:8}),valid);
  assert.equal(reopened.snapshot().totalXp,5);assert.equal(reopened.snapshot().coins,2);await reopened.close();
});
test('record history is bounded but payout key capacity never evicts paid keys', async t => {
  const {pet,directory}=await fixture(t);
  for(let i=0;i<66;i++)await pet.consume(criterion('bounded-'+i),valid);
  assert.equal(pet.snapshot().records.length,64);await pet.close();
  const file=path.join(directory,'pet-progress.json'),saved=JSON.parse(await readFile(file,'utf8'));
  saved.keys=Array.from({length:20000},(_,i)=>i.toString(16).padStart(64,'0'));await writeFile(file,JSON.stringify(saved));
  const reopened=new PetProgression(directory,{now:()=>at});await reopened.init();
  assert.equal((await reopened.consume(criterion('capacity'),valid)).reason,'dedup-capacity');assert.equal(reopened.snapshot().coins,132);await reopened.close();
});
test('crashed pending and committed transactions recover a consistent ledger', async t => {
  const {pet,directory}=await fixture(t); await pet.close();
  const moduleUrl=new URL('../src/pet/progression.mjs',import.meta.url).href;
  for(const committed of [false,true]) {
    const childDirectory=path.join(directory,committed?'committed':'pending');
    const script=`import {PetProgression} from ${JSON.stringify(moduleUrl)}; const p=new PetProgression(${JSON.stringify(childDirectory)},{now:()=>${at}}); await p.init(); let n=0; await p.consume(${JSON.stringify(live('crash'))},{validate:()=>{ if(!${committed} && ++n===6) process.exit(19); return true; }}); process.exit(20);`;
    const child=spawnSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8'});
    assert.equal(child.status,committed?20:19,child.stderr);
    const reopened=new PetProgression(childDirectory,{now:() => at}); await reopened.init();
    assert.equal(reopened.snapshot().totalXp,committed?1:0);
    await reopened.consume(live('crash'),valid); assert.equal(reopened.snapshot().totalXp,1);
    await reopened.close();
  }
});
test('startup lease crashes before PID write and on either side of link cleanup preserve wallet', async t => {
  const {pet,directory}=await fixture(t);await pet.consume(criterion(),valid);await pet.close();
  const file=path.join(directory,'pet-progress.json'),original=await readFile(file,'utf8');
  const moduleUrl=new URL('../src/pet/progression.mjs',import.meta.url).href;
  for(const boundary of ['write','link','unlink']) {
    const script=`import fs from 'node:fs'; import {PetProgression} from ${JSON.stringify(moduleUrl)};
      const boundary=${JSON.stringify(boundary)};
      if(boundary==='write'){const original=fs.writeFileSync;fs.writeFileSync=function(...args){if(typeof args[0]==='number')process.exit(73);return original.apply(this,args);};}
      if(boundary==='link'){const original=fs.linkSync;fs.linkSync=function(...args){const result=original.apply(this,args);if(String(args[1]).endsWith('pet-progress.lock'))process.exit(73);return result;};}
      if(boundary==='unlink'){const original=fs.unlinkSync;fs.unlinkSync=function(...args){const result=original.apply(this,args);if(String(args[0]).includes('.lease-'))process.exit(73);return result;};}
      const p=new PetProgression(${JSON.stringify(directory)});await p.init();process.exit(74);`;
    const child=spawnSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8'});
    assert.equal(child.status,73,child.stderr);
    const reopened=new PetProgression(directory,{now:()=>at});await reopened.init();
    assert.equal(reopened.snapshot().coins,2);assert.equal(reopened.snapshot().totalXp,5);
    await reopened.consume(criterion(),valid);assert.equal(reopened.snapshot().totalXp,5);
    assert.equal(await readFile(file,'utf8'),original);await reopened.close();
  }
});
test('simultaneously alive wallet instances cannot acquire the same lease', async t => {
  const {pet,directory}=await fixture(t);await pet.consume(criterion(),valid);
  const other=new PetProgression(directory,{now:()=>at});await assert.rejects(other.init(), /already open/);
  const moduleUrl=new URL('../src/pet/progression.mjs',import.meta.url).href;
  const script=`import {PetProgression} from ${JSON.stringify(moduleUrl)};const p=new PetProgression(${JSON.stringify(directory)});try{await p.init();process.exit(80);}catch(e){if(!e.message.includes('already open'))throw e;process.exit(81);}`;
  const child=spawnSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8'});assert.equal(child.status,81,child.stderr);
  assert.equal(pet.snapshot().coins,2);await pet.consume(criterion(),valid);assert.equal(pet.snapshot().coins,2);await other.close();
});
test('ambiguous corrupt fixed lease is retained for inspection without resetting wallet', async t => {
  const {pet,directory}=await fixture(t);await pet.consume(criterion(),valid);await pet.close();
  const wallet=path.join(directory,'pet-progress.json'),original=await readFile(wallet,'utf8'),lock=path.join(directory,'pet-progress.lock');
  for(const invalid of ['', '{}', 'null']) {
    await writeFile(lock,invalid);const reopened=new PetProgression(directory);
    await assert.rejects(reopened.init(), /inspection/);assert.equal(await readFile(lock,'utf8'),invalid);
    assert.equal(await readFile(wallet,'utf8'),original);await reopened.close();await rm(lock);
  }
});
