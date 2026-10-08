# Agent Progress Studio

**看见执行，检查证据，确认真正完成。**

[English](README.md) · V0.1.1-rc.2 · MIT 开源许可证 · 本地 Codex + Work Hook 实验

原创的本地 AI 编程 Agent 仪表盘。把任务活动、Agent 自报计划和验收证据分开显示。运行时零第三方依赖，不需要账号、API 密钥或云服务。

**当前开发分支新增 Work locally Hook 实验。** 单独安装并信任可选元数据探针后，可自动发现会话 ID、查看真实生命周期回调、工具名称和明确的结构化结果状态，并逐会话确认 Work/Codex 来源；计划、Token 和验收仍保持未知。[安装、实测发现与卸载](docs/WORK-HOOKS.md)。完成探针配置后运行 `start.cmd --work-hooks`。原始 V0.1.0 发布 ZIP 保持不变。

此候选版等待增量来源/许可证审计与用户人工验收；用户报告的 V0.1 审计通过结论仅适用于原基线与原 ZIP。[本次审计范围](docs/INCREMENTAL-REVIEW.md)。

## 观察指定任务

直接使用首页的**数据来源和指定会话**。观察 Codex 日志或本地 Hooks 时，每两秒自动发现新会话并更新事件，保留已选中的会话；空来源收到首个会话后自动选中。首页先显示最近活动，30 秒没有新的活动证据时将运行状态降为未知，不把历史记录当作存活心跳。Stop 或回合结束不代表软件任务完成。

三种度量分别显示：**任务总体进度**在缺少可靠剩余工作模型时未知；**计划步骤进度**为 Agent 报告的已完成 / 总步骤；**验收通过率**按下文明确条件与权重计算。工具调用次数不参与任何进度。工具与最近事件优先，Git、测试、人工验收继续保留。

Work 属于部分监控：此自愿启用的探针不采集任务文本、结构化计划、Token、精确上下文、工作目录和任务验收证据。用户的 Windows Work locally 实测触发了五类事件；后一次工具测试首次出现宿主错误，重试才收齐工具开始、返回和 Stop。实测详情与限制见 [WORK-HOOKS](docs/WORK-HOOKS.md)，不把测试数量视作产品完成证据。

## Windows 快速开始

1. 安装 **Node.js 22.15 或更新版本**；查看 Git 证据还需要 Git。本版实测环境为 Windows、Node 24.17.0、Microsoft Edge。
2. 解压交付 ZIP 到自己的目录。
3. 双击 **`start.cmd`**，启动服务并用默认浏览器打开 `http://127.0.0.1:4317`。
4. 保持启动窗口运行，**Ctrl+C** 停止。双击 **`demo.cmd`** 可以直接演示。

正常使用无需 `npm install`，源码本身即可运行，无需编译。若端口已被使用，可运行 `start.cmd --port 4320`。

```powershell
# 只启动服务，自己打开浏览器
node src/server.mjs --demo

# 指定实际代码工作目录，再在“连接管理”选择对应会话
node src/server.mjs --workspace "C:\Projects\my-project"

# Codex 数据不在默认目录时
start.cmd --codex-home "D:\CodexData" --port 4320
```

[安装、停止与卸载说明](docs/INSTALL.md)。基础仪表盘只需停止服务并删除解压目录；可选 Hook 插件须另外卸载。本工具不注册系统服务或自动启动项，不手工修改全局 Codex 配置。

## 已实现的使用流程

- 自动发现本地 Codex 会话；启动环境存在 `CODEX_THREAD_ID` 时优先匹配，否则建议最近会话，由你选择。
- 观察当前任务、执行阶段、工具、事件和结构化计划。每两秒采集一次，浏览器通过 SSE 获取更新。
- 可连接明确启动的本机 app-server，读取线程列表和历史，不恢复线程、不批准操作。
- 分别显示“已实现、已自动验证、等待人工验收、失败、未知、已人工通过”。
- 打开 Git 差异、提交记录、实现文件、测试报告；人工验收备注可保存并在重启后读取。
- 证据或验收清单变化后，旧人工确认失效；导出包含来源标识的 JSON 报告。
- 中英文与深浅主题切换会保留；适配窄窗口；演示可暂停、单步、重播和查看最终状态。

