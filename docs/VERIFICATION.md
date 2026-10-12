# Verification and compatibility

Preparation date: **2026-10-12**. Retained original baseline: `0.1.1-rc.4`, commit `e02febd5184ee679372c779e1c1c07214dec8358`. Current changes live on an independent repair branch; the original runtime project and all nine commits remain intact.

## Fresh repair evidence

| Check | Scope | Measured result |
| --- | --- | --- |
| Before-fix regressions | Original baseline; temporary synthetic homes, local Git fixtures and loopback WebSocket peers | 23 cases failed for their intended boundary conditions, including an actual native WebSocket process exit and configured Git verifier execution controls. |
| Focused repair regressions | Exact frozen repair source on Windows x64, Node 24.17.0 | 23 passed; 0 failed or skipped. |
| Complete Node suites | Original suites plus 23 new cases in an isolated environment | 133 passed; 0 failed or skipped. No existing test was suppressed; the legacy paging case now explicitly opts in to experimental API behavior. |
| Independent fix review | Immutable complete Git diff and source identities | completed static review of the immutable fix: no concrete source-backed bypass or regression found within the five-finding scope. Scope is the five repaired boundaries and possible bypass/regressions, not a certification of every dependency or integration. |
| Project verifier | Disposable synthetic source copy; local acceptance report only | 14/14 named groups passed; exit 0 and stableSource=true. Generated `.agent-progress/results.json` is excluded from public source. |
| Browser and privacy suites | Installed Edge and locked Playwright; disposable synthetic source/session copy | 17 UI and 6 named privacy flows passed; exit 0, no page errors. The privacy report also contains a timing metric, which is not an additional flow. Edge product version was not newly captured. |
| License and package boundary | Same package/lockfile, own MIT and retained third-party notices | No new dependency or imported asset. Playwright/Playwright-core Apache-2.0 with embedded notices; optional fsevents MIT. See [inventory](DEPENDENCY-LICENSES.md). |
| Hosted CI | Proposed Windows/Ubuntu × Node 22.15.0/24.17.0 | Not run on GitHub before publication approval. |
| Real Codex/Work or external app-server | No actual user sessions used | Not tested or renewed. Requires separately authorized host/manual acceptance. |
| Other systems and minimum declared Node | Not exercised in the measured local repair run | Unverified; a declared requirement or proposed matrix is not compatibility evidence. |

The controlled Git-helper tests deliberately enable execution in their raw baseline control and then check its suppression by evidence collection. Browser checks use real rendering and HTTP with synthetic session/host data; they cannot establish actual Codex/Work schemas or another client's notification delivery. Tests and independent review cover finite cases. The observer is not an OS sandbox.

## Initial failures and sequential rechecks

The first concurrent disposable verification produced four of five expected Hook callback records, and its browser run timed out during page load. These failures and exit statuses are retained. Unchanged sequential verifier, browser and privacy runs passed, with no assertion, production deadline or source relaxation. Load or I/O pressure is a possible explanation; the exact cause was not captured at the time. This is a remaining host/load acceptance limit, not a defect proven fixed by rerunning.

The final public-source CI wrapper was also exercised in a separate 96-file disposable snapshot: version check passed; 133 Node cases passed, zero failures/skips, exit 0 and no cleanup warning. Only subsequent documentation result wording and Git text-line-ending normalization differ from that snapshot; frozen production and regression bytes are unchanged.

## Repeat checks

```powershell
node scripts/ci-offline.mjs

# Optional development tooling; provisioning can use the network
npm ci --ignore-scripts
node scripts/ci-offline.mjs --browser

# Original producer contract; use a disposable workspace
npm run verify
```

The isolated runner forwards platform essentials and synthetic home/temp/config paths only. It uses empty developer Git configuration and does not forward credentials, real session IDs, trace destinations or observer directories. CI runs Node fixtures with a read-only repository token, pinned actions, no dependency install and no artifact upload. Browser temporary-profile cleanup is a separate diagnostic; cleanup warnings do not hide a suite failure or authorize changing Windows permissions.

The verifier produces source-fingerprinted acceptance checks in `.agent-progress/results.json`. A report from a disposable copy validates that copy; it is not evidence for a real user's observed workspace. Screenshots, logs, exports, traces, runtime stores, local review attachments and real session identifiers remain excluded. The source-review ZIP is a file snapshot for approval, not a stable release or replacement Git history.

## Historical evidence and remaining gates

The 2026-10-10 NEEDS_REWORK report applies to the preserved original commit. Earlier engineering notes and host observations remain historical. [Remediation status](KNOWN-ISSUES.md) identifies the five changes and unresolved host, platform and release gates. Source publication still requires owner approval of exact files and history. Stable distribution additionally requires real-host acceptance, required hosted checks, package audit, immutable release evidence and explicit release approval.
