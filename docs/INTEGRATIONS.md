# Official interface research / 官方接口调研

Checked 2026-10-09. Public documentation describes capabilities; actual availability can differ by client version/account. Local probe: Codex CLI `0.162.0-alpha.2`; generated schema inspected locally, not vendored. No competitor source was copied or executed.

## Codex app-server

The documented protocol uses ID-correlated requests/responses and notifications, with an initialization handshake. Read-only `thread/list` and `thread/read` allow session discovery/history; the latter does not resume a session or subscribe to its stream. Plan and token notifications are useful only when delivered to that connection. WebSocket support is experimental. Our own local endpoint successfully returned the current thread, but its stored status differed from the actively tailed log; this is why the UI labels source and limitations.

V0.1 使用只读列表/历史读取与实际收到的通知；另起服务不等于获得桌面端活跃会话的完整实时流。默认使用本地日志并注明内部格式风险。

Sources: [app-server](https://learn.chatgpt.com/docs/app-server), [original documentation route](https://developers.openai.com/codex/app-server).

## MCP Apps UI resources

A tool can associate `_meta.ui.resourceUri` with a `ui://` resource. Its contents use `text/html;profile=mcp-app`. A compatible host renders the component in an iframe; the shared JSON-RPC `ui/*` bridge over `postMessage` handles initialization, tool results and interactions. Resource CSP declares narrow network/asset origins. Optional `window.openai` features require capability detection.

可嵌入的是通过 MCP 工具返回的 UI 资源，例如任务摘要、验收清单、证据详情与确认控件。独立本机服务不能因网页有 URL 就自动成为 ChatGPT 组件。

Source: [Add UI to your MCP server](https://developers.openai.com/plugins/build/chatgpt-ui).

## Reachability and host-controlled surfaces

The documented ChatGPT quickstart connects a publicly reachable `/mcp` URL. A user's loopback server is not a generally reachable cloud endpoint. Therefore this release keeps filesystem discovery, Git access and local evidence collection in the standalone browser/service. Remote hosting or a secure bridge would be a separate, explicit privacy decision.

The current plugin Extensions documentation describes host-provided sidebar/composer/file-viewer extension points. These are declared capabilities with host support, not permission to rewrite native Work or Codex screens. Work plugin invocation is documented, but a universal Work task-event stream or arbitrary native UI mutation API was not established by the reviewed sources.

Sources: [MCP quickstart](https://developers.openai.com/plugins/build/app-quickstart), [Plugin Extensions](https://developers.openai.com/plugins/build/extensions), [Work plugin quickstart](https://developers.openai.com/plugins/quickstart).

## Plugin Hooks

Hooks run commands or MCP tools at lifecycle points such as SessionStart, PreToolUse, PostToolUse and Stop. Installed plugins can bundle them, but non-managed definitions need trust review. Background hooks have different notification visibility. A plugin package does not deploy local scripts to every execution environment.

The original V0.1 release installs **no Hook**. The `work-locally-hooks-mvp` development branch adds a separately authorized, bounded asynchronous metadata recorder and receiver. All four target events were observed in controlled local tests after user trust; the client did not need to restart in this test. Product labels remain user-confirmed because callbacks carry no product field. It does not block/rewrite tools, read transcripts or make network requests. See [the experiment and measured limits](WORK-HOOKS.md).

Sources: [Hooks](https://learn.chatgpt.com/docs/hooks), [Package your plugin](https://developers.openai.com/plugins/build/plugins).

## Capability matrix

| Surface | Feasible component | Local filesystem / native UI boundary | V0.1 |
| --- | --- | --- | --- |
| Windows browser | Full dashboard, evidence dialogs, replay, reviews | Local service reads bounded local data | Implemented and tested |
| ChatGPT MCP Apps | Tool-returned summary/checklist/evidence resource | Sandboxed component, negotiated tools/CSP; no automatic local drive access | Contract reserved |
| Supported plugin Extensions | Host-declared sidebar or viewer integration | Requires SDK/host support and capability negotiation | Research only |
| ChatGPT Work locally | Opt-in local lifecycle Hook metadata | Four fields only; no product attestation, full task stream or native screen replacement | Real Hook experiment on the development branch |
| Work Cloud with local tool access | Different cloud orchestration boundary | Local command/plugin hooks are not supported by the documented cloud path | Not integrated |
| Codex native interface | Public app-server and optional approved Hooks supply data | This dashboard cannot rewrite native panels | Read-only adapters only |
