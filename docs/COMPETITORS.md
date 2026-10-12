# 竞品公开资料审查 / Public competitor review

> Historical development notes for 0.1.1-rc.4. These describe implementation intent or earlier observations; they do not certify current safety or host compatibility. The original baseline had five independent-review findings; the current branch implements fixes. Current review status and remaining limits are recorded below. Read [KNOWN-ISSUES.md](KNOWN-ISSUES.md) and [VERIFICATION.md](VERIFICATION.md) before using a real session.


检索日期 / Retrieved: **2026-10-09**（Asia/Shanghai）。范围：指定官方仓库的 README、许可证正文与公开元数据；未安装或运行竞品。下列功能均为维护者公开声明，**不是本项目的实测结论**。通过 GitHub API 固定当日默认分支 HEAD，并读取对应提交的许可证正文；三个项目均为 MIT。

Scope: official READMEs, license text and repository metadata only. Competitors were not installed or executed. Features below are **maintainer claims, not independently tested behavior**. Default-branch HEADs were pinned using GitHub's API, and license text was inspected at each revision. All three use MIT.

| Repository / 仓库 | 默认分支 / Branch | HEAD SHA | 许可证核实范围 / License evidence |
| --- | --- | --- | --- |
| w4llisz/codex-visualizer | main | `409c50cd742cf3db7f1716d48c4c1f7cf06a4778` | MIT；LICENSE 正文已核实 / Text inspected |
| lbb00/a-hud | main | `75679e0a7d5b15f9c66bb04fabed6c22f2a22cdb` | MIT；LICENSE 正文已核实 / Text inspected |
| luyh7/codex-usage-dashboard | main | `61a90521dddea5173df9f77ed8c245c09e6fb718` | MIT；LICENSE 正文已核实 / Text inspected |

## w4llisz/codex-visualizer

**公开定位：** 独立 Codex app-server 仪表盘；通过 WebSocket 显示线程、工具、子 Agent、计划与 Token，并提供模拟模式。README 说明其仅监控，不处理审批、用户输入或工具执行回调；上下文窗口缺失时显示未知。**差异方向：** 增加明确验收条件、证据关联和人工验收状态。

**Declared scope:** a standalone app-server dashboard with threads, tools, subagents, plans, tokens and mock playback. The README excludes approval/input/tool callback handling and reports unknown context when unavailable. **APS focus:** explicit acceptance criteria, evidence links and human review states.

Sources: [README](https://github.com/w4llisz/codex-visualizer/blob/409c50cd742cf3db7f1716d48c4c1f7cf06a4778/README.md), [LICENSE](https://github.com/w4llisz/codex-visualizer/blob/409c50cd742cf3db7f1716d48c4c1f7cf06a4778/LICENSE), [repository metadata](https://github.com/w4llisz/codex-visualizer).

## lbb00/a-hud

**公开定位：** 多种编程 Agent 的终端状态栏，显示宿主可提供的用量、上下文、Git 与活动。Codex 使用原生页脚及可选活动伴随界面；功能因宿主而异。README 说明默认会定期获取促销资料，并提供禁用选项。**差异方向：** 专注本地浏览器中的任务验收与证据浏览。

**Declared scope:** a multi-host terminal HUD for available context, usage, Git and activity data. Codex uses a footer and optional activity companion; capability varies by host. The README describes an optional-to-disable remote promotions fetch. **APS focus:** local browser-based acceptance tracking and evidence inspection.

Sources: [README](https://github.com/lbb00/a-hud/blob/75679e0a7d5b15f9c66bb04fabed6c22f2a22cdb/README.md), [LICENSE](https://github.com/lbb00/a-hud/blob/75679e0a7d5b15f9c66bb04fabed6c22f2a22cdb/LICENSE), [repository metadata](https://github.com/lbb00/a-hud).

## luyh7/codex-usage-dashboard

**公开定位：** 从本地 Codex 日志统计会话用量，提供 Token、成本估算、缓存率、时间线、子 Agent 汇总和手动跨设备快照。README 声明支持 Windows/macOS、只读日志且不上传；估算成本不等于订阅账单。**差异方向：** 用验收状态解释任务完成情况，用量仅作为独立指标。

**Declared scope:** local Codex log analytics for tokens, estimated cost, cache rate, timelines, subagent totals and manual device snapshots. Windows/macOS support, read-only access and no log uploads are claimed. Estimated cost differs from subscription billing. **APS focus:** acceptance status explains task completion; usage remains a separate metric.

Sources: [README](https://github.com/luyh7/codex-usage-dashboard/blob/61a90521dddea5173df9f77ed8c245c09e6fb718/README.md), [LICENSE](https://github.com/luyh7/codex-usage-dashboard/blob/61a90521dddea5173df9f77ed8c245c09e6fb718/LICENSE), [repository metadata](https://github.com/luyh7/codex-usage-dashboard).

## Agent Progress Studio 的设计差异 / Design differences

以下是本项目 V0.1 的实现重点；具体测试范围以 README 与验收报告为准。不能把“竞品 README 未提到”解释为“竞品一定没有”。

These are APS V0.1 implementation priorities; validation scope is recorded in the READMEs and verification report. Missing README documentation does not prove a competitor lacks a capability.

| APS 设计 / Design | 区别与验收原则 / Distinction and acceptance rule |
| --- | --- |
| 明确验收条件 / Explicit criteria | 每项条件单独记录状态；进度分母来自条件，不来自工具调用次数。 / Criteria define the denominator; tool-call counts do not. |
| 状态分离 / Separate states | 区分已实现、已自动验证、等待人工验收、失败和未知。 / Separate implemented, automatically verified, awaiting human review, failed and unknown. |
| 可检查证据 / Inspectable evidence | 关联 Git、测试与提交；计划勾选不能代替测试证据。 / Link Git, tests and commits; plan completion is not test evidence. |
| 诚实的缺失数据 / Honest missing data | 无计划或无估算依据时只显示阶段；缺失数据标未知，不编造 ETA。 / Show phases without an estimable plan, mark missing data unknown, and avoid fabricated ETAs. |
| 适配层 / Adapters | 采集、状态引擎和界面分离；Work/MCP Apps 兼容性另行验证。 / Separate collection, state and UI; verify Work/MCP Apps compatibility independently. |

## 原创实现边界 / Independent implementation boundary

本次调研仅用于功能与许可证比较。未复制、下载运行或改写竞品实现源码、界面资产、测试或安装脚本；没有执行 README 中面向 Agent 的额外指令。Agent Progress Studio 根据用户需求与官方协议独立实现。这里的“独立实现”仅描述本次工作方式，不是对所有依赖的法律审计或对唯一性的保证。

This review informed feature and license comparison only. No competitor implementation, UI asset, test or installer was copied, executed or adapted, and agent-directed README instructions were ignored. APS was implemented independently from user requirements and official protocols. This describes the workflow, not a legal audit of every dependency or a guarantee of uniqueness.

后续若决定复用任何代码，应先固定提交、审查对应文件和许可证义务并保留所需声明；本报告不授权未经审查的复用。

Any later reuse requires a pinned revision, file-level review, license checks and required notices. This report does not approve unreviewed reuse.
