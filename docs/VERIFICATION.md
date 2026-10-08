# V0.1 engineering verification / 版本核验

This document records the original V0.1 release baseline. For the subsequent Work locally Hook experiment and its separate live measurements, see [WORK-HOOKS](WORK-HOOKS.md). The old release ZIP and the development branch are distinct artifacts.

Verified on **2026-10-09 (Asia/Shanghai)**, Windows, Node.js **24.17.0**, installed Microsoft Edge, Codex CLI **0.162.0-alpha.2**. This records executed engineering checks. User acceptance remains a separate, unapproved gate.

本记录来自实际运行，没有代替用户进行人工验收。Node 22.15 是声明的最低版本，本次实际执行版本为 24.17.0；没有实测认证其他操作系统或全部 Codex 版本。

## Automated results / 自动化结果

Command: `node scripts/verify.mjs --browser`.

| Suite | Result | Behavior checked |
| --- | --- | --- |
| Acceptance/task engine | 9 / 9 passed | Weighted criteria, human gates, failure precedence, missing files, stale evidence, unknown metrics, event deduplication, turn reset |
| Collectors | 9 / 9 passed | Codex plan/usage normalization, ignored private reasoning, partial UTF-8 append, rotation/truncation, Git diff, report invalidation, confined evidence paths |
| App-server adapter | 3 / 3 passed | Literal loopback restriction, unrelated-thread filtering, current-turn history isolation |
| Local service | 5 / 5 passed | Deterministic replay, origin/token checks, durable reviews and export, source switch, initial SSE snapshot for reconnect |
| Edge browser flows | 7 / 7 passed | Dashboard, language/theme persistence, evidence dialog, review/reload, JSON export, no-plan unknown progress, replay/responsive layout |

**26 core/integration tests and 7 browser flows passed.** Browser checks also observed zero page errors, zero external requests, no horizontal overflow at 390 px width, and an on-screen review confirmation button at a 390 × 844 viewport. Screenshots were visually inspected in dark Chinese, light English and narrow layouts. This is not a comprehensive accessibility audit.

The generated `.agent-progress/results.json` contains actual runner output, process exit codes and a SHA-256 fingerprint. It is intentionally untracked by Git; the portable release includes the generated report. It is valid only while its source fingerprint matches. Regenerate it after edits rather than editing its pass/fail fields.

## Windows and real-source checks / 启动与真实来源

- `start.cmd --demo --no-open --port 4321` was actually launched on Windows. HTTP, all application assets, deterministic **33.3%** demo coverage and report/source fingerprint matching were checked; the temporary process was stopped afterward. No runtime npm dependencies are required.
- The live JSONL adapter discovered and selected this task's actual `CODEX_THREAD_ID`, read current activity/tools and reported token fields. Raw prompts, session logs and real usage values are excluded from the release archive and screenshots.
- A separately owned local Codex app-server was initialized. Read-only thread listing and reading found the current thread. Its stored phase differed from the active log: a separate endpoint must not be presented as a guaranteed real-time desktop mirror. The probe server was stopped afterward.
- Git tests created disposable repositories, changed files and inspected actual diff/commit output. No user repository was modified by those tests.
- The portable ZIP is separately extracted and tested through `demo.cmd` without `node_modules`; the adjacent release-check JSON and SHA256SUMS file record that artifact check.

## Review repairs / 审查修正

An independent code review identified four issues. Each was reproduced with a regression test and fixed: sensitive paths could enter Git diff output; explicitly declared artifacts in normally ignored locations could escape fingerprint invalidation; skipped large log ranges could retain stale completion; app-server history could mix earlier-turn tools with the current turn. A further engine test ensures passing checks cannot bypass a declared missing implementation file.

## Acceptance boundary / 验收边界

The project's own checklist has seven equal-weight conditions. After a matching full verification report, five are automatically verified and two remain for human review: UI/workflow usability and source/document/license delivery. Expected coverage is **71.4%**, not 100%, until the user reviews those conditions. The test fixture's human approval is isolated from real project reviews.

Known limits remain explicit: internal JSONL compatibility is best effort; unknown context/plan/time data stay unknown; no ETA is invented; source hashing is bounded; local reports are auditable but not tamper-proof; V0.1 does not integrate ChatGPT/Work or modify native host UI. See [EVIDENCE](EVIDENCE.md) and [INTEGRATIONS](INTEGRATIONS.md).

## Reproduce / 复现

```powershell
npm ci --ignore-scripts
node scripts/verify.mjs --browser
start.cmd --workspace "C:\path\to\agent-progress-studio"
```

Use the no-plan simulation in Connections to check unknown progress. Open the full simulation to inspect distinct failed, unknown, implemented, awaiting-review and verified conditions.

## 0.1.1-rc.2 incremental validation

The V0.1 statements above describe the audited baseline. RC.2 adds optional real Work lifecycle/tool observations and a monitoring-first home; see [WORK-HOOKS](WORK-HOOKS.md) for live evidence and failed-attempt limits. Unit and browser fixtures are isolated from the real recorder spool. New regression cases cover automatic Codex discovery, stable task selection, tool metadata filtering, missing outcomes, stale activity, and the three separate progress measures. Git/test/human-review/export/theme/language flows remain in the suite.

The accompanying archive manifest records actual final test totals, full commit SHA, every baseline delta path, distributed file hashes and font inspection. Neither automated tests nor interface appearance mean the original product scope has been fully achieved. Independent incremental audit and user acceptance remain pending.

A separate real Codex CLI probe was started in a scratch directory with a read-only sandbox and a fixed-response/no-tools prompt. Its new session was discovered automatically at 2026-10-08 22:26:03 UTC. The in-app browser subsequently selected its exact ID and displayed its real task and stale execution evidence. The initial automated selection assertion sampled before the asynchronous selection response; later direct browser inspection confirmed the selection. The CLI itself produced no final reply within the 90-second test bound and was stopped, so a **real completed Codex turn is not validated in this run**. The raw CLI error was not retained; no precise timeout cause is claimed. Isolated browser and service regression tests do verify selected-log appends and completed-turn rendering, but are not a substitute for that missing live completion result.
