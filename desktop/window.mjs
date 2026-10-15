import { app, BrowserWindow, ipcMain, protocol, session, Tray, Menu, nativeImage, dialog, screen,globalShortcut } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DesktopHost } from './host.mjs';
import { DesktopSettings } from './settings.mjs';
import { Diagnostics } from './diagnostics.mjs';
import { HookManager,installManagedHook } from './hooks.mjs';
import { HookIngress } from './hook-ingress.mjs';
import { markerName, writeMarker, readMarker, removeMarker } from './recorder.mjs';
import {readOwnedJSON}from './owned-files.mjs';
import { sessionRef } from '../src/core/session-access.mjs';
import { canonicalPath,within } from '../src/core/resource-registry.mjs';
import { VERSION } from '../src/version.mjs';
import { FloatingWindow } from './floating-window.mjs';
import { WindowRegistry } from './ipc-policy.mjs';
import {NotificationCenter,validateNoticePreference}from './notices.mjs';
import {CacheMaintenance}from './maintenance.mjs';
import {ReplyController}from './reply.mjs';
import {PowerManager,windowsShutdown}from './power-manager.mjs';
import {powerLabel}from '../public/power-labels.mjs';
import {PetWindow}from './pet-window.mjs';
import {PetController}from './pet-controller.mjs';

