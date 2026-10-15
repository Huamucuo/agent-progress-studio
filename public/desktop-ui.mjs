import { h, button, badge } from './components.mjs';
import {powerLabel,powerReason}from './power-labels.mjs';
export async function initializeDesktopUI({ getLanguage, navigate, refresh, notify,readPrivate }) {
  const api = window.apsDesktop; if (!api) return;
  document.body.classList.add('desktop-mode');
  const style = document.createElement('link'); style.rel='stylesheet'; style.href='/desktop.css'; document.head.append(style);
  const root = h('div',{id:'desktop-controls'}), overlay = h('div',{id:'desktop-overlay'}); document.body.append(root,overlay);
  const en = () => getLanguage()==='en', text = (zh,english) => en()?english:zh;
  let current, rendering='', busy=false,privateOpen=false,powerState={state:'DISABLED'};
  const doAction = async action => { if (busy) return; busy=true; try { await action(); await update(); } catch { notify(text('操作未完成，请检查连接或权限。','Operation incomplete. Check connection or permission.')); } finally {busy=false;} };
  const closePanel = () => {privateOpen=false;overlay.replaceChildren();};
  const panel = (title,content,footer) => {
    closePanel(); const dialog = h('section',{className:'desktop-panel',role:'dialog','aria-modal':'true','aria-label':title}, h('header',{},h('h2',{},title),button('×',closePanel,{kind:'quiet',testId:'desktop-panel-close'})),h('div',{className:'desktop-panel-body'},content),h('footer',{},footer || button(text('关闭','Close'),closePanel,{kind:'quiet'})));
    overlay.append(h('div',{className:'desktop-backdrop'},dialog));
  };
  const petPanel=()=>doAction(async()=>{const {openPetPanel}=await import('./pet-ui.mjs');await openPetPanel({api,panel,closePanel,notify,getLanguage});});
  const switchSource = async mode => {
    const b = await api.bootstrap(); await api.selectSource({mode,authorityInstanceId:b.access.authorityInstanceId,expectedPolicyRevision:b.access.policyRevision,selectionRevision:b.access.selectionRevision});
    await api.preference({key:'firstRun',value:false}); closePanel(); await refresh(); navigate('overview');
  };
  const checkHooks = async body => {
    const status = h('p',{className:'desktop-check-note',testId:'hook-check-status'},text('正在检查本地运行时…','Checking the local runtime…')); body.append(status);
    try {
      const s = await api.hookStatus();
      status.textContent = !s.runtimeAvailable ? text('未找到本地运行时。可选择已有活动目录或使用演示。','Local runtime not found. Choose existing events or try the demo.') : s.installed ? text(`已安装；${s.trust==='TRUSTED_DEFINITIONS'?'五项定义已受信任':'仍需在客户端确认信任'}。本应用目录实际事件：${s.realEvents??0}。安装和信任不代表已收到活动。`,`Installed; ${s.trust==='TRUSTED_DEFINITIONS'?'all five definitions are trusted':'client trust still needs review'}. Actual records in this app’s directory: ${s.realEvents??0}. Installation and trust do not prove activity.`) : text('本地运行时可用，尚未确认活动插件已安装。','Local runtime available; observation plugin installation is unconfirmed.');
      if(s.installed&&s.installationTarget!=='CURRENT_PROFILE')status.append(h('p',{},s.installationTarget==='OTHER_PROFILE'?text('插件由另一份 APS 安装。可以连接已核验的活动目录；重新安装或移除需回到原安装，现有配置和历史文件保留。','Another APS installation owns this plugin. Connect its verified activity directory here; installation or removal stays with the original owner. Existing configuration and history are retained.'):text('无法核验插件的安装目标，不会覆盖现有配置。','The plugin target is unverified; existing configuration will not be overwritten.')));
      if(s.definitions?.length)status.append(h('ul',{},s.definitions.map(d=>h('li',{},`${d.event} · ${d.enabled?'enabled':'disabled'} · ${d.trust}`))));
      if(s.desktopProbe)status.append(button(text('连接已安装的桌面活动插件','Connect the installed desktop observer'),()=>doAction(async()=>{const result=await api.hookConnectInstalled();await refresh();notify(text(result.observerActive?'观察入口已开启；等待真实的新活动。':'入口状态未知，请检查连接。',result.observerActive?'Observer active; waiting for real new activity.':'Observer status unknown; check the connection.'));}),{kind:'primary',testId:'connect-installed-desktop'}));
      if(s.existingProbe)status.append(button(text('连接已安装的旧活动插件','Connect the existing observation plugin'),()=>doAction(async()=>{await api.hookConnectExisting();await refresh();notify(text('已选择旧活动目录；请留意最后活动时间，旧记录不代表正在执行。','Existing event directory selected. Old records do not establish current execution.'));}),{kind:'quiet',testId:'connect-existing-probe'}));
    } catch { status.textContent=text('安装与信任状态未知；没有把它当作已连接。','Installation and trust are unknown; this is not a connection confirmation.'); }
  };
  const hookSetup = () => {
    const body=h('div',{},h('ol',{className:'desktop-hook-guide'},
      h('li',{},text('检查：先看安装、信任和实际活动三个独立结果。','Check installation, trust and actual activity separately.')),
      h('li',{},text('安装：点击下方授权配置，只安装本应用的独立活动插件。已有旧插件不会被删除。','Install: explicitly approve this app’s observation plugin below. Existing plugins are preserved.')),
      h('li',{},text('信任：在原客户端的 Hook 审阅提示中，仅批准本应用的五项定义。没有审阅入口时，可用官方 Codex /hooks 查看；APS 没有绕过信任的接口。','Trust: review only this plugin’s five definitions in the client. If there is no review entry, official Codex /hooks can inspect them. APS cannot bypass trust.')),
      h('li',{},text('验证：开始观察后，在原客户端发送一个新的本地回合，再检查事件数量和最新时间。旧任务可以继续使用，但需要宿主为新回合投递事件。','Verify: enable observation, send a new local turn in the client, then check record count and latest time. Existing tasks need their host to emit events for the new turn.')),
      h('li',{},text('选任务：在任务列表中选择一个。Work 仅接收活动元数据；Codex 的任务内容需要一次明确授权，正常退出后会记住。','Choose a task. Work supplies activity metadata only; Codex content requires one explicit consent, remembered after a clean exit.'))),
      h('p',{},text('不会记录私人提示词、回复、工具参数或输出。五项活动：会话开始、用户提交、工具开始、工具结束、回合停止。','Private prompts, replies, tool arguments and output are not recorded. The five activities are session start, prompt submission, tool start, tool end and turn stop.')),
      h('div',{className:'desktop-button-row'},button(text('检查连接条件','Check requirements'),()=>checkHooks(body),{testId:'hook-check'}),button(text('授权配置新 Hook','Authorize new Hook'),()=>doAction(async()=>{const plan=await api.hookPrepare();const result=await api.hookInstall({planId:plan.planId});if(result.installed)notify(text('已安装。请在客户端审阅并信任五项 Hook，然后发起新的本地任务。','Installed. Review and trust the five Hooks in your client, then start a new local task.'));}),{testId:'hook-install'}),
      button(text('选择已有事件目录','Choose existing events'),()=>doAction(async()=>{await api.chooseDirectory({kind:'workHooksDir'});await refresh();}),{kind:'quiet',testId:'choose-hook-directory'})),
      h('p',{className:'desktop-check-note'},text('安装、信任、收到活动是三个不同状态。客户端没有投递事件时，运行状态保持未知。','Installation, trust and observed activity are separate states. Runtime activity remains unknown until the client sends events.')),
      button(text('移除本应用的 Hook','Remove this app’s Hook'),()=>doAction(async()=>{await api.hookRemove();notify(text('本应用插件已移除；历史事件保留。','This app’s plugin was removed; historical events are retained.'));}),{kind:'quiet',testId:'hook-remove'}));
    panel(text('Work 本地活动连接','Work local activity connection'),body,button(text('开始观察已授权的活动','Observe authorized activity'),()=>doAction(()=>switchSource('work-hooks')),{kind:'primary',testId:'start-work-monitoring'})); checkHooks(body);
  };
  const onboarding = () => {
    const body=h('div',{},h('p',{className:'desktop-intro'},text('选择你要观察的本地 AI 任务。任务内容和总体进度只有在来源提供可靠数据时才会显示。','Choose a local AI task to observe. Task content and overall progress are shown only when reliable source data is available.')),
      h('div',{className:'desktop-onboard-grid'},
        h('section',{className:'desktop-choice'},h('h3',{},'Work locally'),h('p',{},text('检查活动观察插件，接收工具开始、结束及回合事件。','Check the observation plugin for tool and turn events.')),button(text('连接 Work 本地任务','Connect local Work'),hookSetup,{kind:'primary',testId:'onboard-work'})),
        h('section',{className:'desktop-choice'},h('h3',{},'Codex'),h('p',{},text('发现本地会话；选中并明确授权后才读取任务内容。','Discover local sessions. Reading task content requires explicit authorization.')),button(text('连接 Codex 本地任务','Connect local Codex'),()=>doAction(()=>switchSource('local')),{kind:'primary',testId:'onboard-codex'}))),
      h('p',{className:'desktop-check-note'},text('程序会自动管理采集后台，不需要浏览器、命令行或另装 Node.js。','The app manages its collector automatically. No browser, command line or external Node.js is required.')));
    panel(text('欢迎使用 Agent Progress Studio','Welcome to Agent Progress Studio'),body,h('div',{className:'desktop-button-row'},button(text('先看明确标记的演示','Try the labeled demo'),()=>doAction(()=>switchSource('demo')),{kind:'quiet',testId:'onboard-demo'}),button(text('稍后检查','Check later'),()=>doAction(async()=>{await api.preference({key:'firstRun',value:false});closePanel();}),{kind:'quiet',testId:'onboard-later'})));
  };
  const settingsPanel = () => {
    const toggle = (key,label,note) => {
      const checkbox=h('input',{type:'checkbox',checked:!!current[key],testId:'desktop-'+key,onChange:event=>doAction(async()=>{current=await api.preference({key,value:event.target.checked});})});
      return h('label',{className:'desktop-preference'},checkbox,h('span',{},h('strong',{},label),h('small',{},note)));
    };
    panel(text('桌面设置与连接','Desktop settings and connection'),h('div',{},
      toggle('closeToTray',text('主窗口关闭后在托盘继续监控','Keep monitoring after main-window close'),text('浮窗打开时关闭主窗口也会保留监控；完全退出请点退出。','An open floating monitor also keeps collection active. Use Quit to stop everything.')),
      toggle('openAtLogin',text('开机启动','Start at Windows login'),text('默认关闭。只登记本应用。','Off by default. Registers only this app.')),
      h('div',{className:'desktop-button-row'},button(text('重新检查首次连接','Check setup again'),onboarding,{testId:'desktop-onboarding'}),button(text('Work 活动连接','Work activity connection'),hookSetup,{testId:'desktop-hooks'}),
        button(text('显示与配置悬浮窗','Show floating monitor'),()=>doAction(()=>api.floatingControl({action:'show'})),{testId:'desktop-floating-settings'}),
        button(text('消息提醒设置','Notification settings'),()=>doAction(noticeSettings),{testId:'desktop-notices'}),
        button(text('缓存与存储','Cache & storage'),()=>doAction(cacheSettings),{testId:'desktop-cache'}),
        button(text('自动关机','Automatic shutdown'),powerPanel,{testId:'desktop-power-settings'}),
        button(text('选择 Codex 数据目录','Choose Codex data directory'),()=>doAction(async()=>{await api.chooseDirectory({kind:'codexHome'});await refresh();}),{testId:'choose-codex-directory'}),
        button(text('高级信息与权限','Advanced information and permissions'),()=>{closePanel();navigate('connection');},{testId:'desktop-advanced'}),
        button(text('查看本地诊断日志','View local diagnostic log'),()=>doAction(async()=>{const log=await api.logs();panel(text('本地诊断','Local diagnostics'),h('pre',{},log.text || text('暂无诊断记录','No diagnostic entries')));}),{testId:'desktop-logs'})),
      h('p',{className:'desktop-check-note'},text('退出会停止资源采集。已配置的独立旧探针由其原安装器管理；移除按钮只处理本应用安装的插件。','Quitting stops collection. Existing independent probes remain owned by their original installer; removal affects only this app’s plugin.'))));
  };
  const cacheSettings=async()=>{const prefs=await api.cacheStatus();panel(text('本应用缓存与存储','App cache & storage'),h('div',{},h('p',{},text('默认每天清理一次本应用浏览器缓存与代码缓存，并提示结果。不会删除 Work/Codex 会话、授权设置、报告或旧插件历史。','The app clears its own browser/code cache daily and reports the outcome. It never deletes Work/Codex sessions, grants, reports or old plugin history.')),h('label',{className:'desktop-preference'},h('input',{type:'checkbox',checked:prefs.enabled,testId:'cache-auto',onChange:e=>doAction(()=>api.cachePreference({enabled:e.target.checked}))}),text('自动清理（每天）','Automatic daily cleanup')),h('p',{},text(`最近清理：${prefs.lastClean?new Date(prefs.lastClean).toLocaleString():'尚未执行'}；结果：${prefs.lastResult||'未知'}`,`Last cleanup: ${prefs.lastClean?new Date(prefs.lastClean).toLocaleString():'Not yet run'}; outcome: ${prefs.lastResult||'Unknown'}`)),h('p',{className:'desktop-check-note'},text('本应用新活动目录最多保留 8,000 个元数据文件；只轮换本应用文件，原有独立探针目录保持不变。','This app retains at most 8,000 metadata files in its own activity directory. Independent legacy probe directories are unchanged.')),button(text('立即清理本应用缓存','Clear app cache now'),()=>doAction(async()=>{await api.cacheClean();await cacheSettings();}),{testId:'cache-clear'})));};
  const powerPanel=()=>doAction(()=>readPrivate('powerStatus',value=>{
    const a=value.access,scope={authorityInstanceId:a.authorityInstanceId,expectedPolicyRevision:a.policyRevision,selectionRevision:a.selectionRevision},checked=new Set(value.tasks.filter(t=>t.authorized).map(t=>t.key));let mode='all';
    const modeSelect=h('select',{testId:'power-mode',onChange:e=>mode=e.target.value},h('option',{value:'all'},text('全部受监控任务','All monitored tasks')),h('option',{value:'selected'},text('指定任务','Selected tasks')));
    const stable=h('input',{type:'number',min:120,max:3600,value:120,testId:'power-stability','aria-label':text('稳定观察秒数','Stability seconds')}),countdown=h('input',{type:'number',min:60,max:3600,value:60,testId:'power-countdown','aria-label':text('倒计时秒数','Countdown seconds')});
    const refreshPanel=()=>{closePanel();setTimeout(powerPanel,0);};
    panel(text('自动关机','Automatic shutdown'),h('div',{},h('p',{className:'desktop-power-state',testId:'power-state'},powerLabel(value.state,getLanguage())+(value.simulation?text(' · 模拟，不关闭 Windows',' · Simulated; Windows stays on'):'')),h('p',{},text('全部纳入范围的工作结束后自动执行，不再询问。默认关闭，可随时取消。','Automatically executes after all work in scope ends. No later confirmation. Off by default; cancel any time.')),modeSelect,
      h('div',{className:'desktop-power-tasks'},value.tasks.length?value.tasks.map(t=>h('label',{className:'desktop-preference'},h('input',{type:'checkbox',checked:checked.has(t.key),disabled:!t.authorized,onChange:e=>e.target.checked?checked.add(t.key):checked.delete(t.key)}),h('span',{},h('strong',{},`${t.origin==='codex'?'Codex':t.origin==='work-local'?'Work':text('来源未知','Unknown')} · ${t.label}`),h('small',{},t.finalComplete?text('工作与后台执行已确认结束','Work and background execution ended'):t.running?text('仍在执行','Still running'):powerReason(t.backgroundReason,getLanguage())||text('结束状态尚未确认','End state unconfirmed'))))):h('p',{},text('尚无已授权的可监控任务。','No authorized task is available.'))),
      h('div',{className:'desktop-button-row'},h('label',{},text('稳定观察（秒）','Stability (seconds)'),stable),h('label',{},text('倒计时（秒）','Countdown (seconds)'),countdown)),
      h('p',{className:'desktop-check-note'},text('只覆盖已接入并授权的任务。会检查回合、工具、后台执行和已声明待处理项；总体项目进度仍按证据显示。数据缺失或断线时保持等待。','Only connected, authorized tasks are covered. Turns, tools, background work and declared pending items are checked. Overall project progress remains evidence-based. Missing data or a disconnection blocks shutdown.')),h('details',{},h('summary',{},text('能力限制','Capability limits')),h('p',{},text('Work 活动元数据无法提供全部后台执行状态；本机 Codex 官方控制接口当前也可能不可用。此时不会开始关机倒计时。未同时跟踪的其他已授权会话保持未知。','Work activity metadata cannot establish all background execution. The official local Codex control interface may be unavailable. These cases block countdown; other authorized but untracked sessions remain unknown.'))),button(text('刷新状态','Refresh'),refreshPanel,{kind:'quiet'})),h('div',{className:'desktop-button-row'},button(text('开启','Enable'),()=>doAction(async()=>{await api.powerArm({mode,...(mode==='selected'?{ids:[...checked]}:{}),stabilitySeconds:Number(stable.value),countdownSeconds:Number(countdown.value),...scope});refreshPanel();}),{testId:'power-enable',kind:'primary',disabled:!value.tasks.some(t=>t.authorized)}),button(text('取消自动关机','Cancel automatic shutdown'),()=>doAction(async()=>{await api.powerCancel();refreshPanel();}),{testId:'power-cancel'}),button(text('关闭面板','Close panel'),closePanel)));privateOpen=true;
  }));
  const noticeHistory=()=>doAction(()=>readPrivate('noticeHistory',value=>{
    const names={reply:text('新的 Agent 回复','New Agent reply'),failure:text('活动报告失败','Activity failed'),attention:text('需要关注','Attention needed'),'turn-ended':text('本回合结束（不代表项目完成）','Turn ended (not project completion)'),activity:text('新的任务活动','New task activity')};
    panel(text('当前授权范围内的提醒','Notices in the current authorized scope'),h('div',{},value.notices.length?value.notices.slice().reverse().map(n=>h('p',{},`${n.sessionId} · ${names[n.code]||n.code}${n.preview?' · '+n.preview:''}`)):h('p',{},text('暂无提醒；切换会话或撤销权限会清空此列表。','No notices. Selection or permission changes clear this list.'))));privateOpen=true;
  }));
  const noticeSettings=async()=>{
    const prefs=await api.noticeStatus();const toggles=[['enabled','开启重要事件提醒','Important event alerts'],['whenHidden','隐藏到托盘后仍提醒','Alerts while hidden'],['ordinaryTools','普通工具活动也提醒','Ordinary tool alerts'],['messagePreview','显示已授权 Codex 回复摘要','Preview authorized Codex replies']];
    const save=(key,value)=>doAction(()=>api.noticePreference({key,value}));
    const input=(key,min,max,step,label)=>h('label',{className:'desktop-preference'},h('span',{},label),h('input',{type:'range',min,max,step,value:prefs[key],testId:'notice-'+key,onChange:e=>save(key,Number(e.target.value))}));
    panel(text('半透明穿透提醒','Translucent click-through alerts'),h('div',{},h('p',{},text('提醒不会接收点击或抢夺焦点。普通事件默认关闭；抽屉展开时直接看面板。','Alerts neither take clicks nor focus. Ordinary events are off by default; an expanded drawer shows activity directly.')),toggles.map(([key,zh,en])=>h('label',{className:'desktop-preference'},h('input',{type:'checkbox',checked:prefs[key],testId:'notice-'+key,onChange:e=>save(key,e.target.checked)}),h('span',{},text(zh,en)))),input('opacity',.5,1,.05,text('不透明度','Opacity')),input('duration',2,30,1,text('显示秒数','Display seconds')),h('p',{className:'desktop-check-note',testId:'notice-position'},text('消息自动贴着浮窗或侧栏显示，随移动、收缩和展开一起跟随。','Messages attach to the monitor and follow its movement, collapse and expansion.')),h('p',{className:'desktop-check-note'},text('默认不展示任务正文。摘要仅适用于已授权且明确属于 Codex 的消息；Work 活动元数据无法提供聊天消息。权限变化时队列和历史清空。','Body previews are off by default. A preview requires authorized Codex content; Work metadata cannot provide chat messages. Permission changes clear queue and history.')),button(text('查看提醒历史','Notice history'),noticeHistory,{testId:'notice-history'})),h('div',{className:'desktop-button-row'},button(text('设置快捷键','Configure shortcut'),()=>{const input=h('input',{value:current.shortcut,'aria-label':'Shortcut',testId:'shortcut-value'});panel(text('浮窗显示 / 隐藏快捷键','Floating visibility shortcut'),h('div',{},h('p',{},text('例如 Control+Alt+Shift+A；不会覆盖其他程序已注册的快捷键。','For example Control+Alt+Shift+A. Existing shortcuts from other apps are not overridden.')),input),button(text('保存','Save'),()=>doAction(async()=>{current=await api.shortcut({value:input.value});closePanel();}),{testId:'shortcut-save'}));}),button(text('关闭','Close'),closePanel)));
  };
  async function update() {
    try { current=await api.status(); } catch { return; }
    const key=JSON.stringify([current.state,current.closeToTray,en(),powerState]); if(key===rendering)return;rendering=key;
    root.replaceChildren(h('div',{className:'desktop-toolbar'},h('span',{},badge(text(current.state==='running'?'监控后台开启':'监控后台暂停',current.state==='running'?'Collector active':'Collector paused'),current.state==='running'?'auto_verified':'unknown'),h('small',{},text('桌面版 · 全部数据保存在本机','Desktop Edition · All data stays local'))),h('div',{className:'desktop-button-row'},
      button(text('打开浮窗','Floating monitor'),()=>doAction(()=>api.floatingControl({action:'show'})),{testId:'desktop-floating',kind:'quiet'}),
      button(text('桌宠','Desktop pet'),petPanel,{testId:'desktop-pet',kind:'quiet'}),
      button(text('自动关机','Automatic shutdown'),powerPanel,{testId:'desktop-power',kind:'quiet',title:powerLabel(powerState.state,getLanguage())}),
      powerState.state==='COUNTDOWN'?button(String(powerState.remainingSeconds)+'s · '+text('取消','Cancel'),()=>api.powerCancel(),{testId:'desktop-power-countdown'}):null,
      button(text(current.state==='running'?'暂停采集':'恢复采集',current.state==='running'?'Pause collection':'Resume collection'),()=>doAction(async()=>{current.state==='running'?await api.pause():await api.resume();await refresh();}),{testId:'desktop-monitor-toggle',kind:'quiet'}),
      button(text('设置与连接','Settings & connection'),settingsPanel,{testId:'desktop-settings',kind:'quiet'}),button(text('退出','Quit'),()=>api.quit(),{testId:'desktop-quit',kind:'quiet'}))));
  }
  await update(); if(current?.firstRun)onboarding();
  api.onMainView(view=>{if(view==='pet')petPanel();else if(view==='settings')settingsPanel();else if(view==='notifications')noticeHistory();else if(view==='power')powerPanel();else navigate(view);});
  api.onPrivateClear(()=>{if(privateOpen)closePanel();});
  api.onMaintenance(value=>notify(text(`本应用缓存清理结果：${value.result}；历史会话与授权保留。`,`App cache cleanup: ${value.result}; sessions and grants retained.`)));
  api.onPower(value=>{powerState=value;update();});
  setInterval(update,1500);
}
