import { createServer } from 'node:net';
import { randomUUID, randomBytes, timingSafeEqual } from 'node:crypto';
import { recordHook, projectEvent } from './recorder.mjs';
/** The recorder submits metadata; only the live authority can commit it. */
export class HookIngress {
  constructor(directory, access, permit) { this.directory=directory;this.access=access;this.permit=permit;this.token=randomBytes(32).toString('hex');this.pipe='\\\\.\\pipe\\aps-desktop-'+randomUUID();this.sockets=new Set();this.closed=false; }
  check() { if(this.closed)throw Error('Hook ingress closed');this.access.check(this.permit); }
  async start() {
    this.check(); this.server=createServer(socket=>{
      this.sockets.add(socket);let text='',handled=false;socket.setTimeout(2000,()=>socket.destroy());socket.on('error',()=>{});socket.on('close',()=>this.sockets.delete(socket));
      socket.on('data',chunk=>{
        if(handled)return;text+=chunk.toString('utf8');if(Buffer.byteLength(text)>4096){handled=true;socket.destroy();return;}
        const newline=text.indexOf('\n');if(newline<0)return;handled=true;
        (async()=>{
          this.check();const request=JSON.parse(text.slice(0,newline)), supplied=Buffer.from(typeof request.token==='string'?request.token:''), expected=Buffer.from(this.token);
          if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected)||Object.keys(request).sort().join(',')!=='event,token')throw Error('Hook ingress denied');
          const event=request.event, keys=Object.keys(event||{}).sort().join(',');
          if(!['event_type,session_id,timestamp,turn_id','event_type,session_id,timestamp,tool_name,tool_status,turn_id'].includes(keys))throw Error('Metadata fields denied');
          const input={hook_event_name:event.event_type,session_id:event.session_id,turn_id:event.turn_id,tool_name:event.tool_name};
          if(event.event_type==='PostToolUse')input.tool_response=event.tool_status==='succeeded'?{exit_code:0}:event.tool_status==='failed'?{exit_code:1}:{};
          const projected=projectEvent(input);
          if(!projected||Object.keys(projected).sort().join(',')!==keys||Object.keys(projected).some(k=>k!=='timestamp'&&projected[k]!==event[k])||typeof event.timestamp!=='string'||!Number.isFinite(Date.parse(event.timestamp))||new Date(event.timestamp).toISOString()!==event.timestamp)throw Error('Invalid projected metadata');
          this.check();const saved=await recordHook(this.directory,input,{authorize:()=>this.check(),timestamp:event.timestamp,retentionLimit:8000});this.check();socket.end(JSON.stringify({ok:saved})+'\n');
        })().catch(()=>socket.end('{"ok":false}\n'));
      });
    });
    await new Promise((resolve,reject)=>{this.server.once('error',reject);this.server.listen(this.pipe,resolve);});this.check();return this;
  }
  close() { if(this.closed)return;this.closed=true;for(const socket of this.sockets)socket.destroy();this.sockets.clear();this.server?.close(); }
}
