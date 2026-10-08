# Work locally lifecycle Hook experiment / 本地 Work 最小接入实验

This is a metadata feasibility extension to V0.1.0, not a full Work task adapter or a V0.2 release. Existing Codex JSONL and app-server adapters remain available. No competitor code was imported for this change.

本轮优先验证本地 Work 真实事件，并把指定会话监控置于首页核心；不实现 MCP App，不修改 Work/Codex 原生界面，也不接入 Work Cloud。

## Audit boundary / 审计基线

- Repository: `outputs/agent-progress-studio` relative to the task workspace.
- Existing V0.1.0 release commit: `5e2afd02cc9305da13f19336b7dd639e54937d85`.
- Preserved baseline branch: `audit-baseline-v0.1.0`.
- Development branch: `work-locally-hooks-mvp`.
- Recorder commit: `4e278de357a0f52fad0ae833784ef53dd435459b`.

The baseline already existed before this adaptation; no new commit is represented as an earlier snapshot. Audit the delta from that full baseline SHA to this branch's final commit. Runtime metadata, settings, local proof and trust state are excluded from Git. The separate audit workspace is not part of this change.

## Data path and interpretation / 数据路径与含义

```text
Trusted local lifecycle callback
  → bounded, asynchronous recorder
  → one atomically published JSON file per callback
  → WorkHookSource (2-second polling)
  → existing task reducer and snapshot service
  → local SSE → browser
```

The v0.0.2 recorder saves `event_type`, `session_id`, nullable `turn_id`, and its UTC `timestamp`. After the user explicitly authorized two more metadata fields, PreToolUse/PostToolUse also save `tool_name` (or null) and `tool_status` (started/succeeded/failed/unknown). A result is derived only from top-level integer exit_code/exitCode or boolean isError in an object; it is not guessed from free-form text or callback existence. It discards all other input fields without printing them; it never opens transcripts, reads secrets or makes network requests. The runtime can supply private content on stdin: the probe filters that input in memory rather than asking the host to withhold fields.

保留四项基础元数据；经用户追加授权后，工具回调另存工具名称和结果状态。工具参数、输出正文、提示词、答复、调用 ID 和隐藏推理不保存。`SessionStart` 没有回合 ID 时显示 `null`。时间戳来自记录器，不是用户点击发送或宿主开始处理的时间。

The receiver rejects records with extra keys, invalid IDs/timestamps, oversized content, unsupported events or symlink files. It reads only the configured nonrecursive spool, up to 10,000 named records. The selected session remains stable as other sessions arrive; the event panel retains the latest 160 events. Missing/empty directories never imply a connection.

`SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse` and `Stop` become **observed phases**, not task success. Tool names and explicit outcomes are shown when supplied. Plan, tokens, context, task duration, workspace and acceptance evidence remain unknown. Hook mode ignores the Codex workspace override so another task's Git evidence cannot leak into Work acceptance. Event counts do not affect progress.

## Source identity / 来源识别

Both enabled local Work and Codex sessions can fire these hooks. Their shared payload does not identify the product. A Hook session therefore starts as **Product unknown**. In Connections, select its full ID, correlate it with a controlled user test, then use **Confirm as Work locally** or **Confirm as Codex**. The UI and exports explicitly call this **user-confirmed**, not runtime-attested. Clearing the label restores unknown.

新会话 ID 可自动发现；产品名称不自动猜测。标记保存在 `.aps-data/hook-origins.json`，与事件文件分离；重启服务后标记保留，当前选择重新发现。标记 API 受现有本机同源和进程令牌保护。

已确认的 Work 会话即使留下同 ID 的 JSONL，也从 Codex 日志列表排除，并拒绝通过日志适配器选择，避免误标来源及读取超出本次授权范围的 Work 内容。尚未标记的共享运行时记录无法自动判定产品；请先在 Hooks 来源确认已知 Work 会话。

## Install, trust, run / 安装、信任与运行

