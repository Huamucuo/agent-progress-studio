# 0.1.1-rc.2 incremental review / 增量审计候选版

Status: **awaiting independent incremental audit and user acceptance**. Not publicly published. Feature development stops at this candidate until review/acceptance feedback arrives.

用户报告 Work B 对 `5e2afd02cc9305da13f19336b7dd639e54937d85` 和当时的 V0.1 Windows ZIP 给出 `READY_FOR_RELEASE`。该结论不自动覆盖本候选版。这里记录开发交接范围，不重复或替代来源审计。

## Scope

- Separate development branch: `work-locally-hooks-mvp`.
- Original metadata recorder and trusted local lifecycle Hook integration.
- Automatic discovery of observed session IDs, stable selection, explicit Work/Codex user attribution and separate Demo source.
- Bilingual live event UI, four-field base allowlist plus two explicitly authorized tool metadata fields, missing-data handling, collector timing and diagnostic limits.
- Existing Codex logs, app-server, evidence, acceptance, demo, export, language and theme behavior retained.
- Tests for privacy filtering, concurrent callbacks, source isolation, persistence, stale IDs and browser flows.
- Font redistribution inspection, documentation, candidate version and Windows packaging.

A sidecar manifest accompanies the candidate ZIP. It records the final full commit SHA, baseline SHA, every added/modified/deleted path and each distributed file's SHA256. Runtime events, personal plugin settings, trust state, transcripts, node_modules, browser binaries and Git internals are excluded. The original baseline ZIP is not overwritten.

## Real verification and limits

The user created Work locally sessions and sent “你好”; the receiver and browser observed SessionStart, UserPromptSubmit, PostToolUse and Stop. A second controlled test automatically discovered a new session while the page was open. The user confirmed no client restart. Exact measurements and boundaries are in [WORK-HOOKS](WORK-HOOKS.md).

Hook payloads do not attest the Work/Codex product; the UI labels correlated sessions **user-confirmed**, otherwise unknown. No task text, plan, tokens, context occupancy, acceptance evidence or ETA is supplied by this probe. Work Cloud, MCP App embedding and native UI modification remain unavailable. Callback delivery is best effort, bounded by time/input/storage limits; long-duration reliability is not certified.

## Review focus

Review the commit range after the baseline, then compare the supplied ZIP inventory with that final commit. The only generated ZIP addition is `.agent-progress/results.json`, produced by tests against the archived source bytes. Check the plugin's strict four/six-field projection and local write scope, source isolation, origin labels and UI claims. Font declarations and the absence of redistributed font binaries are documented in [THIRD_PARTY](../THIRD_PARTY.md).

Do not apply the previous release approval to this candidate automatically. There is no public publishing, global trust bypass or automatic client restart in this stage.

## RC.2 scope after the user's product correction

- Monitoring-first home: direct source/session selection, last observed activity, tool names, recent events and reported plan.
- Continuous Codex session discovery and stable explicit selection, including an initially empty source.
- Confirmed Work session IDs are excluded from Codex log selection even if the shared runtime leaves a matching JSONL header.
- Independent overall/plan/acceptance measures; no overall percentage from tools or acceptance. Running evidence expires to unknown after 30 seconds without a newer activity event.
- Authorized v0.0.2 Hook projection and PreToolUse; exact-row display timing in the real Work retry. Failed initial host attempt retained in the evidence narrative.
- Existing evidence/review/export/demo/language/theme features retained and regression-tested. No competitor source import, font binary, remote asset or production dependency added.
- Functional review fixes: Work exclusion before discovery truncation, manual discovery from Demo, review/app-server terminal phase rendering, browser-side expiry of cached activity and explicit feed-loss status.

The original requirements for complete Work task content, plans and reliable total remaining work are **not fulfilled** by metadata Hooks. This candidate deliberately exposes that limit and awaits the user's acceptance; it does not rename the product as Codex-only or certify full product completion.
