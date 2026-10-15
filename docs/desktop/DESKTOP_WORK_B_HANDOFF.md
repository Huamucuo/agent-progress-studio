# Windows Desktop Edition — Work B independent audit handoff

Candidate: **0.2.0-desktop.1**, Windows x64, private audit candidate. The final commit and artifact SHA256 values are supplied in the external fixed delivery manifest; this file deliberately does not contain a self-referential commit hash. No public release, push, update feed or cloud upload was performed. Keep the desktop-edition branch isolated until independent source/security/package audit and human acceptance.

## Provenance and actual changes

Fixed development base: **e02febd5184ee679372c779e1c1c07214dec8358** (RC4). Original repository and Work B directories were read-only throughout this task. A normal separate clone without hardlinks/remotes was created in this task's writable workspace.

Project-owned reviewed boundary repair **0719924a42805627c3c34694241dce59b0cb1465** was cherry-picked as **755863b11319a910657ad7f7b788f8513b4cfabc**, preserving original authorship. This repairs the Git signature-verifier execution, Hook hardlink, post-close mutable permit, scalar RPC error and experimental paging issues that the old fixed RC4 did not resolve. See SECURITY-FIX-NOTES.md and the inherited negative/positive controls. This is not a claim that the original RC4 folder was fixed.

New desktop code, transport and icon were written for this project. No competitor code was imported. Electron 44.7.0, electron-builder 26.15.3, @electron/fuses 2.1.3 and Playwright 1.56.1 were installed from pinned official npm packages for runtime/build/test roles. Original NSIS COPYING is redistributed verbatim. The icon SVG is original; PNG/ICO are its raster exports. No third-party font files were added. The package lock and generated dependency-license inventory preserve exact sources/licenses. Final Git diff/name-status is supplied separately.

## Modules and security invariants

| Module | Actual responsibility and audit focus |
| --- | --- |
| desktop/main.cjs | Fixed GUI entry / metadata-only Hook entry; no arbitrary script mode |
| desktop/window.mjs | Isolated native window, secure asset origin, exact main-frame IPC sender guard, tray, single instance, opt-in startup, error recovery, quit lifecycle |
| desktop/preload.cjs | Frozen operation allowlist; no raw ipcRenderer, require, process, fs or eval exposed |
| desktop/host.mjs | Existing StudioService lifetime; revision CAS; original Publication lineage retained in WeakMap until synchronous final send; native export revalidation |
| desktop/hook-ingress.mjs | Authenticated Windows named pipe, bounded exact metadata; original opaque observe permit checked before and across persistence; revoked producers cannot be renewed |
| desktop/recorder.mjs | Check live marker before consuming stdin; filter original four/six fields; inherited Windows fd needed by observed Electron runtime; no raw logging; empty JSON output |
| desktop/hooks.mjs / owned-files.mjs | Official plugin commands after native consent; app-specific identity; ownership bounded same-handle read, no alias/hardlink or stored executable selection; confirmed removal pauses first |
| desktop/settings.mjs / diagnostics.mjs | Metadata preferences, serialized persistence and alias refusal; diagnostics contain predefined codes/timestamps only |
| desktop/fuses.cjs | Disable RunAsNode, Node options and inspect flags; enforce ASAR-only and embedded integrity; disable extra file protocol privileges |
| desktop/installer.nsh | Remove startup registration only if it exactly points to this installed EXE |
| public/transport.mjs / desktop-ui.mjs / desktop.css | Controlled IPC reuse, first-use/setup/lifecycle UI; new overview order; unknown remains unknown |
| src/service.mjs | Safely restore selected missing/disconnected sources; never substitute another ID or re-enable revoked Work observation during restoration |
| src/server.mjs | Legacy assets only; desktop never starts this HTTP/SSE service |

The existing SessionAccess → ResourceRegistry → DataGateway → Publication → StateReceiver architecture is retained. DesktopHost is a lifecycle/output bridge, not a second session permission engine. Work origin labels never imply local/RPC content access. Scope changes pre-clear UI and destroy subscriptions. Old IPC subscription IDs, old authority instances and original permit generations cannot be relabeled after regrant/restart. Requests awaiting native dialogs/settings persistence are checked again before publishing/saving. Exported files already committed to disk remain user-owned; revocation cannot undo a previous authorized OS file write.

Normal desktop startup opens no HTTP/SSE server and no debug listener. Packaged acceptance explicitly supplies a loopback Chromium debug flag only for an isolated synthetic profile; that flag is not in shortcuts or login startup. Outside webpages cannot call Electron IPC. The local pipe credential is an app-owned-file capability; same-user malware able to read/write the profile is outside OS isolation. It cannot gain conversation body permission via Hook fields. No claim of resistance to administrator/process injection, forged same-user event spools or hostile OS filesystems is made.

## Actual test evidence

| Test | Observed result | Limit |
| --- | --- | --- |
| Exact old e02 baseline | 110 Node tests passed | Before importing known repairs |
| Imported project-owned security repair | 133 Node tests passed | Synthetic, not a fresh independent audit |
| Full new Node suite | 146 passed, zero skipped/failures | Includes 13 native-host/Hook boundary tests plus inherited privacy matrices |
| Source-bound verifier | 15 groups passed; stable fingerprint | Machine-readable report supplied; final SHA manifest binds delivery |
| Original Edge UI | 17 flows passed; no page errors/outbound requests | Legacy compatibility retained |
| Edge privacy suite | 6 flows passed | Revoke/regrant, delayed export, restart/bootstrap, cached output, actual synthetic RPC notifications |
| Actual Electron development window | 5 flows passed | Work/Codex metadata/body fixtures, consent, switch, native export writer, revoke, tray, pause, languages/themes; save picker test-stubbed |
| Packaged fresh runtime | Portable 6 flows / installed 7 flows exercised | No-Node PATH; own runtime; no browser or manual service; duplicate/quit; actual bundled EXE Hook stdin and pipe path |
| Per-user installation/removal | Silent install/uninstall exit 0; EXE/uninstall/startup registration removed | Interactive wizard and SmartScreen remain human checks |
| Desktop screenshots | Captured actual own native window plus renderer screenshots | All pictured tasks/events are labeled synthetic; no private screen capture |

