# Agent Progress Studio — Windows Desktop Edition

[简体中文](README.zh-CN.md) · <!-- APS_VERSION -->0.3.0-desktop.1<!-- /APS_VERSION --> · MIT

A private local desktop monitor for AI coding tasks. Open a Windows window, select a specific Work/Codex session, see observed activity and recent tools, and inspect verified and pending work. This candidate is awaiting independent source, security and package audit. It has not been publicly released.

## Install and open

- **Installer:** run `AgentProgressStudio-0.3.0-desktop.1-Setup.exe`, choose a per-user directory, then open Agent Progress Studio from the desktop/Start menu.
- **Portable:** extract the entire `AgentProgressStudio-0.3.0-desktop.1-Portable.zip`, then double-click `AgentProgressStudio.exe`. Keep the accompanying resources and DLLs.
- End users need **no browser, Node.js, npm, terminal or manual local service**. Electron includes the runtime. Candidate binaries are unsigned; verify the supplied SHA256.

[Installation, connection, pause, tray, startup, logs and uninstall guide](docs/desktop/USER-GUIDE.md).

## What the first screen means

Choose a source and a task from the named/numbered list; the full ID remains available in advanced information. The first screen shows the selected identity, observed activity, recent tools, verified criteria and pending criteria. Collection being available does not mean an Agent is running. Stop ends a turn, not a project. Continuous observation continues when no new event arrives: a known unfinished tool awaits its corresponding result; other old evidence leaves current execution unknown.

The native floating monitor can be dragged/resized, compacted, hidden and restored. Drag release near any screen edge docks it: a 2 × 24 DIP visible cue reveals a small APS tag (28 × 44 DIP on vertical edges) when the pointer approaches, then a single click opens the inward drawer. The OS drawing/hit region excludes the unused backing frame, so it cannot block other windows. Leaving returns to the thin edge. Hover width is never restored from saved settings. Position lock, always-on-top and pinned expansion are independent. The flush edge is fully invisible and click-through at rest, 50% opaque nearby, and 100% opaque after clicking to expand. The underlying desktop is genuinely visible; this is native window alpha, not a faded opaque background. This native three-stage policy replaces saved legacy drawer opacity. Tray and Ctrl+Alt+Shift+A restore the monitor; messages attach to its visible region and follow movement, collapse, preview and expansion; old fixed-corner preferences cannot detach them. An expanded drawer puts the dashboard above bounded authorized messages and the controlled reply composer. Public user/assistant messages require the existing Codex body permission; unsupported Work chat is explicit. Messages update while typing without resetting the draft. Bilingual deterministic explanations distinguish observed facts from inferred implications; no paid model/API is required.

Three measures stay separate: overall task progress is UNKNOWN without a reliable remaining-work model; plan progress counts Agent-reported steps; acceptance percentage uses explicit conditions and weights. Tool-call counts are never a completion percentage. Missing plans, tokens, context and timestamps remain unknown; no invented ETA.

## Connect Work or Codex

Optional **Desktop pet** is off by default. Four pixel animals have six four-frame states in a separate transparent window, with body dragging, size, independent position lock/top, hide and tray restore. Blank pixels pass clicks through; hidden pets stop animating. Authorized facts drive state, while expired or unknown activity leaves them idle. Local XP/coins, five usable shop items and PNG pack import never affect task progress or shutdown. [Pet guide and local storage](docs/desktop/DESKTOP_PETS.md) · [Artwork origin and licensing](docs/PET_RESOURCE_LICENSES.md).

First launch opens a connection guide. Work observation is an **optional metadata-only Hook adapter**. Installation needs a native checkbox confirmation and official local plugin commands; trust is a separate client action. Installed, trusted and actually observed states are distinct. New session IDs appear when real callbacks arrive, while the selected session stays stable. Confirm Work/Codex origin separately; unknown stays unknown. Existing independent probes may be connected with a native directory picker.

Hook records have four base fields: event_type, session_id, turn_id, timestamp. Tool events add tool_name and tool_status (six fields). No prompts, transcript bodies, tool arguments/output or hidden reasoning are persisted. Work plans, task text, token use and evidence roots are not provided by this adapter and stay UNKNOWN. Automated fixtures are not host compatibility certification. [Metadata protocol and prior host experiment](docs/WORK-HOOKS.md).

Codex discovery reads filename UUID metadata only. An explicitly selected older UUID is located separately when it falls outside the recent 300-candidate/60-row view, then retained in the list. Its scan is bounded at 10,000 directory entries; duplicates, inaccessible/incomplete scans and known Work IDs default to unavailable, with no body read. Reading a particular backend/ID body requires explicit confirmation that it is Codex, remembered after clean exit. Git/tests/implementation evidence require a separate workspace grant. Work/unknown bodies default to denied. The advanced page retains official loopback app-server monitoring and negotiated ID-only discovery. Sidebar replies have a **separate, default-off permission**, for a selected authorized local Codex thread loaded in the official control interface; no resume, model, sandbox or approval overrides. Work replies are unsupported. [Permission rules](docs/PRIVACY-SCOPE.md).

