# Windows Desktop Edition implementation contract

User authorization: implement and package a usable Windows desktop application, without further per-module approval. Baseline: e02febd5184ee679372c779e1c1c07214dec8358. Branch: desktop-edition. Original RC4 and the public maintenance repository are untouched. No publishing is authorized.

Ruling: this is architectural work. The user's detailed specification and explicit instruction to proceed with actual development override the brainstorming skill's additional approval handoffs. Execute inline, retain evidence, and obtain one fresh whole-branch review at the end. This document records implementation rather than asking for another design approval.

Ruling: RC4 was not a clean security release. Import the project-owned, independently reviewed 0719924 boundary fixes as a traceable cherry-pick before desktop work. Its 133 synthetic tests pass here. Do not describe that as new real-host certification.

## Architecture

Electron 44.7.0 bundles Chromium and Node. electron-builder 26.15.3 produces a per-user NSIS installer and an extracted portable ZIP. Forge/Squirrel was evaluated; NSIS supports an assisted installation directory and explicit uninstall flow. No updater, telemetry, cloud API, or browser launch is included.

The existing StudioService remains the sole session authority and collector. DesktopHost owns its lifecycle. The renderer loads packaged assets through aps://studio/, with context isolation, sandboxing, no Node integration, denied external navigation/windows/permissions/network, and a narrow preload API. Every IPC request verifies the exact main frame and input shape. Session mutations retain the original instance/revision/selection CAS. Publication validates original dependencies before any IPC send or export. Subscription IDs and the existing StateReceiver reject old callbacks after reload, regrant, restart and selection changes. The desktop path opens no HTTP/SSE listener; the legacy web entry remains available for regression checks.

Logs contain timestamps and predefined diagnostic codes only, never raw exceptions, session messages, tool parameters, code or RPC frames. Closing exits by default; an explicit setting may keep monitoring in the tray. Pause/quit invalidate subscriptions, close collectors and flush authority storage. Startup registration is opt-in and defaults off. A single instance owns each data profile.

Hook setup is a separate user-confirmed action using official local marketplace/plugin commands, never a global-config rewrite or trust bypass. Only this application's own plugin can be removed. Trust remains a client action and is displayed as unknown until genuine evidence is available. A bundled recorder runs through the application's own executable and saves only the existing four/six metadata fields; no external Node installation is needed. An inactive recorder does not consume stdin. On Windows, the inherited pipe descriptor is read explicitly because the observed Electron process.stdin is empty. A fresh marker supplies a random named-pipe credential; the main process owns the opaque original observe permit and checks it at each asynchronous write boundary. Regrant creates a new ingress rather than renewing old producers. Pause, revoke and quit close the pipe; the expiring marker handles abnormal exits. Connecting an independent probe does not grant this app ownership of it. A same-user process that can read/write application files is outside OS isolation; the credential is a local capability, not proof of official host identity. Hook origin labels never grant body access.

## Implementation stages and gates

1. Isolated baseline and known boundary fixes: fixed history, synthetic positive/negative controls.
2. DesktopHost/IPC/export/recorder: reject wrong senders and stale scopes before I/O; lifecycle and delayed output regression.
3. Native window/tray/settings/onboarding: packaged-only content, single instance, explicit pause/background/exit, error recovery.
4. Monitor-first overview and transport reuse: identity, observed activity, recent actions, verified/pending work, three distinct progress measures; unknown stays unknown.
5. Build/third-party inventory: fixed versions, original icon, allowlisted ASAR, full dependency/runtime licensing, installer and portable assets without data.
6. Fresh-directory acceptance: actual native Electron process/window, no browser or external Node, install/uninstall, portable operation, all prior Node/browser/privacy regressions, controlled desktop IPC tests. Real new Work/Codex host steps remain manual unless actually performed.

## Acceptance ledger