const root = fileURLToPath(new URL('../', import.meta.url)), origin = 'aps://studio', pageURL = origin + '/';
const args = process.argv.slice(1), option = name => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
const portable = await fs.stat(path.join(path.dirname(process.execPath), 'Portable.flag')).then(() => true, () => false);
const requestedProfile = option('--aps-profile');
let profile = requestedProfile && path.isAbsolute(requestedProfile) ? requestedProfile : portable ? path.join(path.dirname(process.execPath), 'APS Desktop Data') : path.join(app.getPath('appData'), 'Agent Progress Studio Desktop');
let portableDataFallback=false;
if(portable&&!requestedProfile){try{await fs.mkdir(profile,{recursive:true});}catch{profile=path.join(app.getPath('appData'),'Agent Progress Studio Desktop');portableDataFallback=true;}}
app.setPath('userData', profile); app.setName('Agent Progress Studio'); app.setAppUserModelId('com.agentprogressstudio.desktop');
const primary = app.requestSingleInstanceLock();
let window, tray, host, settings, logs, manager, floating,pet,petWindow,petAssetsInFlight=0,notifications,reply,power,lastPowerState,maintenance,maintenanceTimer,attachHostConsumers=()=>{},shortcutRegistered=false,quitting = false, cleanQuit = false, emergency = false;
const windows=new WindowRegistry();
const userData = path.join(profile, 'observer'), ownSpool = path.join(profile, 'hook-events');
const ownHookBackend='hooks:'+await canonicalPath(ownSpool,true);
const managedIngressBackends=new Set([ownHookBackend]);let markedSpool=null,markedInstance=null;
let markerQueue = Promise.resolve();
let ingress;
const watchedAuthorities=new WeakSet();
const subscriptionOwner = new Map();
const assets = new Set(['index.html','app.mjs','components.mjs','i18n.mjs','styles.css','logo.svg','state-receiver.mjs','transport.mjs','desktop-ui.mjs','desktop.css','floating.html','floating.mjs','floating.css','monitor-model.mjs','notice.html','notice.mjs','notice.css','power-labels.mjs','pet.html','pet.mjs','pet.css','pet-ui.mjs','pet-assets.mjs','pet-activity.mjs','assets/pets/aps-dog.png','assets/pets/aps-cat.png','assets/pets/aps-capybara.png','assets/pets/aps-outline-dog.png']);
const contentTypes = { '.html':'text/html; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml','.png':'image/png' };
const guard = (event,ticket) => windows.check(event,ticket);
const plain = input => input && typeof input === 'object' && !Array.isArray(input) && [Object.prototype,null].includes(Object.getPrototypeOf(input));
const validateExtra = (input, keys = []) => { if (!plain(input) || Object.keys(input).some(k => !keys.includes(k)) || JSON.stringify(input).length > 16384) throw Error('Invalid desktop control input'); };
const show = () => { if (!window || window.isDestroyed()) return; if (window.isMinimized()) window.restore(); window.show(); window.focus(); logs?.record('WINDOW_SHOWN'); };
const status = () => ({version:VERSION,state:host?.state||'starting',firstRun:settings?.value.firstRun??true,closeToTray:settings?.value.closeToTray||false,openAtLogin:settings?.value.openAtLogin||false,portable,portableDataFallback,shortcut:settings?.value.shortcut,shortcutRegistered,floatingVisible:!!floating?.window&&floating.window.isVisible(),windowVisible:!!window&&!window.isDestroyed()&&window.isVisible(),runtime:{electron:process.versions.electron,node:process.versions.node,externalNodeRequired:false,httpListener:false,hookIngress:'authenticated-windows-named-pipe'},dataDirectory:profile});
const showMain=view=>{show();if(view&&window&&!window.isDestroyed())window.webContents.send('aps:main-view',view);};
async function floatControl(input){await floating.create();return floating.control(input);}
const updateTray = () => {
  if (!tray) return;
  const running = host?.state === 'running',p=power?.controller.status()||{state:'DISABLED'};tray.setToolTip(`Agent Progress Studio · ${running ? '监控开启 / Monitoring active' : '监控暂停 / Monitoring paused'} · ${powerLabel(p.state)}${p.remainingSeconds!==null&&p.remainingSeconds!==undefined?' '+p.remainingSeconds+'s':''}`);
  tray.setContextMenu(Menu.buildFromTemplate([{label:'显示浮窗 / Show floating monitor',click:()=>floatControl({action:'show'}).catch(()=>failure('OPERATION_FAILED'))},{label:'隐藏浮窗 / Hide floating monitor',click:()=>floating?.control({action:'hide'})},{ label:'打开主界面 / Open main window', click:show }, {label:'浮窗置顶 / Always on top',type:'checkbox',checked:floating?.state.alwaysOnTop??true,click:item=>floatControl({action:'alwaysOnTop',value:item.checked}).catch(()=>{})},{ label: running ? '暂停监控 / Pause' : '恢复监控 / Resume', click: async () => { try { running ? await pause() : await resume(); } catch { await failure('OPERATION_FAILED'); } } },{label:'自动关机 / Automatic shutdown',submenu:[{label:powerLabel(p.state)+' / '+powerLabel(p.state,'en'),enabled:false},{label:'管理 / Manage',click:()=>showMain('power')},{label:'取消 / Cancel',click:()=>power?.cancel()}]},{label:'桌宠 / Desktop pet',submenu:[{label:'显示 / Show',enabled:settings.value.pet.enabled,click:()=>petWindow?.control({action:'show'}).catch(()=>{})},{label:'隐藏 / Hide',enabled:settings.value.pet.enabled,click:()=>petWindow?.control({action:'hide'}).catch(()=>{})},{label:'信息与商店 / Info and shop',click:()=>showMain('pet')}]},{label:'设置 / Settings',click:()=>showMain('settings')}, { type:'separator' }, { label:'退出并停止监控 / Quit and stop', click:quit }]));
};
async function hookStatus() {
  const value=await manager.status();
  if(value.desktopProbe)managedIngressBackends.add('hooks:'+await canonicalPath(value.desktopProbe.eventsDir,true));
  value.observerActive=!!ingress;
  const directory=host?.service?.mode==='work-hooks'?host.service.source?.directory:ownSpool;
  value.realEvents=await fs.readdir(directory||ownSpool).then(files=>files.filter(f=>/^\d+-[0-9a-f-]+\.json$/.test(f)).length,()=>0);
  return value;
}
async function removeObservationMarker(){
  if(!markedSpool)return;
  const directory=markedSpool,instance=markedInstance;markedSpool=null;markedInstance=null;
  try{const value=await readOwnedJSON(directory,path.join(directory,markerName));if(value.instance===instance)await removeMarker(directory);}catch{}
}
function updateMarker() {
  if(ingress){try{ingress.check();if(host.state!=='running'||host.service?.mode!=='work-hooks'||host.service?.access!==ingress.access||!managedIngressBackends.has(host.service.hookBackend))throw Error('Observation changed');}catch{ingress.close();ingress=null;}}
  markerQueue=markerQueue.catch(()=>{}).then(async()=>{
    const s=host?.service;
    if(host?.state!=='running'||!s||s.mode!=='work-hooks'||!managedIngressBackends.has(s.hookBackend)||!s.access.can(sessionRef(s.hookBackend,'scope'),'observe')){ingress?.close();ingress=null;await removeObservationMarker();return;}
    const directory=s.source?.directory;if(!directory||s.hookBackend!=='hooks:'+await canonicalPath(directory))throw Error('Observation directory differs from scope');
    const permit=s.access.issue(sessionRef(s.hookBackend,'scope'),'observe');
    const check=()=>{s.access.check(permit);if(host.service!==s||host.state!=='running'||s.mode!=='work-hooks')throw Error('Observation superseded');};
    if(markedSpool&&markedSpool!==directory){await removeObservationMarker();check();}
    const prior=await readMarker(directory).catch(()=>null);check();if(prior&&prior.instance!==s.access.instanceId)throw Error('Observation already owned by another APS instance');
    if(!watchedAuthorities.has(s.access)){watchedAuthorities.add(s.access);s.access.on('invalidate',()=>{if(ingress){try{ingress.check();}catch{ingress.close();ingress=null;}}});}
    if(!ingress)ingress=await new HookIngress(directory,s.access,permit).start();check();
    markedSpool=directory;markedInstance=s.access.instanceId;
    await writeMarker(directory,{schema:1,enabled:true,instance:s.access.instanceId,generation:permit.dependency.generation,expiresAt:Date.now()+15000,pipe:ingress.pipe,token:ingress.token});
    try{check();}catch(e){await removeObservationMarker();ingress?.close();ingress=null;throw e;}
  });return markerQueue;
}
async function connectHookDirectory(directory,managed=false){
 const old=host.ready();await old.registry.hooks(directory);
 if(managed)managedIngressBackends.add('hooks:'+await canonicalPath(directory,true));
 await settings.save({mode:'work-hooks',workHooksDir:directory,selectionId:''});await restart();
 const s=host.ready();await host.request('selectSource',{mode:'work-hooks',authorityInstanceId:s.access.instanceId,expectedPolicyRevision:s.access.revision,selectionRevision:s.selectionRevision});await updateMarker();
 return {connectedDirectory:true,observerActive:!!ingress,realActivity:'UNKNOWN_UNTIL_OBSERVED'};
}
async function makeHost(start=true) {
  host = new DesktopHost({ dataDir:userData, mode: option('--aps-demo') ? 'demo' : settings.value.mode, initialSelection:option('--aps-demo')?undefined:{id:settings.value.selectionId||undefined,endpoint:settings.value.endpoint||undefined},codexHome: option('--aps-codex-home') || settings.value.codexHome || undefined, workHooksDir: option('--aps-hook-directory') || settings.value.workHooksDir || ownSpool });
  host.on('status', () => { updateTray(); updateMarker().catch(() => {}); });
  host.on('diagnostic', code => logs.record(code));
  if(start)await host.start();await updateMarker();
}
async function pause() { const stopping = host.pause(); await updateMarker(); await stopping; await logs.record('APP_PAUSE'); }
async function resume() { host.options.mode=settings.value.mode;host.options.initialSelection={id:settings.value.selectionId||undefined,endpoint:settings.value.endpoint||undefined};await host.start();await updateMarker();await logs.record('APP_RESUME'); }
async function restart() { const active=host.state==='running';await pause(); await host.close(); subscriptionOwner.clear(); await makeHost(active);attachHostConsumers(); }
async function quit() {
  if (quitting) return; quitting = true;
  try { if (host) await pause(); await markerQueue; await pet?.close(); await settings?.queue; await logs?.record('APP_EXIT'); }
  finally { cleanQuit = true;clearInterval(maintenanceTimer);globalShortcut.unregisterAll();power?.close();notifications?.close();reply?.close();floating?.close(); tray?.destroy(); app.quit(); }
}
async function failure(code) {
  if (emergency) return; emergency = true;
  await logs?.record(code); if (host) await pause().catch(() => {});
  if (window && !window.isDestroyed()) {
    const result = await dialog.showMessageBox(window, { type:'error', title:'Agent Progress Studio', message:'监控已安全暂停 / Monitoring has been paused', detail:'发生程序错误。日志仅包含诊断代码。\nAn application error occurred. Logs contain diagnostic codes only.', buttons:['重新打开窗口 / Reload','查看日志 / View logs','退出 / Quit'], defaultId:0, cancelId:2 });
    if (result.response === 0) { emergency = false; window.reload(); }
    else if (result.response === 1) { emergency = false; await dialog.showMessageBox(window,{ message:'本地诊断 / Local diagnostics', detail:await logs.read(), buttons:['关闭 / Close'] }); }
    else await quit();
  } else await quit();
}
if (!primary) app.quit();
else {
  app.on('second-instance', () => { logs?.record('SECOND_INSTANCE'); show(); });
  app.on('before-quit', event => { if (!cleanQuit) { event.preventDefault(); quit(); } });
  app.on('window-all-closed', () => { if (!settings?.value.closeToTray || quitting) quit(); });
  process.on('uncaughtException', () => failure('MAIN_FAILED').catch(() => app.exit(1)));
  process.on('unhandledRejection', () => failure('MAIN_FAILED').catch(() => app.exit(1)));
  await app.whenReady();
  settings = new DesktopSettings(profile); await settings.load(); logs = new Diagnostics(path.join(profile,'logs'));
  await logs.record('APP_START'); if (settings.recovered) await logs.record('SETTINGS_RECOVERED');
  // Startup registration is never enabled on first launch.
  if (settings.value.openAtLogin) app.setLoginItemSettings({ name:'Agent Progress Studio Desktop',openAtLogin:true, path:process.execPath, args:['--aps-start-hidden'] });
  const types = contentTypes;
  protocol.handle('aps', async request => {
    const url = new URL(request.url), file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    if (url.host !== 'studio' || request.method !== 'GET' || !assets.has(file) || url.search || url.hash) return new Response('Not found',{status:404});
    const content = await fs.readFile(path.join(root,'public',file));
    return new Response(content,{headers:{'Content-Type':types[path.extname(file)],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'none'; frame-ancestors 'none'"}});
  });
  session.defaultSession.setPermissionRequestHandler((_wc,_permission,callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.webRequest.onBeforeRequest((details,callback) => callback({ cancel: !details.url.startsWith(origin + '/') && !details.url.startsWith('data:') && !details.url.startsWith('blob:aps://studio/') }));
  await makeHost();
  manager = new HookManager({ directory:path.join(profile,'managed-plugin'), executable:process.execPath, spool:ownSpool });
  const icon = path.join(root,'desktop/assets/icon.png');
  const webPreferences={ preload:path.join(root,'desktop/preload.cjs'), nodeIntegration:false, nodeIntegrationInWorker:false, nodeIntegrationInSubFrames:false, contextIsolation:true, sandbox:true, webSecurity:true, allowRunningInsecureContent:false, webviewTag:false, devTools:!app.isPackaged };
  const stopWindowSubscriptions=winId=>{for(const [id,sub]of subscriptionOwner)if(sub.id===winId){sub.stop();subscriptionOwner.delete(id);}};
  const registerWindow=(win,role,url)=>{
    const winId=win.webContents.id;
    windows.register(win,role,url);win.removeMenu();win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    win.webContents.on('will-navigate',(event,next)=>{if(next!==url)event.preventDefault();});win.webContents.on('will-attach-webview',event=>event.preventDefault());
    win.webContents.on('render-process-gone',()=>{if(role==='pet'){petWindow?.close();pet?.preference({enabled:false}).catch(()=>{});logs.record('PET_RENDERER_FAILED');}else failure('RENDERER_FAILED');});win.webContents.on('did-start-navigation',(_event,_url,_inPlace,isMainFrame)=>{if(isMainFrame){windows.navigate(win);stopWindowSubscriptions(winId);}});
    win.on('closed',()=>{stopWindowSubscriptions(winId);windows.remove(winId);});
  };
  window = new BrowserWindow({ ...settings.value.bounds, minWidth:1000, minHeight:700, title:'Agent Progress Studio · Desktop Edition', icon, show:false, backgroundColor:'#101513', webPreferences:{ preload:path.join(root,'desktop/preload.cjs'), nodeIntegration:false, nodeIntegrationInWorker:false, nodeIntegrationInSubFrames:false, contextIsolation:true, sandbox:true, webSecurity:true, allowRunningInsecureContent:false, webviewTag:false, devTools:!app.isPackaged } });
  registerWindow(window,'main',pageURL);
  petWindow=new PetWindow({BrowserWindow,screen,root,settings,webPreferences,register:registerWindow,isQuitting:()=>quitting,onChange:()=>updateTray(),onFailure:code=>logs.record(code)});
  pet=new PetController({directory:path.join(profile,'pet'),settings,window:petWindow,onChange:()=>updateTray(),onFailure:code=>logs.record(code)});pet.bind(host);
  floating=new FloatingWindow({BrowserWindow,screen,root,settings,webPreferences,register:registerWindow,isQuitting:()=>quitting,onFailure:code=>logs.record(code),onHidden:background=>{if(!background)pause().catch(()=>{});},onGeometry:()=>{notifications?.reposition();const f=floating?.status();petWindow?.setObstacles(f?.visible&&['FLOATING','DOCKED_EXPANDED'].includes(f.mode)?[f.visibleBounds]:[]);},onChange:state=>{for(const r of windows.windows.values())if(!r.win.isDestroyed()&&r.role!=='pet'&&r.win.webContents.mainFrame.url===r.url)r.win.webContents.send('aps:window-state',state);notifications?.reposition();petWindow?.setObstacles(state.visible&&['FLOATING','DOCKED_EXPANDED'].includes(state.mode)?[state.visibleBounds]:[]);updateTray();}});
  attachHostConsumers=()=>{pet?.bind(host);reply?.close();reply=new ReplyController({host});notifications?.close();notifications=new NotificationCenter({BrowserWindow,screen,root,settings,webPreferences,register:registerWindow,host,getMode:()=>floating.state.mode,getDisplayId:()=>floating.state.displayId,getAnchor:()=>floating.anchor(),clearWindows:()=>{for(const r of windows.windows.values())if(!r.win.isDestroyed())r.win.webContents.send('aps:private-clear');},onFailure:code=>logs.record(code)});};attachHostConsumers();
  const attachBase=attachHostConsumers;attachHostConsumers=()=>{power?.close();attachBase();lastPowerState='DISABLED';power=new PowerManager({host,simulation:!app.isPackaged||args.includes('--aps-power-dry-run'),executor:!app.isPackaged||args.includes('--aps-power-dry-run')?async check=>{check();logs.record('POWER_SIMULATED');}:windowsShutdown,onChange:value=>{for(const r of windows.windows.values())if(!r.win.isDestroyed()&&!['notice','pet'].includes(r.role))r.win.webContents.send('aps:power',value);if(value.state!==lastPowerState){if(value.state==='COUNTDOWN')notifications.system('power-countdown');if(value.state==='SHUTDOWN_FAILED')notifications.system('power-failed');lastPowerState=value.state;}updateTray();}});};attachHostConsumers();
  maintenance=new CacheMaintenance({session:session.defaultSession,settings,notify:result=>{logs.record('CACHE_CLEANED');notifications.system('cache-cleaned');for(const r of windows.windows.values())if(!r.win.isDestroyed()&&!['notice','pet'].includes(r.role))r.win.webContents.send('aps:maintenance',{result});}});
  maintenanceTimer=setInterval(()=>maintenance.tick().catch(()=>logs.record('CACHE_CLEAN_FAILED')),60000);
  window.on('close',event => { if (!quitting) { event.preventDefault(); if (settings.value.closeToTray||floating.state.mode!=='HIDDEN'||settings.value.pet.enabled&&!settings.value.pet.hidden) { window.hide(); logs.record('WINDOW_HIDDEN'); updateTray(); } else quit(); } });
  window.on('resize',() => { const [width,height] = window.getSize(); settings.save({bounds:{width,height}}).catch(() => {}); });
  window.once('ready-to-show',() => { if (!args.includes('--aps-start-hidden')) show(); });
  tray = new Tray(nativeImage.createFromPath(icon).resize({width:32,height:32})); tray.on('double-click',show); updateTray();
  const performRequest = async (event,payload) => {
    try {
      const sender=guard(event),senderTicket=windows.ticket(event); validateExtra(payload,['requestId','operation','input']); const {operation,input} = payload;windows.allow(sender,operation,input);
      if (typeof operation !== 'string') throw Error('Invalid desktop operation');
      if (['bootstrap','snapshot','monitor','petState','sessions','detail','selectSource','sessionAccess','labelHook','review','demo'].includes(operation)) {
        if(operation==='sessionAccess'&&input.decision==='allow-reply')throw Error('Native reply consent required');
        const result = await host.request(operation,input,windows.projection(sender));
        if (operation === 'selectSource') { await settings.save({mode:input.mode,selectionId:input.mode==='demo'?'':result.task.id||'',endpoint:host.service.mode==='app-server'?host.service.source?.endpoint||'':''});await updateMarker(); }
        if (operation === 'sessionAccess') await updateMarker();
        return result;
      }
      if (operation === 'exportReport') { validateExtra(input); return host.exportReport(async () => { const selected = await dialog.showSaveDialog(window,{ title:'保存报告 / Save report', defaultPath:'Agent-Progress-Studio-report.json', filters:[{name:'JSON report',extensions:['json']}] }); return selected.canceled ? null : selected.filePath; }); }
      if (operation === 'status') { validateExtra(input); return status(); }
      if(operation==='petStatus'){validateExtra(input);return pet.status({minimal:sender.role==='pet'});}
      if(operation==='petPreference'){validateExtra(input,['change']);return pet.preference(input.change);}
      if(operation==='petControl'){validateExtra(input,['action']);return input.action==='wave'?pet.interact('wave'):petWindow.control(input);}
      if(operation==='petShape'){
        validateExtra(input,['segments','size']);const v=input.segments;if(input.size!==settings.value.pet.size||!Array.isArray(v)||v.length>3072||v.length%4||v.some(x=>!Number.isInteger(x)))throw Error('Invalid pet hit region');
        const rectangles=[];for(let i=0;i<v.length;i+=4)rectangles.push({x:v[i],y:v[i+1],width:v[i+2],height:v[i+3]});return petWindow.shape(rectangles);
      }
      if(operation==='petPurchase'){validateExtra(input,['id']);return pet.purchase(input.id);}
      if(operation==='petEquip'){validateExtra(input,['slot','id']);return pet.equip(input.slot,input.id);}
      if(operation==='petAsset'){
        validateExtra(input,['id','file']);if(petAssetsInFlight>=2)throw Error('Pet assets busy');petAssetsInFlight++;
        try{const asset=await pet.packs.asset(input.id,input.file);return {data:'data:'+asset.mimeType+';base64,'+asset.bytes.toString('base64'),sha256:asset.sha256};}finally{petAssetsInFlight--;}
      }
      if(operation==='petImport'){
        validateExtra(input);const selected=await dialog.showOpenDialog(window,{title:'导入有权使用的宠物包 / Import an authorized pet pack',properties:['openDirectory']});guard(event,senderTicket);if(selected.canceled)return {canceled:true};
        const canonical=await canonicalPath(selected.filePaths[0]);for(const protectedRoot of host.service?.registry.protected||[])if(within(protectedRoot,canonical)||within(canonical,protectedRoot))throw Error('Pet resources overlap protected session storage');
        await pet.ensurePacks();const preview=await pet.packs.inspectDirectory(selected.filePaths[0]);guard(event,senderTicket);
        const consent=await dialog.showMessageBox(window,{type:'question',title:'确认宠物资源许可 / Review pet resource license',message:preview.name,detail:`${preview.author}\n${preview.source}\n${preview.license}`,checkboxLabel:'我确认有权使用这些资源 / I have the right to use these resources',checkboxChecked:false,buttons:['导入 / Import','取消 / Cancel'],defaultId:1,cancelId:1});guard(event,senderTicket);if(consent.response!==0||!consent.checkboxChecked)return {canceled:true};
        await pet.packs.importDirectory(selected.filePaths[0],{expectedManifest:preview});pet.notify();return {imported:true};
      }
      if(operation==='petRemove'){validateExtra(input,['id']);if(settings.value.pet.character===input.id)await pet.preference({character:'aps-dog'});await pet.packs.remove(input.id);pet.notify();return {removed:true};}
      if(operation==='petMenu'){
        validateExtra(input);const p=settings.value.pet;Menu.buildFromTemplate([
          {label:'抚摸 / Pet',click:()=>petWindow.control({action:'pet'})},
          {label:'招手动作 / Wave',enabled:pet.progression?.snapshot().equipped.action==='wave',click:()=>pet.interact('wave')},
          {label:'睡觉动作 / Sleep animation',click:()=>petWindow.window?.webContents.send('aps:pet-interact',{action:'sleep'})},
          {label:'固定位置 / Lock position',type:'checkbox',checked:p.positionLocked,click:item=>pet.preference({positionLocked:item.checked}).catch(()=>{})},
          {label:'始终置顶 / Always on top',type:'checkbox',checked:p.alwaysOnTop,click:item=>pet.preference({alwaysOnTop:item.checked}).catch(()=>{})},
          {label:'放大 / Larger',enabled:p.size<384,click:()=>pet.preference({size:Math.min(384,p.size+32)}).catch(()=>{})},
          {label:'缩小 / Smaller',enabled:p.size>96,click:()=>pet.preference({size:Math.max(96,p.size-32)}).catch(()=>{})},
          {label:'宠物信息与商店 / Pet info and shop',click:()=>showMain('pet')},
          {label:'隐藏 / Hide',click:()=>petWindow.control({action:'hide'}).catch(()=>{})}
        ]).popup({window:petWindow.window});return {shown:true};
      }
      if(operation==='floatingStatus'){validateExtra(input);return floating.status();}
      if(operation==='noticeStatus'){validateExtra(input);return notifications.prefs();}
      if(operation==='noticeHistory'){validateExtra(input);return notifications.history();}
      if(operation==='sendReply')return reply.send(input,()=>guard(event,senderTicket));
      if(operation==='powerStatus'){validateExtra(input);if(host.state!=='running')return {...power.controller.status(),simulation:power.simulation,tasks:[],postTaskConfirmation:false};return power.output();}
      if(operation==='powerCancel'){validateExtra(input);power.cancel();return power.controller.status();}
      if(operation==='powerArm'){
        validateExtra(input,['mode','ids','stabilitySeconds','countdownSeconds','authorityInstanceId','expectedPolicyRevision','selectionRevision']);return power.arm(input,async tasks=>{const consent=await dialog.showMessageBox(window,{type:'question',title:'自动关机 / Automatic shutdown',message:`允许 ${tasks.length} 个任务的工作结束后自动关机？ / Allow automatic shutdown after these ${tasks.length} tasks finish?`,detail:tasks.map(t=>t.label).join('\n')+'\n仅涵盖这些已接入并授权的任务。会检查工作与后台执行是否结束；结束后不再询问，可随时取消。请保存其他程序中的工作。\nOnly this monitored scope is covered. There is no post-task confirmation; cancellation remains available. Save work in other apps.\n'+(power.simulation?'本次仅模拟，不关闭 Windows。 / This run is simulated; Windows will not shut down.':''),checkboxLabel:'允许自动关机 / Allow automatic shutdown',checkboxChecked:false,buttons:['开启 / Enable','取消 / Cancel'],defaultId:1,cancelId:1});guard(event,senderTicket);return consent.response===0&&consent.checkboxChecked;});
      }
      if(operation==='replyConsent'){
        validateExtra(input,['enabled','authorityInstanceId','expectedPolicyRevision','selectionRevision']);if(typeof input.enabled!=='boolean')throw Error('Boolean required');const s=host.ready();host.checkMutationScope(s,input);const ref=s.currentRef();if(s.mode!=='local'||!ref||!s.access.can(ref,'content'))throw Error('Selected authorized Codex required');
        if(input.enabled){const consent=await dialog.showMessageBox(window,{type:'question',title:'允许从 APS 回复 / Allow APS replies',message:'仅允许回复当前选中的 Codex 任务？ / Allow replies to this selected Codex task?',detail:ref.id+'\n只发送你点击提交的文字；不更改模型、沙箱或审批规则。官方本地接口不可用时拒绝发送。\nOnly your submitted text is sent. Runtime policies remain unchanged.',checkboxLabel:'允许回复这个指定任务 / Allow replies to this task',checkboxChecked:false,buttons:['允许 / Allow','取消 / Cancel'],defaultId:1,cancelId:1});guard(event,senderTicket);host.checkMutationScope(s,input);if(consent.response!==0||!consent.checkboxChecked)return {cancelled:true};}
        return host.request('sessionAccess',{sessionRef:ref,decision:input.enabled?'allow-reply':'revoke-reply',authorityInstanceId:input.authorityInstanceId,expectedPolicyRevision:input.expectedPolicyRevision,selectionRevision:input.selectionRevision});
      }
      if(operation==='cacheStatus'){validateExtra(input);return maintenance.status();}
      if(operation==='cacheClean'){validateExtra(input);await maintenance.clear();return maintenance.status();}
      if(operation==='cachePreference'){validateExtra(input,['enabled']);if(typeof input.enabled!=='boolean')throw Error('Boolean required');await settings.save({maintenance:{...maintenance.status(),enabled:input.enabled}});return maintenance.status();}
      if(operation==='noticePreference'){validateExtra(input,['key','value']);const value=validateNoticePreference(input.key,input.value);await settings.save({notices:{...notifications.prefs(),[input.key]:value}});notifications.clear();return notifications.prefs();}
      if(operation==='floatingControl'){validateExtra(input,['action','value','edge','displayId']);return floatControl(input);}
      if(operation==='openMain'){validateExtra(input,['view']);if(sender.role==='pet'&&input.view&&!['pet','overview'].includes(input.view))throw Error('Pet cannot open privileged views');if(input.view&&!['overview','acceptance','evidence','events','connection','settings','notifications','power','pet'].includes(input.view))throw Error('Invalid view');showMain(input.view);return {shown:true};}
      if(operation==='shortcut'){validateExtra(input,['value']);if(typeof input.value!=='string'||!/^(?:CommandOrControl|Control)\+Alt\+(?:Shift\+)?[A-Z]$/.test(input.value))throw Error('Invalid shortcut');const old=settings.value.shortcut;if(input.value!==old){const registered=globalShortcut.register(input.value,()=>floatControl({action:floating.state.mode==='HIDDEN'?'show':'hide'}).catch(()=>{}));if(!registered)throw Error('Shortcut unavailable');globalShortcut.unregister(old);await settings.save({shortcut:input.value});shortcutRegistered=true;}return status();}
      if (operation === 'pause') { validateExtra(input); await pause(); return status(); }
      if (operation === 'resume') { validateExtra(input); await resume(); return status(); }
      if (operation === 'quit') { validateExtra(input); quit(); return {quitting:true}; }
      if (operation === 'logs') { validateExtra(input); return {text:await logs.read()}; }
      if (operation === 'preference') {
        validateExtra(input,['key','value']);
        if (!['closeToTray','openAtLogin','firstRun'].includes(input.key) || typeof input.value !== 'boolean') throw Error('Invalid preference');
        if (input.key === 'openAtLogin') app.setLoginItemSettings({name:'Agent Progress Studio Desktop',openAtLogin:input.value,path:process.execPath,args:['--aps-start-hidden']});
        await settings.save({[input.key]:input.value}); updateTray(); return status();
      }
      if (operation === 'chooseDirectory') {
        validateExtra(input,['kind']); if (!['codexHome','workHooksDir'].includes(input.kind)) throw Error('Invalid directory purpose');
        const selected = await dialog.showOpenDialog(window,{title: input.kind === 'codexHome' ? '选择 Codex 数据目录 / Select Codex data directory' : '选择已授权的活动事件目录 / Select authorized event directory', properties:['openDirectory']});
        if (selected.canceled) return {canceled:true};
        await settings.save({[input.kind]:selected.filePaths[0],selectionId:''}); await restart(); return {canceled:false};
      }
      if (operation === 'hookStatus') { validateExtra(input);return hookStatus(); }
      if(operation==='hookConnectExisting'){validateExtra(input);const value=await hookStatus();if(!value.existingProbe)throw Error('No known installed probe');return connectHookDirectory(value.existingProbe.eventsDir);}
      if(operation==='hookConnectInstalled'){validateExtra(input);const value=await hookStatus();if(!value.desktopProbe)throw Error('No verified managed desktop probe');return connectHookDirectory(value.desktopProbe.eventsDir,true);}
      if (operation === 'hookPrepare') { validateExtra(input); return manager.prepare(); }
      if (operation === 'hookInstall') {
        validateExtra(input,['planId']); if (typeof input.planId !== 'string') throw Error('Invalid installation plan');
        return installManagedHook(manager,input.planId,async () => { const consent = await dialog.showMessageBox(window,{type:'question',title:'授权本地 Hook / Authorize local Hook',message:'安装 Agent Progress Studio 活动观察插件？',detail:'仅记录事件、会话/回合 ID、时间及工具名/明确结果。官方安装器会登记本应用的独立本地插件，并选择本应用事件目录。不会采集正文，也不会替你信任 Hook。\nOnly event metadata is recorded. Client trust remains a separate action.',checkboxLabel:'我同意安装这些本地 Hook / I authorize this installation',checkboxChecked:false,buttons:['安装 / Install','取消 / Cancel'],defaultId:1,cancelId:1}); return consent.response===0 && consent.checkboxChecked; },settings,ownSpool,restart);
      }
      if (operation === 'hookRemove') {
        validateExtra(input);
        return manager.remove(async () => { const consent = await dialog.showMessageBox(window,{type:'question',message:'移除本应用安装的活动观察插件？ / Remove this app\'s Hook plugin?',detail:'暂停本应用监控并保留历史事件；不会删除其他插件或修改其权限。 / Monitoring pauses and historical events are retained.',buttons:['移除 / Remove','取消 / Cancel'],defaultId:1,cancelId:1}); return consent.response===0; },pause);
      }
      throw Error('Unsupported desktop operation');
    } catch { await logs.record('OPERATION_FAILED'); throw Error('操作未完成：检查连接、权限或刷新后重试。 / Operation incomplete: check connection, permission or refresh.'); }
  };
  // Publish session data directly, synchronously, after its original authority
  // check. The invoke/Promise return path carries no private snapshots.
  ipcMain.on('aps:request',(event,payload) => {
    let ticket;try{ticket=windows.ticket(event);}catch{return;}
    const requestId = payload?.requestId;
    if (typeof requestId !== 'string' || !/^[a-z0-9:]{1,160}$/.test(requestId)) return;
    performRequest(event,payload).then(value => {
      guard(event,ticket);
      const send = json => event.sender.send('aps:reply',{requestId,ok:true,json});
      if (value?.access) host.sendResponse(value,send); else send(JSON.stringify(value));
    }).catch(() => { logs.record('OPERATION_FAILED'); if (!event.sender.isDestroyed()) event.sender.send('aps:reply',{requestId,ok:false}); });
  });
  ipcMain.handle('aps:subscribe',(event,input) => {
    const {ticket,projection}=windows.subscription(event);validateExtra(input,['subscriptionId','authorityInstanceId','expectedPolicyRevision','selectionRevision']);
    const stop = host.subscribe(input.subscriptionId,input,frame => {try{guard(event,ticket);event.sender.send('aps:event',frame);}catch{}},projection);
    subscriptionOwner.set(input.subscriptionId,{id:event.sender.id,stop}); return {subscribed:true};
  });
  ipcMain.handle('aps:unsubscribe',(event,input) => { windows.subscription(event); validateExtra(input,['subscriptionId']); const sub = subscriptionOwner.get(input.subscriptionId); if (sub?.id === event.sender.id) { sub.stop(); subscriptionOwner.delete(input.subscriptionId); } return {unsubscribed:true}; });
  // An enabled pet runs its preload immediately. Register every request and
  // subscription handler before loading that renderer, including on restart.
  await pet.init();
  const markerTimer = setInterval(() => updateMarker().catch(() => {}),5000); app.on('will-quit',() => clearInterval(markerTimer));
  shortcutRegistered=globalShortcut.register(settings.value.shortcut,()=>floatControl({action:floating.state.mode==='HIDDEN'?'show':'hide'}).catch(()=>{}));if(!shortcutRegistered)logs.record('SHORTCUT_UNAVAILABLE');
  // Plugin/trust checks are independent of first paint and run only on APS local markets.
  hookStatus().then(()=>updateMarker()).catch(()=>logs.record('HOOK_STATUS_UNAVAILABLE'));
  await window.loadURL(pageURL);
  if(!args.includes('--aps-start-hidden')&&floating.state.mode!=='HIDDEN')await floating.create();
}
