import { mkdir, open, lstat, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ownedDirectory } from './owned-files.mjs';
import { defaultFloating } from './window-state.mjs';
import {noticePreferences,validateNoticePreference}from './notices.mjs';
import {defaultPetPreferences,normalizePetPreferences}from '../src/pet/state.mjs';
export const defaultSettings = () => ({ schema: 1, firstRun: true, closeToTray: false, openAtLogin: false, mode: 'local', selectionId:'', endpoint:'', codexHome: '', workHooksDir: '', floating:defaultFloating(),notices:noticePreferences(),pet:defaultPetPreferences(),shortcut:'CommandOrControl+Alt+Shift+A',bounds: { width: 1360, height: 920 } });
export class DesktopSettings {
  constructor(directory) { this.directory = directory; this.file = path.join(directory, 'desktop-settings.json'); this.value = defaultSettings(); this.queue = Promise.resolve(); }
  async load() {
    await ownedDirectory(this.directory); let handle;
    try {
      const info = await lstat(this.file); if (!info.isFile() || info.isSymbolicLink() || info.nlink > 1 || info.size > 16384) throw Error('Invalid settings identity');
      handle = await open(this.file, 'r'); const actual = await handle.stat();
      if (actual.ino !== info.ino || actual.dev !== info.dev || actual.nlink > 1) throw Error('Settings identity changed');
      const data = Buffer.alloc(16385), { bytesRead } = await handle.read(data, 0, data.length, 0); if (bytesRead > 16384) throw Error('Settings too large');
      const parsed = JSON.parse(data.subarray(0, bytesRead).toString());
      for (const k of ['firstRun', 'closeToTray', 'openAtLogin']) if (typeof parsed[k] === 'boolean') this.value[k] = parsed[k];
      for (const k of ['codexHome', 'workHooksDir']) if (typeof parsed[k] === 'string' && (!parsed[k] || path.isAbsolute(parsed[k]))) this.value[k] = parsed[k];
      if (['local', 'work-hooks', 'demo','app-server'].includes(parsed.mode)) this.value.mode = parsed.mode;
      if (typeof parsed.selectionId==='string'&&/^[A-Za-z0-9_-]{0,128}$/.test(parsed.selectionId))this.value.selectionId=parsed.selectionId;
      if (typeof parsed.endpoint==='string'&&/^ws:\/\/127\.0\.0\.1:\d+\/$/.test(parsed.endpoint))this.value.endpoint=parsed.endpoint;
      if (parsed.bounds && ['width', 'height'].every(k => Number.isInteger(parsed.bounds[k]) && parsed.bounds[k] >= 700 && parsed.bounds[k] <= 4000)) this.value.bounds = { width: parsed.bounds.width, height: parsed.bounds.height };
      if(parsed.floating&&typeof parsed.floating==='object'&&!Array.isArray(parsed.floating)){
        const initial=defaultFloating();for(const k of Object.keys(initial))if(Object.hasOwn(parsed.floating,k))initial[k]=parsed.floating[k];this.value.floating=initial;
      }
      if(typeof parsed.shortcut==='string'&&/^(?:CommandOrControl|Control)\+Alt\+(?:Shift\+)?[A-Z]$/.test(parsed.shortcut))this.value.shortcut=parsed.shortcut;
      if(parsed.notices&&typeof parsed.notices==='object')for(const k of Object.keys(noticePreferences()))try{this.value.notices[k]=validateNoticePreference(k,parsed.notices[k]);}catch{}
      if(parsed.pet)try{this.value.pet=normalizePetPreferences(parsed.pet);}catch{this.recovered=true;}
      if(parsed.maintenance&&typeof parsed.maintenance==='object'){const v=parsed.maintenance;this.value.maintenance={enabled:v.enabled!==false,lastClean:Number.isSafeInteger(v.lastClean)&&v.lastClean>=0&&v.lastClean<=Date.now()?v.lastClean:null,bytesBefore:Number.isSafeInteger(v.bytesBefore)&&v.bytesBefore>=0?v.bytesBefore:null,lastResult:['CLEARED','PARTIAL','FAILED'].includes(v.lastResult)?v.lastResult:null};}
    } catch (e) { if (e.code !== 'ENOENT') this.recovered = true; } finally { await handle?.close(); }
    return this.value;
  }
  save(change) {
    this.value = { ...this.value, ...change }; const value = structuredClone(this.value);
    const action = async () => {
      await ownedDirectory(this.directory);
      const temp = this.file + '.' + randomUUID() + '.tmp'; let handle;
      try { handle = await open(temp, 'wx', 0o600); await handle.writeFile(JSON.stringify(value, null, 2)); await handle.sync(); await handle.close(); handle = null; await rename(temp, this.file); }
      finally { await handle?.close(); await unlink(temp).catch(() => {}); }
    };
    const next = this.queue.then(action); this.queue = next.catch(() => {}); return next;
  }
}
