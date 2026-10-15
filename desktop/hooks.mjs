import { lstat, readdir, realpath,open } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { homedir } from 'node:os';
import { writeOwnedJSON, readOwnedJSON } from './owned-files.mjs';
import { VERSION } from '../src/version.mjs';
import {canonicalPath}from '../src/core/resource-registry.mjs';
import {officialHookStatus}from './hook-status.mjs';
import {inspectManagedDesktopProbe}from './managed-spool.mjs';
export const pluginName = 'agent-progress-studio-desktop';
export const marketplaceName = 'aps-desktop-local';
export const hookEvents = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop'];
const identifier = pluginName + '@' + marketplaceName;
const commandPath = value => { if (!path.isAbsolute(value) || /["\r\n%&|^<>]/.test(value)) throw Error('Unsafe command path'); return '"' + value + '"'; };
export async function installManagedHook(manager,planId,confirm,settings,ownSpool,reconfigure){
  const result=await manager.install(planId,confirm);
  if(result.installed){await settings.save({workHooksDir:ownSpool,selectionId:''});await reconfigure();}
  return result;
}
export async function findCodex() {
  const roots = [path.join(process.env.LOCALAPPDATA || path.join(homedir(), 'AppData/Local'), 'OpenAI/Codex/bin')];
  for (const root of roots) {
    try { const folders = await readdir(root, { withFileTypes: true });
      for (const entry of folders.filter(x => x.isDirectory() && !x.isSymbolicLink()).reverse()) {
        const file = path.join(root, entry.name, 'codex.exe'); if ((await lstat(file)).isFile()) return file;
      }
    } catch {}
  }
  try { const { stdout } = await promisify(execFile)('where.exe', ['codex.exe'], { windowsHide: true, timeout: 3000, maxBuffer: 4096 }); const file = stdout.trim().split(/\r?\n/)[0]; if (path.isAbsolute(file) && path.basename(file).toLowerCase() === 'codex.exe') return file; } catch {}
  return null;
}
/** Dedicated owned marketplace; official CLI mutations require native consent. */
export class HookManager {
  constructor({ directory, executable, spool, codex,inspect=officialHookStatus, run = async (file, args) => promisify(execFile)(file, args, { windowsHide: true, timeout: 20000, maxBuffer: 1024 * 1024 }) }) {
    this.directory = directory; this.executable = executable; this.spool = spool; this.codex = codex; this.run = run;this.inspect=inspect; this.plans = new Map();
  }
  status() {
    if(this.pendingStatus)return this.pendingStatus;
    const pending=this.readStatus();this.pendingStatus=pending;
    pending.finally(()=>{if(this.pendingStatus===pending)this.pendingStatus=null;}).catch(()=>{});
    return pending;
  }
  async readStatus() {
    const codex = this.codex || await findCodex(); let installed = null,existingProbe=null,desktopProbe=null,installationTarget='UNKNOWN',query='UNAVAILABLE';
    if (codex) {
      try {
        // Avoid querying unrelated or remote marketplaces. A failed independent
        // local market never establishes absence or blocks another market result.
        const results=await Promise.allSettled([marketplaceName,'aps-local-hook-experiment'].map(async market=>{
          const {stdout}=await this.run(codex,['plugin','list','--marketplace',market,'--json']);
          const parsed=JSON.parse(stdout),items=Array.isArray(parsed)?parsed:parsed.installed??parsed.plugins??parsed.data;
          if(!Array.isArray(items))throw Error('Unknown official plugin list structure');
          return items.filter(item=>(item.marketplaceName??item.marketplace)===market);
        }));
        const candidates=results.flatMap(r=>r.status==='fulfilled'?r.value:[]);
        query=results[0].status==='fulfilled'?'AVAILABLE':'UNAVAILABLE';
        const own=candidates.find(item=>item?.name===pluginName && (item.marketplaceName??item.marketplace)===marketplaceName);
        if (own && typeof own.installed==='boolean') installed=own.installed;
        else if(!own&&query==='AVAILABLE')installed=false;
        if(installed===false)installationTarget='NOT_INSTALLED';
        if(installed===true&&own.source?.source==='local'&&typeof own.source.path==='string'&&path.isAbsolute(own.source.path)){
          const source=path.resolve(own.source.path),expected=path.resolve(this.directory,'plugins',pluginName),fold=v=>process.platform==='win32'?v.toLowerCase():v;
          if(await canonicalPath(source)===fold(source))installationTarget=fold(source)===fold(expected)?'CURRENT_PROFILE':'OTHER_PROFILE';
          if(own.enabled===true)try{desktopProbe=await inspectManagedDesktopProbe(source);}catch{}
        }
        const old=candidates.find(item=>item?.name==='aps-work-hook-probe'&&(item.marketplaceName??item.marketplace)==='aps-local-hook-experiment'&&item.installed===true&&item.enabled===true&&item.source?.source==='local');
        if(old&&path.isAbsolute(old.source.path)){
          const directory=path.resolve(old.source.path),file=path.join(directory,'settings.json'),folded=process.platform==='win32'?directory.toLowerCase():directory;
          if(await canonicalPath(directory)===folded){const named=await lstat(file);if(named.isFile()&&!named.isSymbolicLink()&&named.nlink===1&&named.size<=1024){const h=await open(file,'r');try{const stat=await h.stat();if(stat.ino===named.ino&&stat.dev===named.dev&&stat.nlink===1){const b=Buffer.alloc(1025),{bytesRead}=await h.read(b,0,b.length,0),after=await h.stat();if(bytesRead<=1024&&after.ino===stat.ino&&after.mtimeMs===stat.mtimeMs&&after.size===stat.size){const config=JSON.parse(b.subarray(0,bytesRead).toString());if(Object.keys(config).join(',')==='eventsDir'&&typeof config.eventsDir==='string'&&path.isAbsolute(config.eventsDir))existingProbe={installed:true,enabled:true,eventsDir:config.eventsDir,trust:'UNKNOWN_REQUIRES_CLIENT_REVIEW'};}}}finally{await h.close();}}}
        }
        // Mere availability/name matches never establish installation or trust.
      } catch {}
    }
    let definitions=[];if(installed&&await lstat(codex).then(s=>s.isFile()&&!s.isSymbolicLink(),()=>false))try{definitions=await this.inspect(codex,path.dirname(this.directory));}catch{}
    const trust=hookEvents.every(event=>definitions.some(h=>h.event===event&&h.enabled&&['trusted','managed'].includes(h.trust)))?'TRUSTED_DEFINITIONS':definitions.some(h=>h.trust==='untrusted')?'UNTRUSTED':'UNKNOWN_REQUIRES_CLIENT_REVIEW';
    return { runtimeAvailable: !!codex,query, installed,existingProbe,desktopProbe,installationTarget, installation:installed===true?'DETECTED_BY_OFFICIAL_CLI':installed===false?'NOT_INSTALLED':'UNKNOWN',trust,definitions, events:hookEvents, fields:['event_type','session_id','turn_id','timestamp','tool_name (tool events)','tool_status (tool events)'] };
  }
  assertInstallTarget(status){
    if(status.installationTarget==='OTHER_PROFILE')throw Error('Plugin belongs to another profile; use or remove it in that APS installation first');
    if(!['CURRENT_PROFILE','NOT_INSTALLED'].includes(status.installationTarget))throw Error('Cannot verify the installation target');
  }
  async prepare() {
    const codex = this.codex || await findCodex(); if (!codex) throw Error('Local Codex runtime not found');
    this.assertInstallTarget(await this.status());
    const plan = { id: randomUUID(), expires: Date.now() + 300000, codex, executable: await realpath(this.executable), spool: path.resolve(this.spool) };
    commandPath(plan.executable); commandPath(plan.spool); this.plans.set(plan.id, plan);
    return { planId: plan.id, plugin: identifier, eventTypes: hookEvents, metadataOnly: true, needsClientTrust: true };
  }
  async install(planId, nativeConfirm) {
    const plan = this.plans.get(planId); this.plans.delete(planId);
    if (!plan || plan.expires < Date.now()) throw Error('Expired installation plan');
    if (!(await nativeConfirm())) throw Error('Installation was not authorized');
    this.assertInstallTarget(await this.status());
    const plugin = path.join(this.directory, 'plugins', pluginName), catalog = path.join(this.directory, '.agents/plugins');
    const command = `${commandPath(plan.executable)} --aps-hook --aps-hook-spool ${commandPath(plan.spool)}`;
    const hooks = Object.fromEntries(hookEvents.map(event => [event, [{ hooks: [{ type: 'command', command, commandWindows: command, async: true, timeout: 3 }] }]]));
    await writeOwnedJSON(this.directory,path.join(plugin, '.codex-plugin/plugin.json'), { name: pluginName, version: VERSION, hooks:'./hooks/hooks.json',description: 'Authorized metadata-only desktop observation. No conversation body, tool arguments/output, steering or network.' });
    await writeOwnedJSON(this.directory,path.join(plugin, 'hooks/hooks.json'), { hooks });
    await writeOwnedJSON(this.directory,path.join(catalog, 'marketplace.json'), { name: marketplaceName, plugins: [{ name: pluginName, source: { source: 'local', path: './plugins/' + pluginName }, policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' }, category: 'Productivity' }] });
    await this.run(plan.codex, ['plugin', 'marketplace', 'add', this.directory, '--json']);
    await this.run(plan.codex, ['plugin', 'add', identifier, '--json']);
    await writeOwnedJSON(this.directory,path.join(this.directory, 'desktop-plugin-ownership.json'), { schema: 1, plugin: identifier, installedAt: new Date().toISOString() });
    return { installed: true, trust: 'UNKNOWN_REQUIRES_CLIENT_REVIEW', restart: 'HOST_DEPENDENT', plugin: identifier };
  }
  async remove(nativeConfirm, onAuthorized=async()=>{}) {
    const ownership = await readOwnedJSON(this.directory,path.join(this.directory, 'desktop-plugin-ownership.json'));
    if (ownership.schema !== 1 || ownership.plugin !== identifier) throw Error('Cannot verify plugin ownership');
    const codex=this.codex||await findCodex();if(!codex)throw Error('Official local runtime not found');
    if((await this.status()).installationTarget!=='CURRENT_PROFILE')throw Error('Cannot verify current plugin ownership target');
    if (!(await nativeConfirm())) throw Error('Removal was not authorized');
    if((await this.status()).installationTarget!=='CURRENT_PROFILE')throw Error('Plugin target changed during consent');
    await onAuthorized();await this.run(codex, ['plugin', 'remove', identifier, '--json']);
    return { removed: true, historyRetained: true };
  }
}
