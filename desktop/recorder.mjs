import { open, lstat, readdir, mkdir, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createConnection } from 'node:net';
import { createReadStream } from 'node:fs';
import { createRequire } from 'node:module';
import { canonicalPath } from '../src/core/resource-registry.mjs';
import { ownedDirectory } from './owned-files.mjs';
const { projectEvent } = createRequire(import.meta.url)('../experiments/work-hooks/plugin/hooks/record-event.js');
export { projectEvent };
export const markerName = 'aps-desktop-observation.json';
export async function readMarker(directory, now = Date.now()) {
  const real = await canonicalPath(directory), literal = path.resolve(directory);
  if (real !== (process.platform === 'win32' ? literal.toLowerCase() : literal)) throw Error('Marker directory alias');
  const file = path.join(real, markerName), info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink > 1 || info.size > 2048) throw Error('Invalid marker');
  const h = await open(file, 'r');
  try {
    const stat = await h.stat(); if (stat.ino !== info.ino || stat.dev !== info.dev || stat.nlink > 1) throw Error('Marker changed');
    const b = Buffer.alloc(2049), { bytesRead } = await h.read(b, 0, b.length, 0); if (bytesRead > 2048) throw Error('Marker grew');
    const marker = JSON.parse(b.subarray(0, bytesRead).toString());
    if (marker.schema !== 1 || marker.enabled !== true || typeof marker.instance !== 'string' || !Number.isSafeInteger(marker.generation) || !Number.isSafeInteger(marker.expiresAt) || marker.expiresAt < now || marker.expiresAt > now + 30000) throw Error('Inactive marker');
    return marker;
  } finally { await h.close(); }
}
export async function recordHook(directory, input, { now = () => Date.now(), authorize=()=>{}, timestamp,retentionLimit } = {}) {
  authorize();
  const first = await readMarker(directory, now()), event = projectEvent(input);
  if (!event) return false;
  if(timestamp!==undefined){if(typeof timestamp!=='string'||!Number.isFinite(Date.parse(timestamp))||new Date(timestamp).toISOString()!==timestamp)throw Error('Invalid event timestamp');event.timestamp=timestamp;}
  const check = async () => { authorize();const next = await readMarker(directory, now());authorize();if (next.instance !== first.instance || next.generation !== first.generation) throw Error('Observation revoked'); };
  if(retentionLimit!==undefined){
    if(!Number.isSafeInteger(retentionLimit)||retentionLimit<2||retentionLimit>8000)throw Error('Invalid retention bound');
    await check();const names=(await readdir(directory)).filter(n=>/^\d{13}-a95de510-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.json$/.test(n)).sort();await check();
    for(const name of names.slice(0,Math.max(0,names.length-retentionLimit+1))){await check();const target=path.join(directory,name);let info;try{info=await lstat(target);}catch(e){if(e.code==='ENOENT')continue;throw e;}await check();if(!info.isFile()||info.isSymbolicLink()||info.nlink>1)continue;await unlink(target).catch(e=>{if(e.code!=='ENOENT')throw e;});await check();}
  }else if((await readdir(directory)).length>10000)throw Error('Unmanaged storage bound reached');
  const uuid=randomUUID(),suffix=retentionLimit===undefined?uuid:'a95de510-'+uuid.slice(9);
  await check(); const file = path.join(directory, `${now()}-${suffix}`), pending = file + '.pending'; let h,renamed=false,committed=false;
  try {
    authorize();h = await open(pending, 'wx', 0o600); await check();authorize();await h.writeFile(JSON.stringify(event));await check();await h.close(); h = null;
    await check(); await rename(pending, file + '.json');renamed=true;await check();committed=true;return true;
  } finally { await h?.close(); await unlink(pending).catch(() => {});if(renamed&&!committed)await unlink(file+'.json').catch(()=>{}); }
}
export async function runRecorder(directory, input, output = process.stdout) {
  const timeout = setTimeout(() => { output.write('{}'); process.exit(0); }, 2000);
  try {
    // Inactive observers do not even consume or parse the supplied private input.
    const marker=await readMarker(directory);if(typeof marker.pipe!=='string'||!/^\\\\\.\\pipe\\aps-desktop-[a-f0-9-]{36}$/.test(marker.pipe)||typeof marker.token!=='string'||!/^[a-f0-9]{64}$/.test(marker.token))return;
    // Electron replaces process.stdin with an empty stream on Windows. Read
    // the inherited pipe descriptor only AFTER the observation check.
    const stream=input||(process.platform==='win32'?createReadStream(null,{fd:0,autoClose:false}):process.stdin);
    const parts = []; let size = 0;
    for await (const chunk of stream) { size += chunk.length; if (size > 256 * 1024) return; parts.push(chunk); }
    const event=projectEvent(JSON.parse(Buffer.concat(parts).toString('utf8')));if(!event)return;
    await new Promise((resolve,reject)=>{
      const socket=createConnection(marker.pipe);socket.setTimeout(1500,()=>{socket.destroy();reject(Error('Hook ingress timeout'));});socket.once('error',reject);
      socket.once('connect',()=>socket.write(JSON.stringify({token:marker.token,event})+'\n'));socket.once('data',()=>{socket.destroy();resolve();});socket.once('end',resolve);
    });
  } catch { /* No raw input, errors or steering output. */ }
  finally { clearTimeout(timeout); output.write('{}'); }
}
export async function writeMarker(directory, value) {
  await ownedDirectory(directory); const file = path.join(directory, markerName), temp = file + '.' + randomUUID() + '.tmp';
  try { const h = await open(temp, 'wx', 0o600); try { await h.writeFile(JSON.stringify(value)); } finally { await h.close(); } await rename(temp, file); }
  finally { await unlink(temp).catch(() => {}); }
}
export async function removeMarker(directory) { await unlink(path.join(directory, markerName)).catch(e => { if (e.code !== 'ENOENT') throw e; }); }
