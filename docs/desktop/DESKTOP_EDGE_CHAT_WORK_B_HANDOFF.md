# APS 0.2.0-desktop.3 — incremental audit handoff

2026-10-13 (America/Los_Angeles). Candidate only; no independent approval or public binary Release is claimed. Final source SHA, exact changed-file list, package hashes and verification records accompany the immutable delivery.

Baseline: `bf10664b4aa353f2b6912efb7de9069dbd84ecdd` (desktop .2). Branch: `fix/desktop-edge-compact`. RC4 `e02febd5184ee679372c779e1c1c07214dec8358` and earlier desktop artifacts remain unchanged. Windows numeric version: 0.2.0.3. Dependencies and original assets are unchanged.

## User-visible changes

- A collapsed edge is a short 2 × 24 DIP cue, flush with the selected display work-area boundary. On the tested 150% screen the OS drawing/hit region is 3 × 36 physical pixels. A vertical hover tag is 28 × 44 DIP; horizontal is 64 × 28 DIP. Click APS to open inward; dragging is unnecessary. Hover presentation is never persisted. Native opacity is 0% at rest (fully invisible, showing the underlying desktop), 50% nearby and 100% after expansion, on all four edges; schema-1 saved drawerOpacity is ignored. The old slider is replaced with the explicit state rule. Idle native mouse events pass through; a transparent native background and disabled shadow prevent a faded opaque block. Read-only Win32 screen-pixel comparison and hit testing are guarded against an explicitly owned synthetic background window.
- The native backing window stays within the work area. `setShape` excludes unused backing pixels from both drawing and hit-testing; CSS alone does not enforce this. Frameless Windows `thickFrame` is disabled to prevent nonclient input/activation changes at tiny edges. Free-floating resizing remains available through a bounded right-bottom grip and keyboard arrows. Collapsed/peek cues are non-focusable, so they do not take keyboard focus; expanded/free views restore keyboard input.
- Actual cursor proximity and unpinned drawer exit are controlled by the current main-process window state. No renderer mouse-leave timer can act on a later window mode. Hidden/free/pinned windows stop proximity polling. One existing floating window and collector are reused.
- A message popup attaches to the visible cue or drawer and follows movement, peek, expansion and all four edges. Legacy fixed-corner preferences cannot detach it. The UI exposes automatic attachment instead of a corner selector. Alerts remain click-through and non-focusable.
- The expanded drawer places the dashboard above a bounded message list and controlled reply composer. Incoming messages update without replacing the active input or losing an unsent draft. Session/permission changes clear private content and drafts. Public APS controls remain operable when collection pauses or permissions change.
- Short top/bottom drawers use a smaller scrollable dashboard so messages, input and the send button remain within the window. This is checked across all four edges in both interface languages.

## Selected old-session correction

A native preview of the previously authorized current task exposed a discovery regression: the file existed but newer directories filled the 300-candidate scan before its creation directory was reached. Its file size was not the cause; the existing LogSource already bounds reads at 8 MiB. A selected/requested canonical UUID now gets a separate metadata-only lookup across both standard stores, then stays in the recent list even outside its 60 rows. No new body permission or origin inference is introduced. The extra scan has a 10,000-entry/depth-4 budget and defaults deny on inaccessible/incomplete traversal or duplicate UUID aliases; known Work stays excluded.

Four synthetic regressions prove retention beyond 310 newer files, case-normalized duplicate rejection, fail-closed budget exhaustion, and actual body I/O zero while unknown/revoked. The permitted positive control monitors real file appends through the original gateway; revoked old publications cannot return. These tests do not substitute for the separately recorded real current-task desktop observation.

## Read and output boundaries

The existing SessionAccess / ResourceRegistry / DataGateway / Publication / StateReceiver architecture remains the authority. No alternate body reader, global permission, installation, external service or unauthenticated endpoint was added.

The reduced monitor projection now deliberately includes authorized public conversation excerpts for the requested sidebar. It still excludes raw task events, tool arguments/output, Git diffs, paths and arbitrary metadata. Codex origin plus **both granted and readable content flags** are required. Work/unknown/ungranted/revoked sources yield an empty conversation. DEMO is separate and visibly labeled.

