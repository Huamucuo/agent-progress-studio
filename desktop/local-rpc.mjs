import {spawn as spawnProcess} from 'node:child_process';
import {StringDecoder} from 'node:string_decoder';
import {scanEnvelope} from '../src/adapters/rpc-envelope.mjs';
const methods=new Set(['initialize','hooks/list','thread/loaded/list','thread/read','thread/turns/list','thread/backgroundTerminals/list','turn/start','turn/steer']);
/** Owned stdio proxy only. No credential lookup, HTTP listener, resume or approval answers. */
export class LocalRpc{
 constructor({executable,codexHome,cwd,kind='proxy',spawn=spawnProcess,check,timeoutMs=5000}){
  if(typeof check!=='function'||!['proxy','hooks'].includes(kind))throw Error('Explicit RPC scope required');
  Object.assign(this,{executable,codexHome,cwd,kind,spawn,check,timeoutMs});this.pending=new Map();this.next=0;this.buffer='';this.decoder=new StringDecoder('utf8');
 }
 open(){this.check();if(this.closed)throw Error('Closed RPC channel');if(this.child)return;
  this.child=this.spawn(this.executable,this.kind==='proxy'?['app-server','proxy']:['app-server','--stdio'],{cwd:this.cwd,windowsHide:true,shell:false,stdio:['pipe','pipe','ignore'],env:{...process.env,...(this.codexHome?{CODEX_HOME:this.codexHome}:{})}});
  this.child.on('error',()=>this.fail());this.child.on('exit',()=>this.fail());this.child.stdin.on('error',()=>this.fail());
  this.child.stdout.on('data',chunk=>this.receive(this.decoder.write(chunk)));
 }
 fail(error=Error('Local RPC unavailable')){for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error);}this.pending.clear();}
 receive(text){this.buffer+=text;if(this.buffer.length>4*1024*1024){this.fail(Error('Local RPC frame limit'));this.close();return;}
  let at;while((at=this.buffer.indexOf('\n'))>=0){const line=this.buffer.slice(0,at);this.buffer=this.buffer.slice(at+1);if(!line.trim())continue;
   let p;try{const wire=scanEnvelope(line);p=this.pending.get(wire.requestKey);if(!p||wire.method!==undefined||!!wire.at('result')===!!wire.at('error'))continue;
    this.check();if(wire.at('error'))throw Error('Local RPC rejected');const value=p.project(wire);this.check();clearTimeout(p.timer);this.pending.delete(wire.requestKey);p.resolve(value);
   }catch(error){if(p){clearTimeout(p.timer);this.pending.delete(p.key);p.reject(error);}else{this.fail(Error('Malformed local RPC frame'));this.close();}}
  }
 }
 request(method,params,project){if(!methods.has(method))return Promise.reject(Error('RPC method denied'));if(typeof project!=='function')return Promise.reject(Error('Projection required'));
  try{this.check();this.open();}catch(error){return Promise.reject(error);}
  return new Promise((resolve,reject)=>{const id=++this.next,key='n:'+id,timer=setTimeout(()=>{this.pending.delete(key);reject(Error('Local RPC timeout'));},this.timeoutMs);
   this.pending.set(key,{key,project,resolve,reject,timer});try{this.check();this.child.stdin.write(JSON.stringify({id,method,params})+'\n');}catch(e){clearTimeout(timer);this.pending.delete(key);reject(e);}
  });
 }
 initialized(){this.check();if(this.closed||!this.child)throw Error('Closed RPC channel');this.child.stdin.write(JSON.stringify({method:'initialized',params:{}})+'\n');}
 close(){if(this.closed)return;this.closed=true;this.buffer='';this.fail();this.child?.stdin.end();this.child?.kill();}
}
export function loadedIds(wire){const node=wire.at('result','data');if(node?.type!=='array'||node.values.length>1000)throw Error('Invalid ID discovery');const ids=node.values.map(n=>wire.scalar(n));if(ids.some(id=>typeof id!=='string'||id.length>128))throw Error('Invalid ID discovery');return {ids,cursor:wire.scalar(wire.at('result','nextCursor'))||null};}
