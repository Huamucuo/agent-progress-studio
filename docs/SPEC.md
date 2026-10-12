# Agent Progress Studio 0.1 — specification

> Historical development notes for 0.1.1-rc.4. These describe implementation intent or earlier observations; they do not certify current safety or host compatibility. The original baseline had five independent-review findings; the current branch implements fixes. Current review status and remaining limits are recorded below. Read [KNOWN-ISSUES.md](KNOWN-ISSUES.md) and [VERIFICATION.md](VERIFICATION.md) before using a real session.


Date: 2026-10-09. Original implementation, local Codex first. The user's ten requirements are the release scope. This is a browser dashboard, not a replacement for the native Codex/Work interface.

## Product

A quiet, bilingual observability workspace: left navigation and source selector, current task and execution phase, acceptance coverage, an agent-reported plan, evidence cards and event timeline. Dark ink / mint is the default; a warm light theme is equally supported. Use text plus icons for every status. Keep evidence details and review actions in an accessible dialog with persistent actions. No decorative stock assets or external fonts.

## Chosen approach

The initial design used Node.js >=22.15. Current runtime requirements are maintained in [INSTALL.md](INSTALL.md): `^22.17.0 || ^24.2.0`. ES modules, native HTTP/SSE, vanilla component modules. Zero production dependencies. Built-in node:test for unit/integration tests; Playwright as an optional development dependency for browser tests. Portable Windows launchers run the same source distribution.

Alternatives considered: Electron adds packaging and native runtime weight before the browser use case needs it; a hosted MCP application changes the privacy and transport model. Both are deferred. A React/build-tool stack is viable but unnecessary for this first, small reusable component library.

## Boundaries

- A read-only local-log collector discovers UUID-named JSONL candidates using names/stat only under CODEX_HOME/sessions. Content requires an explicit user-confirmed Codex grant before any file open; unknown/Work stays denied. Current CODEX_THREAD_ID wins if available; otherwise the newest discovered session is suggested, not asserted to be the active foreground chat. The format is internal and best effort, not a stable public API.
- An optional loopback WebSocket app-server adapter uses initialize, initialized and explicitly authorized thread/read; no global thread/list. Read polling does not resume threads or guarantee subscription to another client's active turn. Unsolicited frames are discarded before parsing; only pending replies with leading numeric IDs are accepted. No approval, turn/start, resume, shell execution or global settings writes.
- No Hooks are installed. Document the future opt-in minimum permission pattern.
- SSE emits authoritative snapshots; reconnects recover current state. Missing timestamps, plans and usage stay unknown. Last-request usage is not exact live context occupancy. Cumulative billed tokens must never be subtracted from model context capacity.
- Local data is served only on 127.0.0.1; strict Host/Origin checks and same-origin mutation token. No telemetry, CDN, outbound fetches or automatic uploads. Git operations are read-only, bounded, and use argument arrays without a shell or external diff helpers.

## Acceptance semantics

The project declares criteria in .agent-progress/acceptance.json. Each criterion has a stable ID, a readable condition, optional implementation files, named test checks, positive weight (default 1), and a human-review requirement. Merely completing plan steps or calling tools never changes acceptance coverage.

Statuses: unknown, implemented, auto_verified, awaiting_human, failed, accepted. File evidence alone means implemented. Current named test evidence means auto_verified; if a human gate remains it means awaiting_human. Human decisions are scoped to the criterion, manifest and current evidence fingerprint, persisted locally, and invalidated on changes. Failed checks or rejection dominate. Unknown and stale evidence cannot count as verified. Progress = weights of auto_verified/accepted criteria divided by all declared weights. No criteria => null coverage and phase-only UI. No ETA.

Reports use a documented APS JSON schema and a source fingerprint generated before/after the test run. The dashboard never executes a command from a report or manifest. This is local evidence accounting, not a tamper-proof certification system.

## Release acceptance matrix

| Required outcome | User operation / proof |
| --- | --- |
| Windows run | Extract, start.cmd, open local URL; no npm install for runtime |
| Session discovery | Discover, select a log, see actual thread/source and last event |
| Live state | Append fixture records, observe SSE updates; disconnect stays visible |
| Plan | Replay reported pending/inProgress/completed; absent plan stays absent |
| Acceptance | Known fixture has exact weighted numerator; tools cannot affect it |
| Evidence | Open Git diff, commit, source file and named test result |
| Honest metrics | Last/total usage separate; missing capacity/time => unknown |
| Bilingual/themes | Switch, reload, inspect dark/light and narrow viewport |
| Simulation | Replay, pause, advance, restart; all six statuses and no-plan case |
| Review/export | Accept/reject a human gate, reload, change evidence, export JSON |
| Privacy | Reject remote origin/path escapes; no external runtime requests |
| Delivery | Source, MIT license, EN/ZH README, install/uninstall, architecture, competitor study |

## Deferred

V0.2 will reuse the snapshot protocol and UI through MCP Apps. Work compatibility is capability-tested, not assumed. Platform-specific shell/sidebar insertion is not promised. No cloud deployment or public repository creation is part of this local release.
