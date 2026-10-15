import {LocalRpc}from './local-rpc.mjs';
const pluginId='agent-progress-studio-desktop@aps-desktop-local';
const events=new Map([
 ['preToolUse','PreToolUse'],['postToolUse','PostToolUse'],['sessionStart','SessionStart'],
 ['userPromptSubmit','UserPromptSubmit'],['stop','Stop'],
 ['PreToolUse','PreToolUse'],['PostToolUse','PostToolUse'],['SessionStart','SessionStart'],
 ['UserPromptSubmit','UserPromptSubmit'],['Stop','Stop']
]);
const project=(event,enabled,trust)=>{const canonical=events.get(event);return canonical?{event:canonical,enabled:enabled===true,trust:['trusted','untrusted','managed'].includes(trust)?trust:'unknown'}:null;};
/** Public hooks/list only. No thread/history reads, prompts or trust writes. */
export function summarizeHooks(value){
 const rows=Array.isArray(value?.data)?value.data:[],hooks=rows.flatMap(r=>Array.isArray(r.hooks)?r.hooks:[]);
 return hooks.filter(h=>h?.pluginId===pluginId).map(h=>project(h.eventName,h.enabled,h.trustStatus)).filter(Boolean);
}
export function summarizeHookWire(wire){
 const data=wire.at('result','data');if(data?.type!=='array')throw Error('Unknown Hook definitions');
 const definitions=[];
 for(const row of data.values)for(const h of row.fields?.get('hooks')?.values||[])if(wire.scalar(h.fields?.get('pluginId'))===pluginId){
  const value=project(wire.scalar(h.fields.get('eventName')),h.fields.get('enabled')?.type==='true',wire.scalar(h.fields.get('trustStatus')));
  if(value)definitions.push(value);
 }
 return definitions;
}
export async function officialHookStatus(executable,cwd){
 const r=new LocalRpc({executable,cwd,kind:'hooks',check:()=>{},timeoutMs:10000});
 try{await r.request('initialize',{clientInfo:{name:'aps_hook_metadata_check',version:'1'},capabilities:{experimentalApi:true}},()=>true);r.initialized();return await r.request('hooks/list',{cwds:[cwd]},summarizeHookWire);}finally{r.close();}
}
