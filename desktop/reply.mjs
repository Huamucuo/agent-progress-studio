import path from 'node:path';import {homedir}from 'node:os';
import {findCodex}from './hooks.mjs';import {LocalRpc,loadedIds}from './local-rpc.mjs';
import {canonicalPath}from '../src/core/resource-registry.mjs';import {canonicalUuid}from '../src/core/session-access.mjs';import {VERSION}from '../src/version.mjs';
async function defaultRuntime(s){if(await canonicalPath(s.codexHome)!==await canonicalPath(process.env.CODEX_HOME||path.join(homedir(),'.codex')))return null;return findCodex();}
const statusProjection=wire=>({id:wire.scalar(wire.at('result','thread','id')),status:wire.scalar(wire.at('result','thread','status','type'))});
const turnProjection=wire=>{const rows=wire.at('result','data');if(rows?.type!=='array'||rows.values.length!==1)throw Error('Active turn unknown');const t=rows.values[0];return {id:wire.scalar(t.fields?.get('id')),status:wire.scalar(t.fields?.get('status'))};};
/** Independent, default-off reply permission. No read-only adapter mutation or runtime reconfiguration. */
export class ReplyController{
 constructor({host,runtime=defaultRuntime,rpc=options=>new LocalRpc(options)}){Object.assign(this,{host,runtime,rpc});this.channels=new Set();this.busy=false;this.onInvalidate=()=>{for(const c of this.channels)c.close();};host.on('invalidate',this.onInvalidate);}
 context(input,checkSender=()=>{}){const s=this.host.ready();this.host.checkMutationScope(s,input);const ref=s.currentRef();if(s.mode!=='local'||ref?.backend!==s.localBackend||!canonicalUuid(ref.id))throw Error('Only local Codex reply is supported');
  const permits=[s.access.issue(ref,'content'),s.access.issue(ref,'reply')],original=s.publication.seal({}, {permits,ref});
  const check=()=>{checkSender();if(this.host.state!=='running'||this.host.service!==s)throw Error('Reply scope changed');s.publication.context(original);};check();return {s,ref,check,original};
 }
 async send(input,checkSender){if(!input||Object.keys(input).some(k=>!['text','authorityInstanceId','expectedPolicyRevision','selectionRevision'].includes(k))||typeof input.text!=='string'||!input.text.trim()||input.text.length>4096)throw Error('Invalid typed reply');
  if(this.busy)throw Error('Reply already pending');const ctx=this.context(input,checkSender),{s,ref,check,original}=ctx;this.busy=true;let client,written=false,state='UNSUPPORTED_LOCAL_CONTROL',turnId=null;
  const result=()=>{check();return this.host.remember(s,s.publication.seal({state,turnId}, {...s.publication.context(original),ref}));};
  try{const executable=await this.runtime(s);check();if(!executable)return result();client=this.rpc({executable,codexHome:s.codexHome,check,timeoutMs:5000});this.channels.add(client);
   await client.request('initialize',{clientInfo:{name:'agent_progress_studio_reply',version:VERSION},capabilities:{experimentalApi:true,optOutNotificationMethods:['item/reasoning/textDelta','item/reasoning/summaryTextDelta','item/agentMessage/delta','item/commandExecution/outputDelta','turn/diff/updated']}},()=>true);check();client.initialized();
   let cursor=null,pages=0,found=false;const cursors=new Set();do{const page=await client.request('thread/loaded/list',{limit:100,cursor},loadedIds);check();found=page.ids.some(id=>canonicalUuid(id)===ref.id);cursor=page.cursor;if(cursor&&cursors.has(cursor))throw Error('Invalid discovery cursor');cursors.add(cursor);}while(!found&&cursor&&++pages<20);
   if(!found){state='UNSUPPORTED_UNLOADED_SESSION';return result();}
   const status=await client.request('thread/read',{threadId:ref.id,includeTurns:false},statusProjection);check();if(canonicalUuid(status.id)!==ref.id)throw Error('Reply identity mismatch');
   let method='turn/start',params={threadId:ref.id,input:[{type:'text',text:input.text,text_elements:[]}]};
   if(status.status==='active'){const turn=await client.request('thread/turns/list',{threadId:ref.id,itemsView:'notLoaded',limit:1,sortDirection:'desc'},turnProjection);check();if(!turn.id||turn.status!=='inProgress')throw Error('Active turn unknown');method='turn/steer';params.expectedTurnId=turn.id;}
   else if(status.status!=='idle'){state='UNSUPPORTED_RUNTIME_STATE';return result();}
   check();written=true;const accepted=await client.request(method,params,wire=>({turnId:wire.scalar(method==='turn/steer'?wire.at('result','turnId'):wire.at('result','turn','id'))}));check();if(!accepted.turnId)throw Error('Reply acceptance unknown');state='ACCEPTED';turnId=accepted.turnId;return result();
  }catch{check();state=written?'DELIVERY_UNKNOWN':'UNSUPPORTED_LOCAL_CONTROL';return result();}
  finally{client?.close();if(client)this.channels.delete(client);this.busy=false;}
 }
 close(){this.onInvalidate();this.host.removeListener('invalidate',this.onInvalidate);}
}