Tests explicitly reject stale final IPC sends/exports and malformed pipe fields. Inactive recorder tests prove the private stdin generator was never consumed. Inherited I/O tracing tests prove unknown/Work/unauthorized UUID/archive/evidence bodies were never opened/read, and post-revocation body/output sinks were not invoked. Tests use temporary synthetic IDs and sentinels only. Accepted controls confirm useful output remains available after explicit permission. Restoring a missing ID does not read another session; restoring unavailable RPC keeps controls available; restarting a revoked observe scope does not silently authorize it.

Development exposed and fixed nullable IPC compatibility, selected-session restoration, renderer ordering/clear behavior, stale producer persistence, Hook removal marker renewal, invalid pipe metadata acknowledgments, and the Windows Electron empty-stdin issue. Build/test-harness failures were not counted as passing runtime checks: early NSIS quoting and screenshot process-policy/DPI problems were corrected; their owned test registrations were cleaned without deleting other applications.

Fresh read-only branch review of 4af8d2b36922e90e87fa7d67c0070e1c9ea85d6d identified two Important defects: an external spool was retained after managed Hook installation, and the event directory silently saturated. Both have red/green regressions: successful native-consented managed installation now selects its own directory without resuming a paused collector; only the app-owned filename namespace in its own ingress rotates to 8,000 recent regular files. Independent/linked files are retained and never read by retention. A minor same-ID source recovery issue was also fixed with a zero-body-entry negative control before authorization. Native buildVersion/buildNumber are derived from package SemVer and checked. This internal review is not Work B's approval; the report and subsequent repair diff accompany the final candidate.

Fresh default-profile portable acceptance subsequently exposed an initialization race that explicit-profile tests did not cover: asynchronous filesystem work could pass Electron's ready boundary before privileged scheme registration. Registration now occurs synchronously in main.cjs before importing the async window module. A new untouched portable directory with the real default sibling data path passed all six packaged flows after the fix; final ZIP extraction repeats this check. Initial failed ZIP evidence is not counted as a success. No private body was accessed by the failed startup.

## Real host and manual acceptance — still pending

This desktop branch has **not** certified a newly created real ChatGPT Windows Work locally turn or a new Codex turn. Earlier historical probe experiments in WORK-HOOKS.md are prior-version evidence only. The packaged EXE's actual stdin-to-pipe-to-file path and the UI's event reading path were tested with synthetic data, not mislabeled as host callbacks. No new managed Hook was silently installed, enabled, trusted or removed in the real host. Installation and trust remain native consent + client review actions.

Pending human steps:

1. Install via visible wizard, open from a shortcut, verify unsigned publisher/hash and chosen directory; clean Windows VM with no Node, not just a restricted PATH; uninstall through Windows Settings with user data retained.
2. In Settings authorize this app's own Hook installation, review exact five definitions in the host, note whether its build needs restart. Create a fresh Work locally, send a benign greeting/tool operation and record actual UserPromptSubmit/PreToolUse/PostToolUse/Stop/SessionStart availability, new ID discovery and measured delay. A host may omit events; do not assume all five.
3. Create an actual Codex task, match its full ID, explicitly grant only that backend/ID and optional evidence root. Verify current activity, supported plans/Token changes and safe switch/revoke. Test official RPC capabilities only; unavailable capability must remain UNKNOWN/UNSUPPORTED.
4. Click the real native report picker and reopen export, tray menu and taskbar minimize, visible close-to-tray and quit, restart after failure/disconnection, crash recovery; verify no post-exit owned Hook writes. Independent old probes are not controlled by this app.
5. Test opt-in startup on an actual Windows login, then disable/remove it. Portable location changes and multiple profile copies need manual check.

Work Hooks cannot provide task text, complete plans, Token/context accounting or evidence roots under the authorized six-field metadata protocol. Official RPC is ID-only capability-limited and does not reconnect by steering/resuming a thread. No false overall percentage or ETA was introduced to conceal these limitations.

## Packaging and release gate

Both distributions retain Electron LICENSE.electron.txt and LICENSES.chromium.html; NSIS COPYING is in ASAR/source. Build allowlist includes application modules/static assets/original projector and its CJS package boundary only. No npm production dependency, fixtures, tests, event spool, private settings, session JSONL, credentials or application logs belong in ASAR. Portable staging additionally checks files for private-data names and unexpected redistributed fonts. The full ASAR/disk manifests and SHA256SUMS accompany the candidate. The source archive is generated from the fixed tracked Git tree, not the development directory.

Known build dependency issue: npm audit reports 8 moderate propagated entries associated with unpatched sprintf-js through development global-agent/roarr/@electron/get/packaging dependencies. The latest published sprintf-js remains affected. Those npm modules are absent from runtime ASAR. Keep this explicit for Work B to evaluate build-supply risk; no forced downgrade or concealed advisory. Candidate binaries are unsigned (no certificate used); Windows numeric file version is 0.2.0.1 while full product SemVer is 0.2.0-desktop.1. No automatic updates or publication configured.

Final disposition is **AUDIT_REQUIRED / HOST_ACCEPTANCE_PENDING**. Automated success is not READY_FOR_RELEASE. Freeze after handoff and await Work B's independent assessment and the user's acceptance.