1. Review `experiments/work-hooks/plugin` and copy it to a private staging directory. Keep the compatibility manifest `.codex-plugin/plugin.json` in place. Node.js must be available to the Hook environment.
2. Create an untracked `settings.json` in that plugin directory with an absolute `eventsDir`, for example `{"eventsDir":"C:\\APS\\.aps-data\\work-hooks\\events"}`. The source tree intentionally does not include private paths.
3. Use a personal or repo marketplace entry for `aps-work-hook-probe`, with `source.source` set to `local` and `source.path` relative to the marketplace root. Do not overwrite an existing marketplace. The tested catalog was named `aps-local-hook-experiment`.
4. With the user's installation authorization, install through the official `codex plugin add aps-work-hook-probe@aps-local-hook-experiment` command (or supported desktop plugin installer). The installer manages its cache/enablement. Do not manually rewrite global configuration.
5. Review the **five definitions** in the host's Hook trust interface (`/hooks` in the supported CLI). Enabled does not mean trusted. Do not bypass trust; changing definitions can require a new review.
6. Start the dashboard and choose **Work / Codex · local Hooks**, or run:

```powershell
start.cmd --work-hooks
# When the probe writes outside the default data directory:
start.cmd --work-hooks --work-hooks-dir "D:\APSData\work-hooks\events"
```

Send “你好” in a **new Work locally** chat and inspect the newly discovered session. A greeting need not use a tool; PostToolUse requires an actual supported local tool call. This dashboard never sends a test message or starts a Work on the user's behalf.

用户已明确授权本次安装，并手动完成四个 Hook 的信任。此次**没有重启客户端**，随后已收到真实事件。官方本地目录安装说明仍要求在相关加载/更新流程中重启；本次结果不能保证所有版本都可热加载。

## Tested host and packaging / 已测宿主与包装

Tested on 2026-10-09: desktop-reported version **26.1002.52244 / build 13536**, Windows package **26.1002.7124.0**, local runtime **0.162.0-alpha.2**. Feature inspection reported hooks/plugins enabled. The runtime's public `hooks/list` reported all five current definitions enabled and trusted after user review.

On this runtime, the initial portable root manifest with `extensions.com.openai.hooks` installed but exposed no Hook summaries. A compatibility-only `.codex-plugin/plugin.json` exposed all four definitions. Leaving both manifests in place did not resolve discovery. This is a version-specific observation, not a general claim about portable plugin support. The later v0.0.2 update was explicitly authorized; the new PreToolUse definition required separate user trust, while the four existing definition hashes remained trusted.

Initial controlled local test produced all four target event types, including a real Stop. Private local proof lives outside the repository; isolated fixtures are never written to that live directory. Browser tests use a separate temporary directory and cannot be counted as host compatibility evidence.

### Live browser result / 真实网页结果

The user created another **Work locally** while the dashboard was running, sent “你好” and confirmed that its reply ended. One new session appeared automatically; its selection and source label were correlated with that controlled test, without reading message content. The browser displayed five callbacks: one SessionStart, one UserPromptSubmit, two PostToolUse and one Stop.

| Observation | Measured result |
| --- | --- |
| New session visible in connection list | 751 ms after its UserPromptSubmit recorder timestamp (826 ms after SessionStart) |
| SessionStart first visible in event panel | 926 ms |
| UserPromptSubmit first visible in event panel | 851 ms |
| First PostToolUse visible in event panel | 98 ms |
| Stop first visible in event panel | 1,074 ms |
| Collector delay, all five callbacks | 90–1,116 ms |

Measurements use one Windows host, local clocks and an Edge browser sampling loop at approximately 100 ms. The first event-panel timings include navigation after automatic discovery. The second PostToolUse is excluded from per-event browser latency statistics because that probe checked event names, not unique row IDs. These are four observed first-type timings, not a latency SLA or prompt-send timing. The separate collector timestamps cover all five callbacks. Source attribution is user-confirmed; Hook fields alone cannot attest the product surface.

真实验证不需要再次安装、信任或重启客户端。测试之后网页服务继续运行，收到同机其他会话的新回调；本次约 3 分半的浏览器观察窗口不是长时间稳定性认证。

