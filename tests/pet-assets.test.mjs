import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash}from 'node:crypto';

// Genuine atlas content is inspected again in the native pixel/animation tests.
test('four fixed raster atlases have documented hashes, dimensions and six frame strips',async()=>{
 const a=await import('../public/pet-assets.mjs');assert.equal(typeof a.getPetFrame,'function');
 assert.deepEqual(a.PET_ANIMATION_STATES,['idle','working','waiting','happy','failed','sleeping']);
 for(const id of ['aps-dog','aps-cat','aps-capybara','aps-outline-dog']){
  const atlas=a.PET_ATLASES[id],bytes=await fs.readFile(new URL('../public/'+atlas.url,import.meta.url));
  assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10]);assert.equal(bytes.readUInt32BE(16),512);assert.equal(bytes.readUInt32BE(20),768);assert.ok(bytes.length<2*1024*1024,'unchanged evidence read ceiling');
  assert.equal(createHash('sha256').update(bytes).digest('hex'),atlas.sha256);
  for(const state of a.PET_ANIMATION_STATES){const f=a.getPetFrame(id,state,3);assert.ok(f.duration>=100);assert.ok(f.crop.x>=0&&f.crop.x+f.crop.width<=512&&f.crop.y+f.crop.height<=768);}
 }
});
test('frame selection never accepts paths, URLs or executable asset text',async()=>{
 const a=await import('../public/pet-assets.mjs'),base=a.getPetFrame('aps-dog','idle',0);
 assert.deepEqual(a.getPetFrame('<script>','unknown',NaN),base);assert.deepEqual(a.getPetFrame('https://bad','idle',0),base);
 assert.deepEqual(a.getPetFrame('aps-dog','idle',-1),a.getPetFrame('aps-dog','idle',3));assert.equal(a.getPetFrame('aps-cat','sleeping',0).crop.y,640);
});
test('pixel alpha normalization discards background noise and disconnected neighbor fragments without mutating input',async()=>{
 const a=await import('../public/pet-assets.mjs');assert.equal(typeof a.preparePetPixels,'function');const data=new Uint8ClampedArray(16*16*4);
 const pixel=(x,y,alpha)=>{const p=(y*16+x)*4;data[p]=150;data[p+1]=100;data[p+2]=50;data[p+3]=alpha;};
 for(let y=3;y<13;y++)for(let x=4;x<12;x++)pixel(x,y,254);pixel(0,0,1);pixel(15,15,255);const original=data.slice();
 const out=a.preparePetPixels(data,16,16);assert.deepEqual(data,original);assert.equal(out.pixels[3],0);assert.equal(out.pixels[(15*16+15)*4+3],0);assert.equal(out.pixels[(8*16+8)*4+3],255);assert.ok(out.bounds.width>0);assert.ok(out.centerX>=4&&out.centerX<12);
 assert.throws(()=>a.preparePetPixels(new Uint8ClampedArray(0),1024,1024));
});
test('equipment uses the new painted head anchor instead of obsolete fixed SVG coordinates',async()=>{const {petEquipmentAnchor}=await import('../public/pet-assets.mjs'),p=new Uint8ClampedArray(128*128*4);for(let y=44;y<75;y++)for(let x=36;x<68;x++)p[(y*128+x)*4+3]=255;assert.deepEqual(petEquipmentAnchor(p),{x:52,top:44});assert.equal(petEquipmentAnchor(new Uint8ClampedArray(p.length)),null);assert.throws(()=>petEquipmentAnchor(new Uint8ClampedArray(4)));});
