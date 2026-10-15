const shared=new Set(['bootstrap','monitor','status','pause','resume','quit','floatingControl','floatingStatus','openMain','sendReply','powerStatus','powerCancel']);
const floatingOnly=new Set(['selectSource']);
const petOnly=new Set(['bootstrap','petState','petStatus','petControl','petShape','petMenu','petAsset','openMain']);
/** Known native windows only; navigation generations bind delayed responses. */
export class WindowRegistry{
 constructor(){this.windows=new Map();}
 register(win,role,url){const urls={main:'aps://studio/',floating:'aps://studio/floating.html',notice:'aps://studio/notice.html',pet:'aps://studio/pet.html'};if(urls[role]!==url)throw Error('Invalid window role');const r={win,role,url,epoch:0};this.windows.set(win.webContents.id,r);return r;}
 check(event,ticket){const r=this.windows.get(event.sender?.id),f=event.senderFrame;
  if(!r||r.win.isDestroyed()||r.win.webContents!==event.sender||!f||f!==event.sender.mainFrame||f.url!==r.url||f.origin!=='aps://studio'||(ticket&&(ticket.record!==r||ticket.epoch!==r.epoch)))throw Error('Untrusted or outdated desktop sender');return r;
 }
 ticket(event){const r=this.check(event);return {record:r,epoch:r.epoch};}
 projection(record){if(record.role==='main')return 'snapshot';if(record.role==='floating')return 'monitor';if(record.role==='pet')return 'pet';throw Error('Notice window has no subscription or response capability');}
 subscription(event){const ticket=this.ticket(event);return {ticket,projection:this.projection(ticket.record)};}
 allow(record,operation,input){if(record.role==='main')return;if(record.role==='notice')throw Error('Notice window has no request capability');
  if(record.role==='pet'){if(petOnly.has(operation))return;throw Error('Operation unavailable to pet');}
  if(shared.has(operation))return;
  if(floatingOnly.has(operation)&&input?.id&&['local','work-hooks','demo','app-server'].includes(input.mode))return;
  throw Error('Operation requires main window');
 }
 navigate(win){const r=this.windows.get(win.webContents.id);if(r)r.epoch++;}
 remove(win){this.windows.delete(typeof win==='number'?win:win.webContents.id);}
}
