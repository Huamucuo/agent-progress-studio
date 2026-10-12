# Agent Progress Studio

**See agent activity. Inspect evidence. Keep completion claims honest.**

[简体中文](README.zh-CN.md) · <!-- APS_VERSION -->0.1.1-rc.4<!-- /APS_VERSION --> · [MIT](LICENSE) · **Development preview**

A local browser dashboard that separates an agent's reported plan, observed activity, and declared acceptance conditions. The runtime uses Node.js built-ins and local browser assets; it needs no account, API key, npm installation or build step.

**Five boundary fixes are implemented on an independent branch.** An independent static review found no concrete source-backed bypass or regression within these five fixes. Start with synthetic data; real-host compatibility and manual acceptance remain unverified. Public source development is separate from a stable release. Read [known issues](docs/KNOWN-ISSUES.md).

## Try the offline demo

The manifest declares **Node.js 22.15.0 or newer**. The fresh local checks use Node 24.17.0 on Windows x64; the minimum version, Linux and macOS have not been locally certified by this preparation.

From the source directory, run:

```powershell
node src/server.mjs --demo --codex-home ./work/synthetic-codex --data-dir ./work/demo-state
```

Open `http://127.0.0.1:4317` in a browser. Keep the terminal open; Ctrl+C stops the service. For the Windows launcher and automatic browser opening:

```powershell
demo.cmd --codex-home ./work/synthetic-codex --data-dir ./work/demo-state
```

These explicit folders keep the demo separate from your normal Codex directory and permissions. Even demo mode discovers the configured local session directory for its connection list, so use the isolated directory above. The simulated data is clearly labeled. Do not point these paths at actual sessions or reuse a real permission store for a demonstration.

Use `--port 4320` if the default port is occupied. No dependency installation is needed to run the dashboard. See [installation and removal](docs/INSTALL.md).

## Implemented behavior and its limits

| Area | What the code provides | Boundary |
| --- | --- | --- |
| Progress | Separate reported-plan fraction and weighted acceptance coverage; overall completion remains unknown without a reliable model. | Tool-call counts and a completed turn do not prove a finished task. |
| Offline demo | Deterministic replay, no-plan scenario, evidence views, local review decisions and JSON export. | Simulation is not a live host. |
| Codex JSONL | Bounded filename discovery, explicit selected-session content grants, appended-log normalization and polling. | Internal best-effort data format; no proof of foreground selection or complete history. |
| Workspace evidence | File, test-report and Git views after a separate workspace grant. | Signature display and configured signature verification are disabled during evidence reads. A workspace grant remains distinct from session access. |
| App-server | Literal-loopback endpoint, loaded-ID discovery and separately granted history; normalization of permitted delivered notifications. | No start/resume/approval commands; cross-client subscription is unverified. Experimental paging is off by default and requires explicit API opt-in; malformed input is rejected without committing partial state. |
| Local Hook experiment | Separate opt-in recorder and metadata receiver; lifecycle events, tool name and explicit structured outcome when present. | No task text, plans, tokens or private tool payloads. The receiver checks resource identity before bounded reads and retains each poll's original grant. Host compatibility is not renewed here. |
| Review and UI | Six acceptance states, evidence-linked human decisions, local persistence, bilingual themes, dialogs and local downloads. | Exports can contain private paths, source and task excerpts. Inspect them before sharing. |

Activity expires to unknown after 30 seconds without new nonterminal evidence. Missing timestamps, plans, context occupancy and unsupported fields stay unknown. A Stop event describes a stopped turn. Local polling is normally every two seconds; no latency SLA is claimed.

## Acceptance is explicit

For a future reviewed real-workspace connection, acceptance definitions belong in that workspace's `.agent-progress/acceptance.json`. [The example](fixtures/acceptance.example.json) links named files, check IDs, weights and optional human gates. Merely finding a file means implemented, not tested.

Automatic verification requires a current `.agent-progress/results.json` containing the named checks and matching source fingerprint. Human review expires when its evidence or definition changes. [Evidence format](docs/EVIDENCE.md) explains this producer contract; it is not a proof that a test producer is honest or that its coverage is complete.

## Development checks

Run the Node suites and new boundary regressions through an isolated environment:

```powershell
node scripts/ci-offline.mjs
```

The wrapper creates temporary synthetic homes, uses an empty developer Git configuration, and does not forward credentials, real session IDs or trace settings. The independent repair branch retains the original history, adds 23 boundary regressions, and updates only the scoped Git, Hook and RPC behavior.

Optional browser checks use the locked Playwright development dependency:

```powershell
npm ci --ignore-scripts
node scripts/ci-offline.mjs --browser
```

On Windows the browser suite uses installed Edge. On other systems a separately installed Playwright Chromium is needed; those runs are not certified here. Provisioning the dependency/browser can use the network; fixtures and test servers are local. Generated reports/screenshots stay local and are ignored. The proposed CI installs no npm packages and uploads no artifacts.

Fresh local results and historical evidence are separated in [VERIFICATION.md](docs/VERIFICATION.md). Tests cover synthetic cases; the independent review covers this exact fix and does not certify every integration. The proposed Actions matrix has not yet run on GitHub.

## Privacy and compatibility

The service binds to loopback, serves a fixed asset list and checks same-origin requests. These are application controls, not a sandbox against programs running as your user. Local session bodies, workspace evidence and Hook observation have distinct intended grants. Read [the scope design](docs/PRIVACY-SCOPE.md) together with [current limitations and remediation status](docs/KNOWN-ISSUES.md); do not infer a complete security guarantee from the design.

The dashboard itself has no telemetry/upload flow or remote runtime assets. It does not alter the native Codex/Work UI or automatically install/trust the optional Hook plugin. No real Work or Codex session was opened by this publication preparation. Real-host version compatibility and manual acceptance remain pending.

## Build in public

[ROADMAP.md](ROADMAP.md) tracks proposed work; [CHANGELOG.md](CHANGELOG.md) describes recorded changes. [CONTRIBUTING.md](CONTRIBUTING.md) and [the development procedure](docs/DEVELOPMENT.md) cover feature branches, independent PR review, protected main, immutable prereleases and stable-release gates. Existing commits and authors must be preserved; this local source snapshot is not a replacement Git history.

The project already carries MIT. [THIRD_PARTY.md](THIRD_PARTY.md) and [the dependency inventory](docs/DEPENDENCY-LICENSES.md) distinguish that license from optional development-tool licenses. No competitor implementation, fonts, browser binaries or installed dependencies are included in this proposed source set. The provenance review found no obvious direct copying in the inspected scope; it does not prove universal originality.

```text
src/          adapters, authority, evidence and local HTTP/SSE service
public/       local UI modules, CSS and original SVG logo
fixtures/     authored synthetic reports and example session records
tests/        original unit, integration and browser suites
scripts/      launch, verification, version and candidate tooling
experiments/  separately installed optional metadata Hook
docs/         architecture, limitations, verification and development records
```

This preparation creates a local repair branch and commits while preserving all nine original commits. It does not create a public repository, push history, open a PR, issue a tag or publish a release. Publication still requires the owner's review of the exact file and history scope.
