# Installation and removal

This candidate is a development preview with scoped boundary fixes and unverified real-host compatibility. Use the [known-issue list](KNOWN-ISSUES.md) before deciding to test it. Real-session use and a stable release require current independent review, required checks and separate manual host acceptance.

## Isolated demo

1. Install Node.js 22.x at version 22.17.0 or later, or 24.x at version 24.2.0 or later (`^22.17.0 || ^24.2.0`). Node 23, earlier Node 24 releases and other major versions are outside the declared support range. Current local evidence covers Node 24.17.0 on Windows x64.
2. Put the source in a directory you own. The runnable distribution is the source; it needs no build or npm installation.
3. From that directory, run `node src/server.mjs --demo --codex-home ./work/synthetic-codex --data-dir ./work/demo-state`.
4. Open `http://127.0.0.1:4317`. Ctrl+C stops the server.

The Windows launcher is `demo.cmd --codex-home ./work/synthetic-codex --data-dir ./work/demo-state`; it opens the default browser. `--port 4320` changes the port and `--no-open` suppresses automatic browser opening in the launcher.

An explicit empty synthetic Codex directory matters even in demo mode: the connection list still discovers the configured session directory. Default startup can discover your normal local directory, although intended body grants remain separate. Do not point the demo at private data or reuse real `.aps-data` permissions.

## Experimental real connections

The code includes local JSONL, loopback app-server and optional local Hook adapters. Their presence is an implementation claim, not current approval to use private sessions. Known defects are documented in KNOWN-ISSUES.md. Data formats, real host versions and notification delivery need renewed manual verification.

No Hook is installed by starting the dashboard. The optional experiment requires separate review, installation, enablement and trust. Historical setup notes are in WORK-HOOKS.md; use synthetic events while renewed real-host acceptance remains pending. Never bypass a host's trust prompt.

## Stop, data and removal

The dashboard registers no background service or automatic startup item. Keep the terminal open and stop it with Ctrl+C. Local review/permission data stays in the chosen data directory; the default is `.aps-data` beside the source. It is private, ignored and absent from this source preview.

To remove an isolated demonstration, stop the service and remove only the disposable directory you explicitly selected. Do not delete existing Codex logs, permissions, real reviews or optional-plugin data as part of software removal. A separately installed Hook plugin needs its own host uninstall flow; stopping this dashboard does not uninstall it.

Language/theme use browser localStorage and navigation uses sessionStorage. Exported JSON is a local download that may contain private data. Already saved exports are not erased by revoking a grant.

Dependency installation is only for development/browser tests: `npm ci --ignore-scripts`. Node.js, Git, Edge and Playwright browser binaries are separately provisioned tools, not bundled project assets. Only Windows/Node 24.17.0 is locally measured in this preparation; other platform/version combinations remain unverified until recorded.
