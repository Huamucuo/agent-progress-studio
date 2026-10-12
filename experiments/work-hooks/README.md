> Experimental component: the repair branch adds resource-identity and fixed-grant read guards. Use synthetic events while real-host acceptance remains pending. See [known issues](../../docs/KNOWN-ISSUES.md).

# Local lifecycle Hook feasibility probe

Experimental, metadata-only support. An isolated recorder test is **not** proof that ChatGPT Work locally fired a Hook.

The receiver and bilingual UI are now implemented in the development branch. See [setup, runtime findings, data contract and removal](../../docs/WORK-HOOKS.md). Real callbacks were observed after explicit installation authorization and user trust; no client restart was required in this local test. The source labels remain user-confirmed because the payload has no product field.

Baseline: `5e2afd02cc9305da13f19336b7dd639e54937d85` (V0.1.0). Development branch: `work-locally-hooks-mvp`.

Recorder v0.0.2 keeps `event_type`, `session_id`, nullable `turn_id`, and its UTC `timestamp`. With explicit user authorization, PreToolUse/PostToolUse also keep `tool_name` and `tool_status` (started/succeeded/failed/unknown). It reads only integer tool_response.exit_code/tool_response.exitCode or boolean tool_response.isError to derive an outcome; free-form output is not parsed. It never opens transcripts or sends network requests. Standard Hook input can contain private text; all fields outside that allowlist are discarded without logging. Missing turn IDs remain null. A Stop event means that a turn stopped, not that an acceptance condition passed.

Non-tool records have exactly four fields; current tool records have exactly six. The receiver also accepts legacy four-field tool records. [Field sources and synthetic examples](../../docs/WORK-HOOKS.md#data-path-and-interpretation--数据路径与含义). RC3 does not change the recorder protocol or Hook definitions.

Copy this `plugin/` to a private staging directory and create a **local, untracked** `settings.json` inside it:

```json
{"eventsDir":"C:\\your-APS-project\\.aps-data\\work-hooks\\events"}
```

Review the exact files before installing through a personal/repo marketplace and the official plugin installer. This source does not register or install itself. No credentials, user-specific configuration, runtime Hook events, or trust state belong in Git. Installation, enablement and trust are separate. Never use a trust-bypass flag.

The probe registers SessionStart, UserPromptSubmit, PreToolUse, PostToolUse and Stop as background command hooks with a three-second host timeout and two-second recorder deadline. It discards inputs above 256 KiB and stops writing at 10,000 directory entries. These bounds and background scheduling can drop events; this experiment is not a complete audit log.

On the tested runtime 0.162.0-alpha.2, a portable root manifest with `extensions.com.openai.hooks` returned no Hook summaries. The compatibility-only `.codex-plugin/plugin.json` loaded the original four definitions, initially `untrusted`; v0.0.2 adds a separately trusted fifth PreToolUse definition. This is a local observation about the tested version, not a claim that portable manifests fail everywhere.

Hooks share a runtime across local Work and Codex. A session ID alone does not prove which product surface created it. Keep source attribution unknown until the new Work test is correlated explicitly; never label every callback as Work.

Real validation requires a newly created **Work locally** chat after trust: send “你好”, then perform a separate harmless local tool call for PostToolUse. Report the actual event set, first-seen session, measured delay, restart requirement and monitoring limits. Keep test fixtures separate from the real event directory.

References: [Hooks](https://learn.chatgpt.com/docs/hooks), [plugin packaging](https://developers.openai.com/plugins/build/plugins). Plugin installation and trust are user-authorized operations; this repository does not modify global configuration automatically.
