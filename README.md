# Agent Progress Studio

**See the work. Inspect the evidence. Decide what is done.**

[简体中文](README.zh-CN.md) · Version 0.1.0 · MIT · Local Codex first

An original, local browser dashboard for coding-agent observability. It separates an agent's activity and self-reported plan from verifiable acceptance conditions. No production dependencies, accounts, API keys, telemetry or cloud service.

## Start on Windows

1. Install **Node.js 22.15 or newer** and optionally Git. This release was tested on Windows with Node 24.17.0 and Microsoft Edge.
2. Extract the release ZIP to a directory you own.
3. Double-click **`start.cmd`**. It starts the local service and opens your default browser at `http://127.0.0.1:4317`.
4. Keep the console open. Press **Ctrl+C** to stop. Double-click **`demo.cmd`** for an offline simulated task.

No `npm install` is needed to run the application. Source files are the runnable distribution; no build step is required.

```powershell
# Alternative: run without opening a browser automatically
node src/server.mjs --demo

# Observe a specific code workspace; choose its Codex session in Connections
node src/server.mjs --workspace "C:\Projects\my-project"

# A different Codex data directory or port
start.cmd --codex-home "D:\CodexData" --port 4320
```

Installation, custom data folders and removal: [Windows guide](docs/INSTALL.md).

## What works in 0.1

- Discover recent local Codex sessions; prefer `CODEX_THREAD_ID` when supplied by the launching environment. Otherwise select a recent session explicitly.
- Follow task phase, tools, recent events, reported plans and reported usage. Logs are polled every two seconds and snapshots arrive over SSE.
- Optional loopback app-server WebSocket connection, with read-only list/history polling. No start/resume/approval methods.
- Six distinct acceptance states: implemented, auto-verified, awaiting human review, failed, unknown, human-accepted.
- Inspect Git working changes, commits, implementation files and named test results in dialogs.
- Record human accept/reject decisions locally. Decisions expire when the evidence or acceptance definition changes.
- Export an authoritative JSON snapshot. Export can contain local paths, event excerpts and code evidence; choose where to share it yourself.
- Chinese / English, dark / light, responsive layout, deterministic replay and a no-plan scenario.

## Define acceptance for your project

Create `.agent-progress/acceptance.json` **in the workspace you are observing**. See [the example](fixtures/acceptance.example.json).

```json
{
  "version": 1,
  "taskId": "input-validation-v1",
  "criteria": [
    {
      "id": "input-validation",
      "title": "Reject invalid input and pass the validation suite",
      "files": ["src/validation.js"],
      "checks": ["validation-tests"],
      "weight": 1,
      "requiresHuman": false
    }
  ]
}
```

Existing files mean **implemented**, not verified. Supply a current `.agent-progress/results.json` with the named checks to establish automatic verification. See [report format and integration](docs/EVIDENCE.md). Set `requiresHuman: true` for a human gate.

**Coverage = verified weight without a remaining human gate + human-accepted weight, divided by total declared weight.** Unknown, implemented, failed and awaiting-review conditions do not contribute. No criteria means **unknown progress**, even if all agent plan steps are marked completed. No ETA is invented.

Run this project's own checks and generate its evidence report:

```powershell
npm test
npm run verify

# Optional browser development dependency; not needed to run the dashboard
npm ci --ignore-scripts
npm run test:browser
npm run verify -- --browser
```

Browser tests use installed Edge on Windows. On other systems, install Playwright Chromium (`npx playwright install chromium`); these platforms are not release-certified. The browser script creates only temporary fixtures and local servers.

## Honest integration limits

Local JSONL is an **internal, best-effort format**. Only the newest 300 candidate files / 60 listed sessions are scanned; initial attachment reads at most the last 8 MiB. Truncation and malformed records are surfaced. The UI cannot know which unrelated desktop chat is foreground. A silent log cannot prove a tool is still running.

The official [app-server](https://learn.chatgpt.com/docs/app-server) transport is experimental. `thread/read` reads stored state without resuming or subscribing; a separate app-server process is not a guaranteed live mirror of the desktop app. V0.1 accepts only `ws://127.0.0.1:PORT/`, without bearer authentication. Do not expose that listener remotely.

Token totals and last-request usage are separate. Exact current context occupancy is unknown; the cumulative total is never subtracted from context capacity. Absent timestamps/fields stay unknown. Tests are not inferred from arbitrary console prose or command exit codes.

The dashboard does not change native Work/Codex UI, install Hooks, edit Codex settings, run commands from observed logs, or upload data. MCP Apps / Work are future adapters, not shipped integrations.

## Project map

```text
src/adapters/     Codex JSONL, app-server, reproducible simulation, future host contract
src/collectors/   Confined file, Git and report evidence
src/core/         Pure task reducer and acceptance engine
src/service.mjs   Source lifecycle, authoritative snapshots, durable human reviews
src/server.mjs    Loopback HTTP/SSE and origin protection
public/          Reusable DOM components, bilingual UI, themes
tests/           Unit, integration and real-browser tests
scripts/         Windows launcher and evidence-producing verification runner
fixtures/        Original example reports / session data
docs/            Architecture, research, installation, evidence format, release QA
```

[Architecture](docs/ARCHITECTURE.md) · [Official interface research](docs/INTEGRATIONS.md) · [Competitor differences](docs/COMPETITORS.md) · [Release verification](docs/VERIFICATION.md) · [V0.2 plan](docs/V0.2.md)

All implementation code and UI were written for this project. Competitor research used public documentation and licenses, without importing competitor source. The project is ready to place in a repository; this local delivery does not itself publish a public GitHub repository.

Contributions: read [CONTRIBUTING.md](CONTRIBUTING.md). License: [MIT](LICENSE). Development dependency notices: [THIRD_PARTY.md](THIRD_PARTY.md).
