import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {inspectManagedDesktopProbe}from '../desktop/managed-spool.mjs';

async function fixture(t){
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'aps-managed-spool-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const profile=path.join(root,'profile'),owner=path.join(profile,'managed-plugin'),source=path.join(owner,'plugins','agent-progress-studio-desktop'),exe=path.join(root,'AgentProgressStudio.exe'),spool=path.join(profile,'hook-events');
 await fs.mkdir(path.join(source,'hooks'),{recursive:true});await fs.writeFile(exe,'SYNTHETIC_EXECUTABLE_NEVER_RUN');
 await fs.writeFile(path.join(owner,'desktop-plugin-ownership.json'),JSON.stringify({schema:1,plugin:'agent-progress-studio-desktop@aps-desktop-local'}));
 const command=`"${exe}" --aps-hook --aps-hook-spool "${spool}"`,definition={hooks:Object.fromEntries(['SessionStart','UserPromptSubmit','PreToolUse','PostToolUse','Stop'].map(name=>[name,[{hooks:[{type:'command',command,commandWindows:command}]}]]))};
 const file=path.join(source,'hooks','hooks.json');await fs.writeFile(file,JSON.stringify(definition));return {root,profile,owner,source,exe,spool,definition,file};
}
test('official managed source maps only to its owned metadata spool without executing a recorder',async t=>{const f=await fixture(t);assert.deepEqual(await inspectManagedDesktopProbe(f.source),{eventsDir:f.spool,metadataOnly:true,managedDesktop:true});});
for(const [label,alter]of [
 ['unowned profile',async f=>fs.writeFile(path.join(f.owner,'desktop-plugin-ownership.json'),'{"schema":1,"plugin":"other"}')],
 ['missing event',f=>{delete f.definition.hooks.Stop;}],
 ['mixed event commands',f=>{f.definition.hooks.Stop[0].hooks[0].commandWindows='"'+f.exe+'" --aps-hook --aps-hook-spool "'+f.root+'"';}],
 ['unowned directory',f=>{for(const event of Object.values(f.definition.hooks))event[0].hooks[0].command=event[0].hooks[0].commandWindows='"'+f.exe+'" --aps-hook --aps-hook-spool "'+f.root+'"';}],
 ['shell command extension',f=>{for(const event of Object.values(f.definition.hooks))event[0].hooks[0].command=event[0].hooks[0].commandWindows+=' & echo PRIVATE';}],
 ['runtime hardlink',async f=>fs.link(f.exe,path.join(f.root,'alias.exe'))],
 ['hook file hardlink',async f=>fs.link(f.file,path.join(f.root,'alias.json'))]
])test('managed spool refuses '+label,async t=>{const f=await fixture(t);await alter(f);if(!['hook file hardlink','unowned profile'].includes(label))await fs.writeFile(f.file,JSON.stringify(f.definition));await assert.rejects(inspectManagedDesktopProbe(f.source));});
test('directory aliases cannot redirect source selection',async t=>{const f=await fixture(t),alias=path.join(f.root,'managed-plugin');await fs.symlink(f.owner,alias,process.platform==='win32'?'junction':'dir');await assert.rejects(inspectManagedDesktopProbe(path.join(alias,'plugins','agent-progress-studio-desktop')));});