| Required result | Actual operation | Evidence required |
| --- | --- | --- |
| Installer/uninstaller | Install into fresh path, open EXE, uninstall | exit codes, files and app-only registration cleanup |
| Portable/no Node | Fresh extraction; PATH excludes external Node/npm | running packaged process and native window |
| Lifecycle | Duplicate start, minimize, tray close, pause, restart, quit | one collector, invalidation, no listener, no post-quit reads |
| Connection | First-run guide, existing spool selection, managed Hook consent | distinct installed/trusted/observed states; no fake host success |
| Privacy | Wrong IPC frame, unknown source, revoke/regrant, old subscriptions/exports | denied I/O counts and stale-output rejection, positive allowed controls |
| Core UI | Work/Codex fixture updates, switch, language/theme, reviews, export | desktop screenshots and reopened saved report |
| Delivery | Fixed commit, allowlisted package, SHA256, licenses | package inventory and Work B handoff |

## Sources checked

- https://www.electronjs.org/docs/latest/tutorial/security/
- https://www.electronjs.org/docs/latest/tutorial/context-isolation
- https://www.electron.build/docs/nsis/
- https://www.electronforge.io/config/makers/squirrel.windows
- https://developers.openai.com/codex/hooks (official redirect to ChatGPT Learn)
- https://developers.openai.com/plugins/build/plugins

Build tools are pinned from official npm metadata. Local codex.exe public help verified plugin add/remove/marketplace add. Its availability and a synthetic CLI test do not prove an actual client's trust or notification delivery.

## Desktop .2 native floating extension, revised in .3

Branch desktop-floating starts at fixed desktop .1 cce2640e7a4b4d8ecdf45ceab03bbcfc67188594; RC4 and .1 are unchanged. The user subsequently authorized source synchronization to the existing GitHub repository; this does not authorize a binary Release. The source and runtime remain candidates awaiting Work B audit. Desktop .3 fixes the actual native edge region, popup attachment and authorized sidebar messages on fix/desktop-edge-compact from fixed .2 bf10664b4aa353f2b6912efb7de9069dbd84ecdd; see desktop/DESKTOP_EDGE_CHAT_WORK_B_HANDOFF.md for this incremental review.

`window-state.mjs` is a pure DIP geometry/state machine with FLOATING, FLOATING_COMPACT, DOCKED_EXPANDED, DOCKED_COLLAPSED and HIDDEN. `floating-window.mjs` applies native bounds/opacity/top/move constraints; only explicit drag release can auto-dock. Work areas exclude taskbars, disconnected/offscreen layouts recover safely. Peek is transient within collapsed mode: 2 × 24 DIP short cue → 28 × 44 DIP vertical APS tag (64 × 28 for horizontal edges) on pointer proximity → single click expanded drawer. A work-area-contained native backing frame satisfies Windows minimum size; Electron setShape clips both drawing and hit-testing to the visible cue. The renderer aligns with the clipped region, not the backing width. Hover state is never persisted. Native opacity is derived from the presentation state: collapsed idle 0.0, collapsed peek 0.5, expanded/free 1.0. Idle cues also ignore mouse events; proximity uses the existing main-process observer. The window has a transparent native background and no native shadow, so the unused/idle surface cannot paint a faded solid block. Screen GetPixel comparison and WindowFromPoint against an explicitly owned test background verify visual and hit-test pass-through. Schema 2 ignores the obsolete schema-1 drawerOpacity value; the UI shows the three-stage rule instead of a conflicting slider. Collapsed cues are non-focusable; expanded/free windows regain normal keyboard input. Opacity is reported from the actual BrowserWindow, not inferred by CSS. No cursor coordinates enter window publications or settings. Proximity checks run every 200 ms only while a collapsed cue or unpinned drawer is visible; hidden/free/pinned/quit stop that timer. The same main-process cursor observer handles peek and debounced drawer retraction, so renderer mouse-leave callbacks cannot act on a newer window mode. Position lock/top/pinned expansion are separate. Mouse-leave is debounced to avoid resize-induced hover oscillation. Software rendering defaults on to reduce this dashboard's GPU allocations; this is a measured tradeoff, not a universal memory guarantee.

