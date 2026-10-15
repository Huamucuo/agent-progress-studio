import path from 'node:path';
import {lstat}from 'node:fs/promises';
import {readOwnedJSON}from './owned-files.mjs';
import {canonicalPath}from '../src/core/resource-registry.mjs';
const fold=value=>process.platform==='win32'?value.toLowerCase():value;
const events=['SessionStart','UserPromptSubmit','PreToolUse','PostToolUse','Stop'];
/** Official CLI source plus owned catalog/commands, never inference from chat bodies. */
export async function inspectManagedDesktopProbe(source){
 const absolute=path.resolve(source),plugins=path.dirname(absolute),owner=path.dirname(plugins),profile=path.dirname(owner);
 if(path.basename(absolute)!=='agent-progress-studio-desktop'||path.basename(plugins)!=='plugins'||path.basename(owner)!=='managed-plugin'||await canonicalPath(absolute)!==fold(absolute))throw Error('Unverified managed plugin source');
 const record=await readOwnedJSON(owner,path.join(owner,'desktop-plugin-ownership.json'));if(record.schema!==1||record.plugin!=='agent-progress-studio-desktop@aps-desktop-local')throw Error('Unknown managed plugin ownership');
 const definition=await readOwnedJSON(absolute,path.join(absolute,'hooks/hooks.json'));if(!definition.hooks||Object.keys(definition.hooks).sort().join(',')!==events.slice().sort().join(','))throw Error('Ambiguous hook definitions');
 let selected;
 for(const name of events){const event=definition.hooks[name];if(!Array.isArray(event)||event.length!==1||!Array.isArray(event[0].hooks)||event[0].hooks.length!==1)throw Error('Unexpected command definition');const hook=event[0].hooks[0];
  const command=hook.commandWindows||hook.command;if(hook.type!=='command'||typeof command!=='string'||hook.command&&hook.command!==command)throw Error('Unknown hook command');
  const match=/^"([^"\r\n]+)" --aps-hook --aps-hook-spool "([^"\r\n]+)"$/.exec(command);if(!match||!path.isAbsolute(match[1])||!path.isAbsolute(match[2])||/[\r\n%&|^<>]/.test(match[1]+match[2]))throw Error('Nonstandard managed recorder');
  const executable=path.resolve(match[1]),spool=path.resolve(match[2]);if(path.basename(executable)!=='AgentProgressStudio.exe'||fold(spool)!==fold(path.join(profile,'hook-events')))throw Error('Recorder scope differs from owned profile');
  const real=await canonicalPath(executable),info=await lstat(executable);if(real!==fold(executable)||!info.isFile()||info.isSymbolicLink()||info.nlink!==1)throw Error('Unverified recorder runtime');
  const tuple=JSON.stringify([executable,spool]);if(selected&&tuple!==selected.tuple)throw Error('Mixed managed commands');selected={tuple,eventsDir:spool};
 }
 return {eventsDir:selected.eventsDir,metadataOnly:true,managedDesktop:true};
}
