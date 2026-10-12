# Agent Progress Studio implementation plan

> Historical development notes for 0.1.1-rc.4. These describe implementation intent or earlier observations; they do not certify current safety or host compatibility. The original baseline had five independent-review findings; the current branch implements fixes. Current review status and remaining limits are recorded below. Read [KNOWN-ISSUES.md](KNOWN-ISSUES.md) and [VERIFICATION.md](VERIFICATION.md) before using a real session.


**Goal:** ship a usable, evidence-based local Codex dashboard on Windows.
**Architecture:** collectors -> normalized task engine + evidence evaluator -> local snapshot API/SSE -> reusable UI modules. Future host adapters use the same contract.
**Spec:** [SPEC.md](SPEC.md)
**Execution:** implement inline; independent competitor research and a final independent review. User explicitly requested development, testing and preview in this task, so no additional design approval gate is introduced.

## Global constraints

Local only, zero runtime dependencies, no competitor code copied, no user credentials/config changes, no fake percentages or ETA. The initial plan used Node >=22.15; current requirements are `^22.17.0 || ^24.2.0` in [INSTALL.md](INSTALL.md). All user-facing deliverables stay under this project directory.

## Review focus

1. Partial, malformed, rotated or large logs: recover and label limits.
2. Failed/stale/missing test evidence and changed acceptance definitions: never inflate completion.
3. Workspace/path traversal, symlinks, remote origins: deny unsafe reads/writes.
4. Source switching, replay restarts and SSE reconnection: no cross-session state leak.
5. App-server unavailable/unsupported fields: keep unknown and diagnostic state visible.

## Tasks

- [x] 1. Core: `src/core/engine.mjs`, `src/core/acceptance.mjs`. Test exact weighted acceptance, unknown metrics, failure precedence, review invalidation and tool-count independence before implementation.
- [x] 2. Collection: `src/adapters/codex-log.mjs`, `src/adapters/app-server.mjs`, `src/adapters/demo.mjs`, `src/collectors/evidence.mjs`. Test real temporary log append/rotation, protocol fixtures, Git repo changes and report staleness.
- [x] 3. Service: `src/server.mjs`, `src/service.mjs`. Test HTTP source switching, SSE, export, durable reviews, Host/Origin protection and confined evidence reads.
- [x] 4. UI: `public/index.html`, `public/app.mjs`, `public/components.mjs`, `public/i18n.mjs`, `public/styles.css`. Verify real UI navigation, replay, acceptance dialog, bilingual/theme persistence, empty/no-plan state, export and responsive layout using Playwright.
- [x] 5. Delivery: Windows launchers, test runner and report schema, reproducible fixtures, README files, architecture and official-interface research; run shipped artifact and final independent review.
- [x] 6. After V0.1 verification: record V0.2 MCP Apps/Work compatibility plan with capability gates and privacy decisions.

Each task uses failing behavior tests, implementation, then passing tests. Record results and deviations in `work/progress.md` outside the distribution. Tests never operate on real user projects or run commands obtained from Codex logs.
