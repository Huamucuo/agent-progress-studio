# Windows installation and removal / 安装与卸载

## Install / 安装

- Required: Node.js >=22.15. Download from [nodejs.org](https://nodejs.org/en/download). Git is optional for the evidence pane. Edge or another modern browser is needed.
- 必需：Node.js >=22.15 与现代浏览器。查看 Git 证据需要 Git。无需管理员权限、全局 npm 安装或额外服务。
- Extract the ZIP; keep `src`, `public`, `scripts`, `package.json` and launchers together. Double-click `start.cmd` or `demo.cmd`.
- 解压后保持目录完整。双击 `start.cmd` 观察本地 Codex；`demo.cmd` 打开模拟任务。
- Source-only terminal launch: `node src/server.mjs`. Running does not install npm packages.

## Options / 启动参数

| Option | Meaning / 含义 |
| --- | --- |
| `--demo` | Deterministic simulated source / 使用模拟数据 |
| `--work-hooks` | Observe the separately trusted local probe / 观察单独信任的本地 Hook 探针 |
| `--work-hooks-dir "D:\APSData\work-hooks\events"` | Override the probe spool / 指定真实事件目录 |
| `--workspace "C:\repo"` | Evidence workspace override / 明确指定证据代码目录（建议仓库根目录） |
| `--codex-home "D:\CodexData"` | Codex data root containing `sessions/` / Codex 数据目录 |
| `--port 4320` | Alternate loopback port / 避免端口冲突 |
| `--data-dir "D:\APSData"` | Own directory for local reviews / 人工验收记录保存目录 |
| `--no-open` | Launcher only: no automatic browser / 仅启动器：不自动打开网页 |

Custom workspace selection is explicit. Without `--workspace`, the selected Codex session's recorded working directory is used. Demo and Hook mode never read real project evidence. Hook mode ignores `--workspace` because the metadata cannot associate a repository with a Work session. Optional probe installation, trust and removal: [Work Hooks experiment](WORK-HOOKS.md).

没有指定工作目录时，使用已选择会话中记录的目录。演示源不读取实际代码证据。关闭浏览器不会关闭服务；在启动窗口按 Ctrl+C。

## Optional app-server / 可选官方接口

In another terminal, start an endpoint you own:

```powershell
codex app-server --listen ws://127.0.0.1:4500
```

Then enter that address in Connections → Codex app-server. Its transport is experimental. The dashboard supports unauthenticated literal loopback endpoints only. Authentication support is deferred; do not disable authentication on an existing secured service just to connect. `thread/read` does not resume/subscribe, so live desktop data may be more complete via the log source. Stop this separately launched server with Ctrl+C when finished.

在“连接管理”中填写上述地址。不要把本机端点改成外网监听。此连接只读，不能保证获取别的进程的实时计划/Token 通知。应用不自动启动、停止或接管现有 Codex 服务。

## Upgrade / 升级

Stop the dashboard, extract a new version to a new folder, and optionally copy `.aps-data/reviews.json`. Keep old reports/exports until you have verified the upgrade. Evidence fingerprints will invalidate approvals when sources/definitions differ.

停止服务后解压新版本到新目录，需要时复制 `.aps-data/reviews.json`。保留旧导出；版本变化导致的验收失效属于正常行为。

## Uninstall / 卸载

1. Press Ctrl+C in the dashboard's launch window; close its browser tab.
2. Save exported reports or `.aps-data/reviews.json` if needed.
3. Delete the extracted Agent Progress Studio directory. If `--data-dir` was used, remove only that explicitly chosen data directory if you no longer need its records.
4. Optionally clear site data for `http://127.0.0.1:4317` to remove language/theme preferences. Node, Git and your browser are shared tools; leave them installed if other projects use them.

停止启动窗口 → 按需备份报告/验收记录 → 删除解压目录即可。自定义数据目录单独按需处理。不会留下系统服务或注册表启动项。若安装过可选 Hook 探针，先按 [独立卸载步骤](WORK-HOOKS.md#removal--停用与卸载) 移除它；仅删除网页目录不能卸载插件。不要删除 `.codex`、用户仓库或其他应用。

## Troubleshooting / 排障

- Port in use: `start.cmd --port 4320`.
- Unknown metrics: the source did not supply them; this is intentional.
- No sessions: check the Codex data directory; open a local session first.
- No Git: install Git or pass the repository root as `--workspace`.
- Stale report: rerun the project test producer against unchanged sources.
- A large/binary/symlinked source tree can exceed fingerprint limits; verification remains unknown. See EVIDENCE.md before changing those limits.
- Browser offline: keep the service terminal running; reload the tab. SSE reconnects and receives the latest authoritative snapshot.