## Timing and continuous observation / 延迟与持续监控

The UI's **collector delay** measures recorder timestamp → first server read, only for callbacks arriving after attachment. Startup history is excluded. It does not include host scheduling before the recorder or browser rendering after SSE. Unknown delay remains unknown. Browser measurements must be reported separately with their sample size and start/end points.

Recording continues while the trusted plugin can execute and its spool has capacity; the dashboard discovers changes while its local service is running, and SSE reconnects when the browser reconnects. This is best-effort observation, not a lossless audit service: asynchronous hooks can arrive out of order or be dropped on session shutdown. Inputs above 256 KiB are dropped, handlers have a 3-second host timeout / 2-second recorder deadline, and storage stops at 10,000 entries (concurrent callbacks may slightly overshoot). No background Windows service or indefinite unattended retention is installed.

## Removal / 停用与卸载

Use the host's plugin controls to disable this plugin, or the official command:

```powershell
codex plugin remove aps-work-hook-probe@aps-local-hook-experiment
```

Then remove **only this plugin's entry** from the personal/repo marketplace if it is no longer wanted. Do not delete a shared marketplace, global `.codex` directory or another plugin. Retain or archive `.aps-data/work-hooks/events` and `.aps-data/hook-origins.json` as needed. Stop APS before moving its spool; to resume after archival, recreate the same empty spool location. Do not delete historical records automatically. Removing only the dashboard does not uninstall the optional probe.

## Official references

- [Lifecycle Hooks](https://developers.openai.com/codex/hooks), including the distinction between local Work/Codex orchestration and Work Cloud with local tool access.
- [Plugin packaging and local installation](https://developers.openai.com/plugins/build/plugins), including marketplace discovery and enablement.

The documented local command hooks do not extend to cloud orchestration merely because tools run locally. No claim of Work Cloud or MCP App compatibility is made here.

## Authorized tool observation / 追加授权后的工具实测

The user explicitly authorized tool names and success/failure state, then trusted PreToolUse. A new Work locally greeting session initially showed `systemError` in the desktop's read-only task metadata; its spool contained only SessionStart and UserPromptSubmit. This failed attempt was not counted as a completed turn. The dashboard cannot diagnose that host error from the permitted Hook fields.

On retry in the same user-confirmed Work locally, the real sequence was UserPromptSubmit → PreToolUse (`clocksleep`, started) → PostToolUse (`clocksleep`, unknown) → Stop. The user confirmed receiving the reply. The tool callback timestamps were 5.028 seconds apart; this is a callback interval, not exact tool CPU/runtime accounting. All five configured event types have now been observed across controlled Work tests. No input/output text was retained. `clocksleep` did not supply an allowed structured success flag, so its outcome stays unknown.

| Retry callback | Recorder UTC time, 2026-10-08 | Collector delay |
| --- | --- | --- |
| UserPromptSubmit | 22:23:06.121 | 1,118 ms |
| PreToolUse | 22:23:10.272 | 976 ms |
| PostToolUse | 22:23:15.300 | 1,961 ms |
| Stop | 22:23:21.727 | 1,569 ms |

An exact-event-ID browser observer started at 22:23:15.989 UTC, after the first three recorder timestamps. Only the subsequent Stop has an eligible live browser timing: **1,573 ms**, one sample. Earlier rows were inspected in the real UI but are not counted as measured live display latency. Prior new-session discovery timing remains the separate experiment above.

首页已实显该会话的 clocksleep 开始/返回、Stop、来源用户确认和未知总体进度。原始本机证据保留在交付 ZIP/Git 之外；工作区测试夹具从未写入真实事件目录。没有通过修改全局信任或自动重启客户端来让测试通过。

This is usable, best-effort lifecycle/tool observation, **not full Work task-content or plan monitoring**. There is no process heartbeat, exact pairing of concurrent calls, guaranteed callback order, lossless retention, automatic product attestation or guaranteed tool result status. The homepage therefore reports observations, keeps unsupported metrics unknown, and labels old running evidence unknown after 30 seconds.