Only known user/agent record or item types receive public-chat markers in normalization. `analysis`, unknown channels/phases, encrypted content and developer/system/reasoning records are rejected; no reasoning stream handler was added. Official `agentMessage.phase` values are `commentary` and `final_answer`; absence is compatible with older recognized message items. See [official app-server items](https://developers.openai.com/codex/app-server#items).

The message list is limited to the latest 20 entries and 2,000 characters per entry. Common credential formats are redacted; text is rendered with DOM text nodes, never HTML. This is bounded display of an existing explicitly authorized body source, not a complete secret detector or permission to collect other conversations. No new chat disk cache is created.

Original publication lineage and permits govern monitor reads, subscriptions, mutation replies and final IPC output. The new host regression records actual `DataGateway.openLog` calls: denied/revoked chat requests call it zero times; an allowed read is the positive control. An old chat publication cannot be returned after revoke/regrant. Notice requests still have no read/subscription capabilities.

Resize IPC extends the existing geometry-only `floatingControl`: only two finite width/height values in bounded ranges, only FLOATING mode, no paths/commands/URLs. Updates are coalesced; only the completed gesture persists. Renderer sandbox, context isolation, navigation checks and original permission gateway remain enabled.

## Root causes and verification scope

Desktop .2 recorded an 8 DIP edge while Windows drew a native minimum around 32 DIP. Earlier tests checked intended collapsed bounds and only inspected native expanded bounds. The new test inspects the real OS region, including length, rather than asserting just model dimensions. The user clarified that the long protruding cue was also unacceptable; its length is now 24 DIP.

Session invalidation previously replaced the whole floating body, including the public APS click target. A new RED/GREEN native test exercises the real private-clear event while keeping the current hover state. Private task content is cleared while public window controls survive.

The old corner preference could position messages away from the sidebar. A new native RED/GREEN test deliberately sets that legacy preference and checks 12 edge/mode combinations against the visible anchor.

The initial stacked layout reserved a 200 DIP minimum dashboard even in a 360 DIP top/bottom drawer, pushing reply controls outside the visible window. A native RED/GREEN check now measures the message viewport and input/send bounds across every edge and both languages; short windows use a proportional scrollable dashboard instead of hiding reply controls.

Evidence records distinguish synthesized Codex/Work data from host observations. Native tests exercise actual Windows region APIs, cursor approach, four-edge mouse clicks and a mouse-drag resize, plus layout, input preservation and revocation. Test helpers verify explicitly owned native root handles before input, allowing sandboxed Chromium child controls without permitting arbitrary application clicks. Helpers run hidden and use explicit DPI contexts.

Packaged acceptance uses the existing scoped renderer bridge and read-only, exact-PID Windows handle discovery to repeat actual OS region checks and mouse clicks on all four edges. It does not enable Node inspection or disable release fuses to test a different binary. A local Chromium debugging port exists only during the isolated acceptance launch and is absent from ordinary startup.

Failed diagnostic runs are retained, including ownership-guard refusals, pre-hover coordinate timing and mouse-drag failures. A diagnostic sampling run recorded the real cursor leaving the tag during click automation. After the user agreed to leave the mouse idle, all nine native edge/resize flows passed. This does not establish that every earlier failure had that same cause. Final-source tests are identified separately. Temporary cursor-coordinate publication was removed; diagnostic coordinates remain only in synthetic test evidence. The opacity regression first failed with actual native idle opacity 0.9, then verified the initially requested 0.1/0.5/1 on every edge. After the user clarified that rest must show the lower layer completely, a second RED/GREEN regression changes rest to 0; the final rule is 0/0.5/1. The discarded intermediate rule is not the final delivery.

## Limits and manual acceptance

- Actual Work Hook delivery, new host sessions and long-running host recovery remain unverified in this desktop candidate. Trusted Hook definitions alone are not evidence of callbacks. The installed plugin and history are preserved.
- Codex messages can be displayed through the authorized current source. The current host's official local reply/control socket was unavailable in prior verification. No real message was sent for this change; reply UI tests use synthetic tasks and unsent text. Work chat/reply remains UNSUPPORTED without an official channel.
- Overall project progress remains UNKNOWN. Structured plan completion and declared acceptance progress remain separate. Neither a Stop event nor a successful command completes a project.
- No real Windows shutdown is tested. Development/acceptance use dry-run; unsupported background proof blocks shutdown.
- Physical 125%/200% DPI, multiple monitors, taskbar relocation/disconnect, sustained memory/CPU, tray/shortcut competition, interactive installer and a genuinely Node-free clean VM remain MANUAL_TEST_REQUIRED. The tested desktop is Windows at 150%; restricted-PATH bundled-runtime tests are not a clean VM.
- Unsigned installer/EXE; no SmartScreen certification. Electron `setShape` is officially experimental on Windows/Linux. Work B must independently examine actual package files, origin, licenses and security; passing these tests is not that audit.

No private profile, real transcript, raw host event, key, actual chat screenshot or developer log is included in the source/runtime packages. The adjacent audit package uses an explicit synthetic/build evidence allowlist. No other project's or Work B's directory is modified.
