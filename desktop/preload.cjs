const { contextBridge, ipcRenderer } = require('electron');
const pending = new Map();
ipcRenderer.on('aps:reply', (_event, reply) => {
  const request = pending.get(reply?.requestId); if (!request) return;
  pending.delete(reply.requestId); clearTimeout(request.timer);
  if (!reply.ok) return request.reject(Error('操作未完成：检查连接、权限或刷新后重试。 / Operation incomplete: check connection, permission or refresh.'));
  try { request.resolve(JSON.parse(reply.json)); } catch { request.reject(Error('Invalid desktop response')); }
});
const invoke = (operation, input = {}) => new Promise((resolve,reject) => {
  if (pending.size >= 32) return reject(Error('Too many desktop requests'));
  const requestId = Date.now().toString(36) + ':' + Math.random().toString(36).slice(2);
  const timer = setTimeout(() => { pending.delete(requestId); reject(Error('Desktop request timed out')); },120000);
  pending.set(requestId,{resolve,reject,timer}); ipcRenderer.send('aps:request',{requestId,operation,input});
});
const api = {
  petState:()=>invoke('petState'),petStatus:()=>invoke('petStatus'),petPreference:input=>invoke('petPreference',input),petControl:input=>invoke('petControl',input),petShape:input=>invoke('petShape',input),petMenu:()=>invoke('petMenu'),petAsset:input=>invoke('petAsset',input),petPurchase:input=>invoke('petPurchase',input),petEquip:input=>invoke('petEquip',input),petImport:()=>invoke('petImport'),petRemove:input=>invoke('petRemove',input),
  onPetSettings:callback=>{if(typeof callback!=='function')throw Error('Callback required');const listener=()=>callback();ipcRenderer.on('aps:pet-settings',listener);return ()=>ipcRenderer.removeListener('aps:pet-settings',listener);},
  onPetClear:callback=>{if(typeof callback!=='function')throw Error('Callback required');const listener=()=>callback();ipcRenderer.on('aps:pet-clear',listener);return ()=>ipcRenderer.removeListener('aps:pet-clear',listener);},
  onPetInteract:callback=>{if(typeof callback!=='function')throw Error('Callback required');const listener=(_e,v)=>callback(v);ipcRenderer.on('aps:pet-interact',listener);return ()=>ipcRenderer.removeListener('aps:pet-interact',listener);},
  bootstrap: () => invoke('bootstrap'), snapshot: () => invoke('snapshot'), monitor:()=>invoke('monitor'), sessions: () => invoke('sessions'),
  detail: input => invoke('detail', input), selectSource: input => invoke('selectSource', input),
  sessionAccess: input => invoke('sessionAccess', input), labelHook: input => invoke('labelHook', input),
  review: input => invoke('review', input), demo: input => invoke('demo', input),
  exportReport: () => invoke('exportReport'), status: () => invoke('status'),
  preference: input => invoke('preference', input), chooseDirectory: input => invoke('chooseDirectory', input),
  pause: () => invoke('pause'), resume: () => invoke('resume'), quit: () => invoke('quit'),
  logs: () => invoke('logs'), hookStatus: () => invoke('hookStatus'), hookPrepare: () => invoke('hookPrepare'),
  hookConnectExisting:()=>invoke('hookConnectExisting'),
  hookConnectInstalled:()=>invoke('hookConnectInstalled'),
  hookInstall: input => invoke('hookInstall', input), hookRemove: () => invoke('hookRemove'),
  floatingControl:input=>invoke('floatingControl',input),floatingStatus:()=>invoke('floatingStatus'),openMain:input=>invoke('openMain',input),
  shortcut:input=>invoke('shortcut',input),
  noticePreference:input=>invoke('noticePreference',input),noticeStatus:()=>invoke('noticeStatus'),noticeHistory:()=>invoke('noticeHistory'),
  cacheStatus:()=>invoke('cacheStatus'),cacheClean:()=>invoke('cacheClean'),cachePreference:input=>invoke('cachePreference',input),
  sendReply:input=>invoke('sendReply',input),replyConsent:input=>invoke('replyConsent',input),
  powerStatus:()=>invoke('powerStatus'),powerArm:input=>invoke('powerArm',input),powerCancel:()=>invoke('powerCancel'),
  onPower:callback=>{if(typeof callback!=='function')throw Error('Callback required');const listener=(_e,value)=>callback(value);ipcRenderer.on('aps:power',listener);return ()=>ipcRenderer.removeListener('aps:power',listener);},
  onMaintenance:callback=>{if(typeof callback!=='function')throw Error('Callback required');const listener=(_e,value)=>callback(value);ipcRenderer.on('aps:maintenance',listener);return ()=>ipcRenderer.removeListener('aps:maintenance',listener);},
  onNotice:callback=>{if(typeof callback!=='function')throw Error('Callback required');const listener=(_e,frame)=>callback(frame);ipcRenderer.on('aps:notice',listener);return ()=>ipcRenderer.removeListener('aps:notice',listener);},
  onPrivateClear:callback=>{if(typeof callback!=='function')throw Error('Callback required');const listener=()=>callback();ipcRenderer.on('aps:private-clear',listener);return ()=>ipcRenderer.removeListener('aps:private-clear',listener);},
  onMainView:callback=>{if(typeof callback!=='function')throw Error('Callback required');const listener=(_e,view)=>callback(view);ipcRenderer.on('aps:main-view',listener);return ()=>ipcRenderer.removeListener('aps:main-view',listener);},
  onWindowState:callback=>{if(typeof callback!=='function')throw Error('Callback required');const listener=(_e,state)=>callback(state);ipcRenderer.on('aps:window-state',listener);return ()=>ipcRenderer.removeListener('aps:window-state',listener);},
  observe: (scope, callback) => {
    if (typeof callback !== 'function') throw Error('Callback required');
    const id = Date.now().toString(36) + ':' + Math.random().toString(36).slice(2); let closed = false;
    const listener = (_event, frame) => { if (!closed && frame?.subscriptionId === id) callback(frame); };
    ipcRenderer.on('aps:event', listener);
    ipcRenderer.invoke('aps:subscribe', { subscriptionId: id, ...scope }).then(() => { if (!closed) callback({subscriptionId:id,type:'open'}); }).catch(() => { if (!closed) callback({ subscriptionId: id, type: 'invalidate' }); });
    return () => { if (closed) return; closed = true; ipcRenderer.removeListener('aps:event', listener); ipcRenderer.invoke('aps:unsubscribe', { subscriptionId: id }).catch(() => {}); };
  }
};
contextBridge.exposeInMainWorld('apsDesktop', Object.freeze(api));
