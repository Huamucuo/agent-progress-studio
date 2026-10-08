import { h, icon, button, badge, card, empty, ring, showDialog } from './components.mjs';
import { strings } from './i18n.mjs';

let language = localStorage.getItem('aps-language') || 'zh-CN';
if (!strings[language]) language = 'zh-CN';
let theme = localStorage.getItem('aps-theme') === 'light' ? 'light' : 'dark';
let view = sessionStorage.getItem('aps-view') || 'overview';
if (!['overview', 'acceptance', 'evidence', 'events', 'connection'].includes(view)) view = 'overview';
let snapshot, token, sessions = [], eventFilter = '', errorFilter = false, streamConnected = true, signature = '', connecting = false, endpointDraft = '';
const t = key => strings[language][key] || key;
const isHooks = () => snapshot?.source.mode === 'work-hooks';
const originLabel = origin => t(origin === 'work-local' ? 'workOrigin' : origin === 'codex' ? 'codexOrigin' : 'unknownOrigin');
const numeric = value => value == null ? t('unknown') : new Intl.NumberFormat(language).format(value);
const date = value => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(value)) : t('unknown');
const criterionTitle = c => language === 'en' && c.titleEn ? c.titleEn : c.title;
const status = s => badge(s === 'completed' ? (language === 'en' ? 'Completed' : '已完成') : t(s), s);
const metrics = (label, value, note, className = '') => h('div', { className: `metric ${className}` }, h('span', { className: 'metric-label' }, label), h('strong', {}, value), h('span', { className: 'metric-note' }, note));
function notify(text) { const el = document.getElementById('toast'); el.textContent = text; el.classList.add('visible'); setTimeout(() => el.classList.remove('visible'), 4500); }
async function request(url, data) {
  const response = await fetch(url, data ? { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-APS-Token': token }, body: JSON.stringify(data) } : undefined);
  const result = await response.json(); if (!response.ok) throw new Error(result.error || response.statusText); return result;
}
async function action(url, data) { try { snapshot = await request(url, data); signature = ''; render(); } catch (e) { notify(e.message); } }
function navigate(next) { view = next; sessionStorage.setItem('aps-view', view); render(); }
function elapsed() {
  if (!snapshot?.task.startedAt) return t('unknown');
  const task = snapshot.task;
  const end = snapshot.source.mode === 'demo' ? task.lastEventAt : task.endedAt || (task.phase === 'executing' ? new Date().toISOString() : null);
  if (!end) return t('unknown');
  const seconds = Math.max(0, Math.floor((Date.parse(end) - Date.parse(task.startedAt)) / 1000));
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;
}
function privacy() { showDialog(t('privacy'), h('p', {}, t('privacyDetail')), null, t('close')); }
function render() {
  if (!snapshot) return;
  document.documentElement.lang = language; document.documentElement.dataset.theme = theme;
  const root = document.getElementById('app');
  const sidebar = h('aside', { className: 'sidebar' },
    h('a', { className: 'brand', href: '#', onClick: e => { e.preventDefault(); navigate('overview'); } }, h('img', { src: '/logo.svg', alt: '', width: 38, height: 38 }), h('span', {}, 'Progress', h('b', {}, 'Studio'), h('small', {}, 'AGENT / V0.1'))),
    h('div', { className: 'workspace-label' }, t('workspace')),
    h('nav', { 'aria-label': t('workspace') }, ['overview', 'acceptance', 'evidence', 'events', 'connection'].map(key => button(t(key), () => navigate(key), { className: `nav-button ${view === key ? 'active' : ''}`, icon: key, testId: `nav-${key}`, 'aria-current': view === key ? 'page' : null },))),
    h('div', { className: 'sidebar-bottom' }, h('div', { className: 'privacy-card' }, icon('lock'), h('strong', {}, t('localOnly')), h('p', {}, t('localDetail')), button(t('privacy') + ' ↗', privacy, { kind: 'link' })), h('div', { className: 'version' }, h('span', { className: 'status-dot' }), 'AGENT PROGRESS STUDIO', h('span', {}, '0.1'))));
  const topbar = h('header', { className: 'topbar' }, h('div', { className: 'breadcrumb' }, h('span', {}, 'Studio'), h('span', {}, '/'), h('strong', {}, t(view))),
    h('div', { className: 'top-actions' }, badge(streamConnected ? t('connected') : t('reconnecting'), streamConnected ? 'auto_verified' : 'unknown'),
      button(language === 'zh-CN' ? 'EN' : '中文', () => { language = language === 'zh-CN' ? 'en' : 'zh-CN'; localStorage.setItem('aps-language', language); render(); }, { className: 'language-button', testId: 'language-toggle', 'aria-label': 'Switch language' }),
      button('', () => { theme = theme === 'dark' ? 'light' : 'dark'; localStorage.setItem('aps-theme', theme); render(); }, { className: 'icon-button', icon: theme === 'dark' ? 'sun' : 'moon', testId: 'theme-toggle', 'aria-label': theme === 'dark' ? 'Light theme' : 'Dark theme' }),
      h('a', { className: 'button export-button', href: '/api/export', download: 'agent-progress-report.json', title: t('exportHint'), 'data-testid': 'export' }, icon('download'), t('export'))));
  const pages = { overview: overviewView, acceptance: acceptanceView, evidence: evidenceView, events: eventsView, connection: connectionView };
  root.replaceChildren(sidebar, h('div', { className: 'workspace' }, topbar, h('main', { id: 'main' }, pages[view]()), h('footer', { className: 'page-footer' }, h('span', {}, t('observatory')), h('span', {}, t('noEta') + ' · ' + t('readonly')))));
}
function pageHeading(title, subtitle, actionNode) { return h('div', { className: 'page-heading' }, h('div', {}, h('p', { className: 'eyebrow' }, 'AGENT PROGRESS STUDIO / 01'), h('h1', {}, title), h('p', { className: 'subtitle' }, subtitle)), actionNode); }
function sourceBanner() {
  const demo = snapshot.source.mode === 'demo';
  return h('div', { className: `source-banner ${demo ? 'demo-banner' : ''}` }, h('span', { className: 'banner-mark' }, demo ? '◈' : '◎'), h('div', {}, h('strong', {}, demo ? t('demoNotice') : isHooks() ? `${t('hooksTitle')} · ${originLabel(snapshot.source.origin)}` : t('localNotice')), h('span', {}, demo ? t('demoDetail') : isHooks() ? t('hooksDetail') : snapshot.source.mode === 'local' ? t('localHint') : t('rpcHint'))), button(t('changeSource'), () => navigate('connection'), { kind: 'link', icon: 'arrow' }));
}
function progressCard() {
  const a = snapshot.acceptance;
  return card(t('progress'), t('progressHint'), h('div', { className: 'progress-body' }, h('div', { className: 'ring-wrap' }, ring(a.percent), h('div', { className: 'ring-label' }, h('strong', { 'data-testid': 'coverage-value' }, a.percent == null ? '—' : a.percent + '%'), h('span', {}, t('acceptance')))),
    h('div', { className: 'progress-explanation' }, h('strong', {}, a.total ? `${a.met} / ${a.total}` : '—'), h('span', {}, a.total ? t('criteriaMet') : t('noCriteria')), h('p', {}, a.total ? `${t('weight')}: ${a.earnedWeight} / ${a.totalWeight}` : t(isHooks() ? 'hookUnknown' : 'noCriteriaDetail')), button(t('definition') + ' ↗', () => showDialog(t('definition'), h('p', {}, t('formula')), null, t('close')), { kind: 'link' }))), badge(t(snapshot.task.phase), snapshot.task.phase));
}
function stateSummary() {
  return h('div', { className: 'state-summary' }, ['implemented', 'auto_verified', 'awaiting_human', 'failed', 'unknown', 'accepted'].map(s => button(h('span', {}, h('b', { className: `state-number ${s}` }, snapshot.acceptance.counts[s] || 0), h('span', {}, t(s))), () => navigate('acceptance'), { className: `state-tile ${s}` })));
}
function planCard() {
  const plan = snapshot.task.plan;
  return card(t('plan'), t('planHint'), plan.length ? h('ol', { className: 'plan-list' }, plan.map((step, i) => h('li', { className: step.status }, h('span', { className: 'step-index' }, step.status === 'completed' ? icon('check') : String(i + 1).padStart(2, '0')), h('span', { className: 'step-text' }, step.step), status(step.status)))) : empty(t('noPlan'), t('noPlanDetail')), h('span', { className: 'tiny mono' }, `${plan.length} ${t('planSteps')}`));
}
function toolsCard() {
  const tools = isHooks() ? snapshot.task.events.filter(e => ['PreToolUse', 'PostToolUse'].includes(e.name)).slice(-3).reverse().map(e => ({ name: e.metadata.tool_name || t('unknown'), status: e.metadata.tool_status || 'unknown', text: `${e.name} · ${date(e.at)}` })) : snapshot.task.tools.slice(-3).reverse();
  const rows = tools.map(tool => {
    const content = h('span', { className: 'tool-content' },
      h('span', { className: 'tool-glyph mono' }, '>_'),
      h('span', {}, h('strong', { className: 'mono' }, tool.name), h('small', {}, tool.text?.split('\n')[0].slice(0, 74) || t('noDetail'))),
      status(tool.status));
    return button(content, () => showDialog(tool.name, h('pre', {}, tool.text || t('noDetail')), null, t('close')), { className: `tool-row ${tool.status}` });
  });
  return card(t('tools'), t(isHooks() ? 'hookToolsHint' : 'toolsHint'), tools.length ? h('div', { className: 'tool-list' }, rows) : empty(t(isHooks() ? 'unknown' : 'noTools'), t(isHooks() ? 'hookUnknown' : 'noToolsDetail')));
}
function monitorSelector() {
  const source = h('select', { id: 'monitor-source', testId: 'monitor-source', disabled: connecting, onChange: e => selectSource({ mode: e.target.value, endpoint: snapshot.source.endpoint }) },
    [['work-hooks', 'hooksTitle'], ['local', 'logs'], ['demo', 'demoTitle'], ...(snapshot.source.mode === 'app-server' ? [['app-server', 'rpc']] : [])].map(([value, key]) => h('option', { value }, t(key))));
  source.value = snapshot.source.mode;
  const list = snapshot.sessions || [];
  const select = h('select', { id: 'monitor-session', testId: 'monitor-session', disabled: connecting || !list.length, onChange: e => selectSource({ mode: snapshot.source.mode, id: e.target.value, endpoint: snapshot.source.endpoint }) },
    !list.length ? h('option', { value: '' }, t(snapshot.source.mode === 'demo' ? 'demo' : 'noSessions')) : null,
    list.map(s => h('option', { value: s.id }, `${isHooks() ? originLabel(s.origin) : s.title || t('currentTask')} · ${s.id} · ${date(s.updatedAt)}`)));
  if (snapshot.task.id && !list.some(s => s.id === snapshot.task.id) && snapshot.source.mode !== 'demo') select.append(h('option', { value: snapshot.task.id }, `${snapshot.task.id} · ${t('unlistedSession')}`));
  select.value = snapshot.source.mode === 'demo' ? '' : snapshot.task.id;
  return h('section', { className: 'monitor-selector' }, h('label', { for: 'monitor-source' }, t('source'), source), h('label', { for: 'monitor-session' }, t('selectedTask'), select), h('small', {}, t('autoDiscoverHint')));
}
function monitorCard() {
  const m = displayMonitor(), task = snapshot.task;
  const active = ['tool_running', 'turn_running'].includes(m.status);
  const step = task.plan.find(p => p.status === 'inProgress');
  return h('section', { className: `monitor-card ${active ? 'observed-active' : ''}` },
    h('div', { className: 'monitor-top' }, h('div', {}, h('p', { className: 'eyebrow' }, t('agentStatus')), h('h2', { testId: 'monitor-status' }, h('span', { className: 'status-dot' }), t(m.status))), badge(snapshot.source.mode === 'demo' ? t('demo') : isHooks() ? originLabel(snapshot.source.origin) : 'Codex', snapshot.source.mode === 'demo' ? 'awaiting_human' : 'unknown')),
    h('h3', { className: 'monitor-title' }, isHooks() ? t('hookSession') : language === 'en' && task.titleEn ? task.titleEn : task.title || t('noTask')),
    h('p', { className: 'monitor-activity', testId: 'monitor-activity' }, m.toolName ? `${t('latestTool')}: ${m.toolName} · ${t(m.outcome)}` : step ? `${t('currentStep')}: ${step.step}` : t(isHooks() ? 'workContentUnknown' : 'noActivityDetail')),
    h('div', { className: 'monitor-meta' }, h('code', {}, task.id || '—'), h('span', {}, `${t('observedActivityAt')}: ${date(m.at)}`)),
    h('p', { className: 'monitor-note' }, t('observationHint')));
}
function displayMonitor() {
  const m = snapshot.monitor;
  if (!streamConnected) return { ...m, status: 'feed_unavailable' };
  const terminal = ['turn_completed', 'turn_interrupted', 'turn_failed', 'turn_stopped'].includes(m.observedStatus);
  const age = Date.now() - Date.parse(m.at);
  if (snapshot.source.mode !== 'demo' && snapshot.source.connected && !terminal && m.at && (!Number.isFinite(age) || age < 0 || age > m.staleAfterMs)) return { ...m, status: 'no_recent_evidence' };
  return m;
}
function refreshMonitorCard() {
  // This text-only region is separate from the focused source/session controls.
  if (view === 'overview') document.querySelector('.monitor-card')?.replaceWith(monitorCard());
}
function progressMeasures() {
  const p = snapshot.progress;
  return h('section', { className: 'progress-measures' },
    h('div', { className: 'progress-measure' }, h('h3', {}, t('overallProgress')), h('strong', { testId: 'overall-progress' }, t('unknown')), h('p', {}, t('overallHint'))),
    h('div', { className: 'progress-measure' }, h('h3', {}, t('planProgress')), h('strong', { testId: 'plan-progress' }, p.plan.total ? `${p.plan.completed} / ${p.plan.total}` : t('unknown')), h('p', {}, t('planProgressHint'))),
    h('div', { className: 'progress-measure' }, h('h3', {}, t('progress')), h('strong', { testId: 'coverage-value' }, p.acceptance.percent == null ? '—' : `${p.acceptance.percent}%`), h('p', {}, p.acceptance.total ? `${p.acceptance.met} / ${p.acceptance.total} · ${t('criteriaMet')}` : t('noCriteria')), button(t('acceptance') + ' ↗', () => navigate('acceptance'), { kind: 'link' })));
}
function replayControls() {
  if (!snapshot.replay) return null;
  return h('div', { className: 'replay-bar' }, h('span', { className: 'replay-label' }, icon('play'), t('replay'), h('span', { className: 'mono' }, `${snapshot.replay.index} / ${snapshot.replay.total}`)), h('div', { className: 'replay-actions' },
    button(t('restart'), () => action('/api/demo', { action: 'restart' }), { testId: 'replay-restart', icon: 'refresh', kind: 'quiet' }),
    button(snapshot.replay.playing ? t('pause') : t('play'), () => action('/api/demo', { action: snapshot.replay.playing ? 'pause' : 'play' }), { testId: snapshot.replay.playing ? 'replay-pause' : 'replay-play', kind: 'quiet' }),
    button(t('step'), () => action('/api/demo', { action: 'step' }), { kind: 'quiet' }), button(t('finish'), () => action('/api/demo', { action: 'finish' }), { testId: 'replay-finish', kind: 'quiet' })));
}
function overviewView() {
  const s = snapshot, u = s.task.usage;
  return [pageHeading(t('overview'), t('subheading')), monitorSelector(), monitorCard(), progressMeasures(),
    h('div', { className: 'content-grid' }, toolsCard(), eventsCard(true)), planCard(),
    h('section', { className: 'metrics-row' }, metrics(t('usage'), numeric(u.total), t('usageHint')), metrics(t('lastTokens'), numeric(u.last), `${t('context')}: ${numeric(u.contextWindow)}`), metrics(t('elapsed'), elapsed(), s.source.mode === 'demo' ? t('simulationTime') : t('timeHint'))),
    h('p', { className: 'metric-footnote' }, t('exactContext') + ' · ' + t('contextHint')),
    sourceBanner(), isHooks() ? hookStatus() : null,
    h('div', { className: 'content-grid lower-grid' }, gitCard(true), h('section', { className: 'card status-card' }, h('div', { className: 'card-heading' }, h('div', {}, h('h2', {}, t('acceptance')), h('p', {}, t('acceptanceHint')))), stateSummary())), replayControls(), diagnostics()];
}
function acceptanceView() {
  const rows = snapshot.acceptance.criteria;
  return [pageHeading(t('acceptance'), t('acceptanceHint')), sourceBanner(), h('div', { className: 'summary-grid' }, progressCard(), h('section', { className: 'card status-card' }, stateSummary())),
    card(t('condition'), t('formula'), rows.length ? h('div', { className: 'criteria-list' }, rows.map((c, i) => button(h('span', { className: 'criterion-layout' }, h('span', { className: 'criterion-number mono' }, String(i + 1).padStart(2, '0')), h('span', { className: 'criterion-name' }, h('strong', {}, criterionTitle(c)), h('small', {}, `${c.id} · ${t('weightUnit')} ${c.weight} · ${(c.checks || []).length} ${t('checkEvidence')}`)), status(c.status), icon('arrow')), () => criterionDialog(c), { className: 'criterion-row', testId: `criterion-${c.id}` }))) : empty(t('noCriteria'), t('noCriteriaDetail')))];
}
async function detail(kind, id, title) {
  try { const result = await request(`/api/evidence?kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(id || '')}`); showDialog(title, h('pre', { className: 'evidence-text' }, result.text || t('noDetail')), null, t('close')); } catch (e) { notify(`${t('fileError')}: ${e.message}`); }
}
function criterionDialog(c) {
  const fingerprint = snapshot.evidence.fingerprint, manifestHash = snapshot.evidence.manifestHash;
  const files = h('div', { className: 'detail-group' }, h('h3', {}, t('implementationEvidence')), (c.files || []).length ? c.files.map(file => button(h('span', {}, h('span', { className: 'mono' }, file), h('small', {}, snapshot.evidence.files.includes(file) ? t('present') : t('missing'))), () => detail('file', file, file), { className: 'detail-file', disabled: !snapshot.evidence.files.includes(file) })) : h('p', {}, '—'));
  const note = h('textarea', { placeholder: t('note'), rows: 3, testId: 'review-note', 'aria-label': t('note') }, c.review?.note || '');
  let modal;
  const save = async decision => {
    try { snapshot = await request('/api/review', { criterionId: c.id, decision, note: note.value, fingerprint, manifestHash }); modal.close(); render(); notify(t('saved')); } catch (e) { notify(e.message); }
  };
  modal = showDialog(criterionTitle(c), h('div', {}, h('div', { className: 'detail-status' }, status(c.status), h('span', { className: 'mono tiny' }, c.id)), c.description ? h('p', {}, c.description) : null, c.reviewStale ? h('p', { className: 'warning-text' }, t('staleReview')) : null,
    h('div', { className: 'detail-group' }, h('h3', {}, t('checkEvidence')), (c.checks || []).map((id, i) => h('div', { className: 'check-row' }, h('code', {}, id), status(snapshot.evidence.report?.current ? c.results[i]?.status || 'unknown' : 'unknown'))), button(t('viewReport'), () => detail('report', '', t('tests')), { kind: 'link' })), files,
    c.requiresHuman ? h('div', { className: 'detail-group' }, h('h3', {}, t('review')), h('p', {}, t('reviewHint')), note, c.review ? h('p', { className: 'tiny' }, `${date(c.review.at)} · ${c.review.note || ''}`) : null) : null), c.requiresHuman ? [button(t('clear'), () => save('clear'), { kind: 'quiet' }), button(t('reject'), () => save('reject'), { kind: 'danger' }), button(t('accept'), () => save('accept'), { kind: 'primary', testId: 'review-accept', disabled: !fingerprint || !(c.automated || (!(c.checks || []).length && c.implemented)) })] : null, t('close'));
}
function gitCard(compact = false) {
  const git = snapshot.evidence.git;
  return card(t('git'), git.available ? git.branch || 'HEAD' : t('gitHint'), git.available ? h('div', { className: 'git-content' }, h('div', { className: 'git-summary' }, h('div', {}, icon('git'), h('strong', {}, git.files.length), h('span', {}, t('files'))), button(t('diff'), () => detail('diff', '', t('git')), { kind: 'quiet', testId: 'open-diff' })),
    h('div', { className: 'file-list' }, git.files.slice(0, compact ? 3 : 100).map(file => button(h('span', {}, h('b', { className: 'file-status mono' }, file.status.trim()), h('span', { className: 'mono' }, file.path)), () => detail('file', file.path, file.path), { className: 'file-row' }))),
    compact ? null : h('div', { className: 'commit-list' }, h('h3', {}, t('commits')), git.commits.map(commit => button(h('span', {}, h('code', {}, commit.hash.slice(0, 8)), h('span', {}, commit.title)), () => detail('commit', commit.hash, commit.title), { className: 'commit-row' })))) : empty(t('noGit'), isHooks() ? t('hookUnknown') : git.reason || t('noGitDetail')));
}
function testsCard() {
  const report = snapshot.evidence.report;
  return card(t('tests'), t('testsHint'), report ? h('div', { className: 'test-content' }, badge(t(report.current ? 'current' : 'stale'), report.current ? 'auto_verified' : 'unknown'), h('div', { className: 'test-counts' }, ['passed', 'failed', 'skipped'].map(state => metrics(t(state), report.tests.filter(r => r.status === state).length, ''))), h('div', { className: 'test-list' }, report.tests.map(row => h('div', { className: 'check-row' }, h('code', {}, row.id), status(row.status)))), button(t('viewReport'), () => detail('report', '', t('tests')), { kind: 'quiet' })) : empty(t('noTests'), t('noTestsDetail')));
}
function evidenceView() { return [pageHeading(t('evidence'), t('acceptanceHint')), sourceBanner(), h('p', { className: 'workspace-path' }, t('workspacePath'), h('code', {}, snapshot.workspace || (snapshot.source.mode === 'demo' ? t('demo') : t('unknown')))), h('div', { className: 'content-grid' }, gitCard(), testsCard()), diagnostics()]; }
function eventRows(compact) {
  const events = [...snapshot.task.events].reverse().filter(e => (!errorFilter || e.status === 'failed' || e.metadata?.tool_status === 'failed') && (!eventFilter || JSON.stringify(e).toLowerCase().includes(eventFilter.toLowerCase()))).slice(0, compact ? 4 : 160);
  return events.length ? h('div', { className: 'event-list' }, events.map(e => button(h('span', { className: 'event-layout' }, h('span', { className: `event-mark ${e.status || e.kind}` }), h('span', { className: 'event-main' }, h('strong', {}, e.name || ({ usage: t('usage'), plan: t('plan'), task: t('currentTask'), turn: t('stage'), phase: t('stage') })[e.kind] || e.kind), h('small', {}, e.metadata?.tool_name ? `${e.metadata.tool_name} · ${t(e.metadata.tool_status)}` : e.text?.split('\n')[0].slice(0, 110) || e.title || t(e.status || e.phase || e.kind))), h('time', { className: 'mono tiny' }, date(e.at))), () => showDialog(e.name || e.kind, h('pre', {}, JSON.stringify(e, null, 2)), null, t('close')), { className: 'event-row', 'data-event-id': e.id, testId: e.kind === 'hook' ? `hook-${e.name}` : undefined }))) : empty(t('noEvents'), t(isHooks() ? 'hookWaiting' : 'eventHint'));
}
function eventsCard(compact = false) { return card(t(compact ? 'recentEvents' : 'events'), t('eventHint'), eventRows(compact), compact ? button(t('allEvents'), () => navigate('events'), { kind: 'link' }) : null); }
function eventsView() {
  const input = h('input', { type: 'search', placeholder: t('searchEvents'), value: eventFilter, 'aria-label': t('searchEvents'), onInput: e => { eventFilter = e.target.value; document.getElementById('event-results').replaceChildren(eventRows(false)); } });
  return [pageHeading(t('events'), t('eventHint')), isHooks() ? sourceBanner() : null, h('div', { className: 'event-filters' }, input, button(t(errorFilter ? 'all' : 'errors'), () => { errorFilter = !errorFilter; render(); }, { kind: errorFilter ? 'primary' : 'quiet' })), h('section', { className: 'card', id: 'event-results' }, eventRows(false))];
}
async function loadSessions() { try { sessions = (await request('/api/sessions')).sessions; render(); } catch (e) { notify(e.message); } }
async function selectSource(data) { connecting = true; render(); try { snapshot = await request('/api/source', data); sessions = []; eventFilter = ''; errorFilter = false; await loadSessions(); notify(t('success')); } catch (e) { notify(e.message); } finally { connecting = false; render(); } }
function hookStatus() {
  const d = snapshot.source.diagnostics;
  return h('section', { className: 'hook-status' },
    badge(t(snapshot.source.connected ? 'hookReceived' : 'hookWaiting'), snapshot.source.connected ? 'auto_verified' : 'unknown'),
    h('span', {}, `${t('receivedCount')}: ${numeric(d.received)}`),
    h('span', {}, `${t('hookDelay')}: ${d.lastIngestDelayMs == null ? t('unknown') : numeric(d.lastIngestDelayMs) + ' ms'}`),
    h('small', {}, t('hookDelayHint')));
}
function hookAttribution() {
  if (!snapshot.task.id) return null;
  return card(t('hookSession'), t('originHint'), h('div', { className: 'connection-content', testId: 'hook-origin' },
    h('code', { testId: 'selected-hook-session' }, snapshot.task.id), badge(originLabel(snapshot.source.origin)),
    h('div', { className: 'button-group' }, ['work-local', 'codex', 'unknown'].map(origin => button(t(origin === 'work-local' ? 'markWork' : origin === 'codex' ? 'markCodex' : 'clearOrigin'), () => action('/api/hook-origin', { sessionId: snapshot.task.id, origin }), { kind: 'quiet', testId: `origin-${origin}` })))));
}
function connectionView() {
  const endpoint = h('input', { type: 'text', value: endpointDraft || snapshot.source.endpoint || 'ws://127.0.0.1:4500', 'aria-label': t('endpoint'), id: 'endpoint', spellcheck: false, onInput: e => { endpointDraft = e.target.value; } });
  const list = snapshot.source.mode === 'demo' ? sessions : snapshot.sessions || sessions;
  return [pageHeading(t('sourceHeading'), t('sourceHint')), h('div', { className: 'connection-grid' },
    card(t('hooksTitle'), t('hooksDetail'), h('div', { className: 'connection-content' }, badge(t('experimental'), 'awaiting_human'), button(t('observeHooks'), () => selectSource({ mode: 'work-hooks' }), { kind: 'primary', disabled: connecting, testId: 'connect-hooks' }))),
    card(t('logs'), t('logsDetail'), h('div', { className: 'connection-content' }, badge(t('readonly'), 'auto_verified'), h('div', { className: 'button-group' }, button(t('connectLocal'), () => selectSource({ mode: 'local' }), { kind: 'primary', disabled: connecting, testId: 'connect-local' }), button(t('discover'), loadSessions, { kind: 'quiet' })))),
    card(t('rpc'), t('rpcDetail'), h('div', { className: 'connection-content' }, h('label', { for: 'endpoint' }, t('endpoint')), endpoint, button(connecting ? t('connecting') : t('connect'), () => selectSource({ mode: 'app-server', endpoint: endpoint.value }), { kind: 'quiet', disabled: connecting }))),
    card(t('demoTitle'), t('demoDescription'), h('div', { className: 'connection-content' }, badge(t('demo'), 'awaiting_human'), h('div', { className: 'button-group' }, button(t('showcase'), () => selectSource({ mode: 'demo', scenario: 'showcase' }), { kind: 'primary', testId: 'demo-showcase' }), button(t('noPlanDemo'), () => selectSource({ mode: 'demo', scenario: 'no-plan' }), { kind: 'quiet', testId: 'demo-no-plan' }))))),
    isHooks() ? hookStatus() : null, isHooks() ? hookAttribution() : null,
    card(t(isHooks() ? 'hookSessions' : 'logs'), `${list.length} · ${t('source')}`, list.length ? h('div', { className: 'session-list' }, list.map(s => button(h('span', { className: 'session-layout' }, h('span', {}, h('strong', {}, isHooks() ? originLabel(s.origin) : s.title || s.id), h('small', { className: 'mono' }, s.id), h('small', { className: 'mono' }, s.cwd)), h('span', {}, s.id === snapshot.task.id ? badge(t('selected'), 'auto_verified') : s.current ? badge(t('currentEnvironment'), 'auto_verified') : null, h('small', {}, `${t('lastUpdated')} ${date(s.updatedAt)}`)), icon('arrow')), () => selectSource({ mode: isHooks() ? 'work-hooks' : snapshot.source.mode === 'app-server' ? 'app-server' : 'local', id: s.id, endpoint: snapshot.source.endpoint }), { className: 'session-row', testId: `session-${s.id}` }))) : empty(t('noSessions'), t(isHooks() ? 'hookSetupHint' : 'noSessionsHint'), button(t('discover'), loadSessions, { kind: 'quiet' }))),
    card(t('boundaries'), '', h('p', { className: 'boundary-copy' }, t('boundariesDetail'))), diagnostics()];
}
function diagnostics() {
  const messages = [...(snapshot.evidence.errors || []), ...(snapshot.source.error ? [snapshot.source.error] : [])];
  if (snapshot.source.diagnostics.truncated) messages.push(language === 'en' ? 'Large log: only the latest 8 MiB were read; earlier state can be unknown.' : '日志过大：仅读取最新 8 MiB，较早状态可能未知。');
  if (snapshot.source.diagnostics.malformed) messages.push(`${snapshot.source.diagnostics.malformed} malformed JSONL records skipped`);
  if (!snapshot.source.connected) messages.push(t(isHooks() ? 'hookSetupHint' : 'noSessionsHint'));
  if (isHooks() && snapshot.source.diagnostics.rejected) messages.push(`${snapshot.source.diagnostics.rejected} · ${t('hookRejected')}`);
  if (isHooks() && snapshot.source.diagnostics.limitReached) messages.push(t('hookLimit'));
  if (snapshot.source.mode !== 'demo' && snapshot.task.lastEventAt && Date.now() - Date.parse(snapshot.task.lastEventAt) > 30000) messages.push(t(isHooks() ? 'hookStale' : 'liveStale'));
  if (snapshot.evidence.git.truncated) messages.push(language === 'en' ? 'Git evidence is truncated (200 files / 120,000 characters).' : 'Git 证据已截断（最多 200 个文件 / 120,000 字符）。');
  return messages.length ? h('div', { className: 'diagnostics' }, h('strong', {}, t('errorsTitle')), messages.map(m => h('p', {}, m))) : null;
}
async function boot() {
  try {
    token = (await request('/api/bootstrap')).token; snapshot = await request('/api/snapshot'); render();
    const stream = new EventSource('/api/stream');
    stream.onopen = () => { if (!streamConnected) { streamConnected = true; render(); } };
    stream.onerror = () => { streamConnected = false; render(); };
    stream.addEventListener('snapshot', event => {
      const next = JSON.parse(event.data), nextSignature = JSON.stringify({ ...next, observedAt: null }); snapshot = next;
      if (signature !== nextSignature) { signature = nextSignature; if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) render(); else refreshMonitorCard(); }
    });
    document.addEventListener('focusout', () => setTimeout(() => { if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) && !document.querySelector('dialog[open]')) render(); }, 0));
  } catch (e) { document.getElementById('app').replaceChildren(empty(t('transportError'), e.message, button(t('connect'), boot, { kind: 'primary' }))); }
}
boot();
// Expire a cached activity even when an open SSE connection silently stops delivering.
setInterval(() => {
  if (!snapshot || view !== 'overview') return;
  const label = document.querySelector('[data-testid="monitor-status"]');
  if (label && label.textContent !== t(displayMonitor().status)) refreshMonitorCard();
}, 1000);