## 为自己的任务定义验收

在被观察的代码目录添加 `.agent-progress/acceptance.json`，参考 [完整例子](fixtures/acceptance.example.json)。每项条件有稳定 ID、清楚的文字要求、可选实现文件、命名测试、权重（默认 1）及人工确认开关。

```json
{
  "version": 1,
  "taskId": "input-validation-v1",
  "criteria": [
    {
      "id": "input-validation",
      "title": "非法输入会被拒绝，并通过输入校验测试",
      "files": ["src/validation.js"],
      "checks": ["validation-tests"],
      "weight": 1,
      "requiresHuman": false
    }
  ]
}
```

文件存在只支持“已实现”。自动验证还需要当前源码对应的 `.agent-progress/results.json` 中提供同名测试。需要人工确认时设置 `requiresHuman: true`。[报告格式与接入方式](docs/EVIDENCE.md)。

**验收通过率 = 不再需要人工确认的已自动验证条件权重 + 已人工通过条件权重，再除以全部条件权重。**

已实现、失败、未知和等待人工验收均不算通过。没有清单时进度是“未知”，不会把工具次数或计划完成数换算为百分比；不提供虚假预计结束时间。

## 开发与测试

```powershell
npm test
npm run verify

# 以下浏览器测试才需要开发依赖
npm ci --ignore-scripts
npm run test:browser
npm run verify -- --browser
```

`verify` 会重新运行测试，并生成带源码指纹的本地证据报告。浏览器测试在 Windows 使用已安装的 Edge，测试文件和 Git 仓库均为一次性样例。其他系统可安装 Playwright Chromium，但本版没有认证其平台支持。

## 数据和接口边界

本地 JSONL 是 Codex 内部格式，只能尽力兼容。最多扫描最新 300 个候选文件并列出 60 个会话，首次附加最多读取日志尾部 8 MiB；截断、格式异常会显示诊断。最近会话不等于前台会话；安静的日志不能证明工具仍存活。

[官方 app-server](https://learn.chatgpt.com/docs/app-server) 的 WebSocket 是实验传输。只读 `thread/read` 不恢复线程、不建立对其他客户端活跃回合的订阅；另起进程不保证镜像桌面端实时状态。V0.1 仅接受 `ws://127.0.0.1:端口/`，不支持 Bearer 认证端点，也不应对外网暴露。

Token 累计值、最近请求大小和模型上下文容量分别显示；精确实时上下文占用保持未知。缺失数据、未报告计划和不可确认时间不会补造。不会仅因为命令返回成功就声称任务已通过测试。

服务只监听本机，不上传代码、提示词或令牌，无外部字体/CDN。导出报告可能含本地路径和代码摘录，由你决定如何分享。人工验收保存在本项目的 `.aps-data`；网页不自动安装 Hook、不更改 Codex 设置，也不读取认证文件。可选探针仅保存四项元数据，安装和信任另行明确授权。

## 文档与源码

[架构](docs/ARCHITECTURE.md) · [官方接口调研](docs/INTEGRATIONS.md) · [竞品差异](docs/COMPETITORS.md) · [版本验收记录](docs/VERIFICATION.md) · [V0.2 MCP Apps / Work 规划](docs/V0.2.md)

`src/adapters` 负责采集适配；`src/core` 负责状态与验收；`src/collectors` 负责证据；`public` 为可复用组件、双语与主题；`tests` 为自动化测试。全部产品代码与 UI 为本项目原创，没有导入竞品源码。

交付采用 [MIT 许可证](LICENSE)。本次创建的是可发布的本地开源项目，没有自动上传到 GitHub。MCP Apps 留待后续；Work locally 目前只验证元数据 Hook 接入，不能修改它们或 Codex 的原生界面。