Current real-host evidence: a user-selected, explicitly authorized existing Codex task was displayed in native main/floating windows. The experimental desktop Hook plugin's five definitions were trusted, but its new spool received **zero real callbacks**; this does not establish a working Work connection. The host's official local control socket was unavailable, so real sidebar delivery and unattended shutdown are not verified. Synthetic native/packaged tests are labeled separately in the handoff.

## Desktop lifecycle and privacy

Closing the floating window hides it; monitoring while hidden is configurable. Closing the main window hides it while a floating monitor or enabled tray background remains, otherwise quits. Explicit Quit stops owned collectors and flushes authorization. Pause invalidates subscriptions/UI; resume uses a fresh authority instance and retains selection. Login startup defaults off. Duplicate launches focus the same profile's window. Errors safely pause and offer reload, fixed-code logs or quit.

Daily automatic cleanup covers this app's Chromium caches only and reports its result. Managed Hook retention bounds its own event namespace at 8,000 records; independent probes and transcripts are untouched. Automatic shutdown defaults to all **monitored, authorized tasks in the current source**, requires initial native opt-in, fresh official idle/background evidence and ended execution, then a stability interval/countdown with cancellation. It never asks again after completion and never treats project progress, silence or Stop alone as completion. Unknown background state blocks it; enablement never persists across restart. It cannot cover unconnected applications or cloud tasks.

The renderer has no Node access. Packaged assets use a secure custom origin, a sandboxed/context-isolated preload and a fixed IPC allowlist. The existing unified permission gateway governs reads, evidence, caching and final IPC/export publication. The desktop opens **no HTTP/SSE service**. Managed Hooks use an authenticated local Windows named pipe tied to the live observation generation; quitting/revocation stops its writes. Independent probes remain independently managed. No application code uploads user chats, code or logs. [Desktop architecture and boundaries](docs/desktop/IMPLEMENTATION.md).

A native report picker exports a current, authorized JSON report. Revoke clears live data and invalidates old delayed output; already-saved reports remain user-owned files. Uninstall the app-owned Hook in Settings and disable startup before removing/moving the application. Windows uninstall retains dedicated user data for user-directed cleanup.

## Evidence and acceptance

Keep `.agent-progress/acceptance.json` in an authorized workspace. [Original example](fixtures/acceptance.example.json) and [format](docs/EVIDENCE.md) define implementation files, named tests, weights and human approval. Git differences/commits, test reports, implementation checks and durable reviews remain available. Changed evidence invalidates old approval. Chinese/English and dark/light settings persist. Demo is explicitly labeled simulated and can replay, pause and step.

## Source and development

Baseline RC4: `e02febd5184ee679372c779e1c1c07214dec8358`; fixed desktop .1: `cce2640e7a4b4d8ecdf45ceab03bbcfc67188594`; fixed desktop .2: `bf10664b4aa353f2b6912efb7de9069dbd84ecdd`; this increment starts at fixed desktop .3 `67823146adfa880e22e4471ce08a7814cfe2a75a` on `feature/desktop-pet-mode`. Project-owned security repair `0719924a42805627c3c34694241dce59b0cb1465` was imported with its original authorship/history before desktop work. Fixed versions remain unchanged; this candidate has not passed Work B's independent audit.

Windows build environment: Node >=22.17, `npm ci`, then `npm start`. End-user releases include their runtime. `npm test`, `npm run test:browser` and `npm run test:desktop` reproduce regression. `npm run desktop:build` creates the per-user NSIS installer without publishing. `npm run desktop:unpacked` builds the runtime folder. See the guide for the isolated packaged/no-Node suite. The developer-only legacy web entry remains via `npm run web:start` / `web:demo`.

`desktop/`: native lifecycle/IPC/setup; `src/service.mjs`: source and authorization; `src/core/`: state and permissions; `src/adapters/`: Work, Codex, RPC and Demo; `src/collectors/`: evidence gateway; `public/`: reusable bilingual UI; `tests/`: synthetic unit/browser/native/package regression.

[Architecture](docs/ARCHITECTURE.md) · [Security repair](docs/SECURITY-FIX-NOTES.md) · [Competitor comparison](docs/COMPETITORS.md) · [0.3 pet incremental audit handoff](docs/desktop/DESKTOP_PET_WORK_B_HANDOFF.md) · [Release notes and remaining acceptance](docs/desktop/DESKTOP_PET_RELEASE_NOTES.md).

[MIT](LICENSE) · [Third-party runtime/build notices and known build advisory](THIRD_PARTY_NOTICES.md) · [Contributing](CONTRIBUTING.md). The desktop icon is original project artwork. No redistributed fonts or competitor code were added. Electron's upstream runtime license files remain in both distributions. No automatic updater, cloud service or public release is enabled.