`ipc-policy.mjs` registers exact own main frames with main/floating/notice roles and navigation generations. Floating cannot fetch a full snapshot, grant content/evidence/reply, install a Hook or export. Notice cannot fetch any session data. All use one DesktopHost and original SessionAccess/Publication authority. A reduced `monitor-model.mjs` projection contains short authorized titles, bounded tools/plans/criteria, deterministic facts/inferences and at most 20 public user/assistant messages (2,000 characters each) from confirmed Codex with a readable body permit. Known role/channel/phase filters reject hidden reasoning and unknown message phases; Work/unknown/denied conversation is empty. It contains no raw tool arguments/output/diffs/cwd; it is sealed with the **original** permit dependencies before final IPC publication. Hidden views unsubscribe and clear private state. Restart/selection/revoke clear all live projections before replacement; no private snapshots are stored in localStorage.

`notices.mjs` validates the same authority for ingestion, queue, popup, history and final output; original historical events do not replay as new notifications. Bounds follow actual native sidebar geometry, clamp within its display work area, and use an unfocusable click-through window. Preview defaults off and, if enabled, requires original content permission. `maintenance.mjs` serializes daily own Chromium-cache API calls only, emits a result notice and never recursively deletes user directories. Owned Hook retention rotates only its metadata namespace; independent event stores remain untouched. Hook install/remove verify the official plugin's local source target before and after native consent, so another profile cannot silently replace its marketplace/plugin.

`local-rpc.mjs` owns a scoped stdio proxy, processes structure plus request ID, discards unsolicited bodies and projects only allowlisted response fields. No arbitrary methods, shell, resume, credentials, daemon shutdown or automatic send retry. `reply.mjs` adds an independent default-off `reply` capability, requiring selected confirmed local Codex content permission. Native opt-in is CAS-checked; only a loaded exact thread can receive explicitly typed input via public turn/start or turn/steer. Revoke closes the owned proxy, prevents late send/output, clears drafts and disables reply. Work reply is unsupported.

`background-status.mjs` obtains public thread idle and background-terminal counts only under the original content scope. `power-manager.mjs` binds this result to the current service, policy/selection generation and activity fingerprint; stale or paginated status is UNKNOWN. `power.mjs` then gates initial opt-in → ended monitored execution → stability → cancelable countdown → fresh final proof → normal Windows shutdown. There is **no post-task confirmation**, no arming persistence, no forced process close, and no inferred whole-project percentage. Defaults cover all authorized monitored tasks in the **current source only**; untracked grants/new tasks/Work without reliable background status block completion. Native development and packaged acceptance pass a dry-run executor; no real Windows shutdown has been tested. A stale async executor cannot overwrite cancellation/new arming.

Current host limitations are deliberate fail-closed behavior: no actual callback from the newly installed desktop Hook; official local control socket unavailable; installed runtime schema lacks the newer experimental background method in current public docs. Real Codex read-only activity was displayed for one explicitly authorized existing task. Replies/unattended shutdown/new Work delivery remain unverified, not represented by fixtures as success.


Desktop .3 old-session correction: `discoverSessions` accepts one canonical priority UUID for the current/requested selection. Ordinary discovery retains its 300-candidate/60-row budget. A separate filename-only scan checks both standard active/archive stores (depth <= 4, <= 10,000 entries), excludes known Work IDs, and discards that UUID on duplicates or incomplete traversal; at most one selected metadata row is appended. `StudioService` passes its existing selected/requested ID, with no new origin labels, grants, body reader or output route. `DataGateway` and the existing bounded LogSource remain mandatory. New real-I/O regressions cover unknown/revoked zero opens, granted live append, duplicate aliases and budget exhaustion.
