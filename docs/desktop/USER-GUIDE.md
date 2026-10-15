# Windows Desktop Edition / Windows 桌面版

Version is read from package.json. Current candidate: 0.3.0-desktop.1 (Windows numeric 0.3.0.1). This candidate awaits independent audit and manual acceptance; no binary Release is published. RC4 remains fixed at e02febd5184ee679372c779e1c1c07214dec8358.

## 安装与首次使用

适用 Windows 10/11 x64。运行 `AgentProgressStudio-0.3.0-desktop.1-Setup.exe`，选择个人安装目录。无需管理员权限。安装后从桌面或开始菜单打开 Agent Progress Studio。最终用户无需 Node.js、npm、命令行或浏览器。安装程序不自动运行应用。

便携版：把整个 ZIP 解压到可写目录，再双击 `AgentProgressStudio.exe`。必须保留 EXE 同目录的资源、DLL、locales 和 Portable.flag，不能只复制 EXE。便携数据在旁边的 `APS Desktop Data`；目录不可写时回退到个人 AppData 并在设置显示实际数据目录。安装版数据位于 `%APPDATA%\Agent Progress Studio Desktop`。

首次引导可以选择本地活动观察、Codex 或明确标注的模拟演示。没有事件、没有授权或已停止的回合，不会显示成正在执行。总体进度没有可靠模型时未知；计划步骤是 Agent 自报状态；验收通过率只计算明确条件。

### Work locally 活动观察

1. 打开“设置与连接” → “检查本地连接”。分别检查官方安装、五项定义信任和实际事件数量。安装目标也必须属于当前 APS；属于另一份 APS 或无法核验时，不会覆盖那份配置。
2. 若使用本应用的插件，点安装，阅读范围并在原生确认框勾选授权。应用通过官方 marketplace add / plugin add 登记独立插件，不手工改写全局配置，不替用户信任 Hook。
3. 在 ChatGPT/Codex 宿主审阅并信任该插件的五个定义。宿主是否需要重启由宿主决定，本应用不会自动重启它。
4. 选择“本地任务活动”，在宿主开始新的本地回合；收到事件后从名称/编号、来源、时间和短 ID 选择，完整 ID 可在高级信息核对。仅标记你能辨认的 Work 或 Codex；来源未知时保留 UNKNOWN。
5. 若之前已有独立探针，可通过原生目录选择器连接其事件目录。应用只读取获授权的元数据，不拥有也不会卸载其他探针。

安装本应用 Hook 成功后，会选择本应用的专用事件目录并清除旧会话选择；如果当前已暂停则保持暂停，恢复并选择观察后才启用采集。专用目录只轮转本应用专用文件名前缀的常规元数据文件，保留最近 8,000 个事件；旧独立探针目录不会被轮转。历史事件不是永久归档，重要报告请主动保存。

仅记录四个基础字段 event_type、session_id、turn_id、timestamp；工具事件另加 tool_name、tool_status，共六字段。没有明确结构化结果时状态 unknown。原始 Hook stdin 暂时在记录器内存中投影，不持久保存提示词、参数、输出或隐藏推理。未启用观察时甚至不消费 stdin。记录器使用本应用自带 EXE，通过带随机凭据的本地 Windows 命名管道提交投影；只有主进程的当前授权代次可落盘。暂停、撤销或退出会关闭管道，旧进程不能因重新授权取得新权限。

Work Hook 不提供完整任务、计划、Token、上下文和 Git 工作目录，显示未知。一次 Stop 只意味着该回合停止，不能证明软件完成。宿主事件可能缺失、延迟或异步乱序；不承诺精确实时或跨客户端兼容。

### Codex

自动发现文件名 UUID 候选；发现不读取正文。选择一个任务，明确确认它是 Codex 并授权当前后端/ID 后，才读取正文、结构化计划和 Token。正常退出后记住授权；异常结束后的权限恢复采取保守方式。证据工作目录另行授权，Work/未知正文默认拒绝。高级页保留已存在的官方本机 app-server 接入；ID-only 发现受版本能力限制，不保证全局历史列表。

侧栏回复默认关闭。在主界面连接页点“允许回复这个任务”，勾选原生确认；以后只发送你在浮窗点击提交的文字。官方本地代理必须能连接且已加载这个任务，否则明确拒绝。活动回合使用官方追加输入，空闲回合使用官方开始回合，不恢复会话、不更改模型、沙箱或审批。权限撤销立即停用，切换、隐藏或撤销会清除草稿；超时不自动重发，请先检查原客户端。Work 当前无此回复支持。

## 关闭、暂停、退出

可选桌宠在主窗口“桌宠”开启，默认关闭。四种像素动物、六种动画状态、本地养成、五项商店、PNG 包导入、透明区域穿透、拖动/大小/固定/置顶/托盘恢复详见 [桌宠完整指南](DESKTOP_PETS.md)。Pet Mode is optional and off by default; the linked bilingual guide covers animation, privacy, local progression, shop and pack import. 主窗口关闭时，独立桌宠仍启用并显示也会保留后台；明确退出仍停止所有自有窗口与采集。

- 最小化：正常进入任务栏，监控继续。
- 浮窗 ×：默认隐藏；隐藏后继续监控可在浮窗设置关闭。主窗口 ×：浮窗仍显示或已开启托盘后台时隐藏，否则退出。托盘文字标出监控开启或暂停。
- 暂停：关闭采集器、取消订阅、清除 UI 及在内存里的会话内容，保留本机授权文件；恢复时创建新权限实例，保留选定会话。
- 退出：托盘或窗口的“退出”，等待授权持久化后结束本应用进程。不会继续消费事件。本应用控制的记录器不能继续写入；此前独立安装的其他探针不受本应用控制。
- 重复打开同一数据配置：激活已有窗口，不启动第二套采集器。不同便携副本的数据配置互相独立。
- 开机启动：设置中自愿开启，默认关闭；只登记当前 EXE，不安装常驻系统服务。便携版移动后应关闭并重新开启登记。

错误时安全暂停，弹出重新打开窗口、查看日志或退出。日志只包含时间戳和固定诊断代码，不保存异常原文、路径、聊天或工具参数。重新打开窗口不自动恢复已暂停监控。外部损坏导致 Electron 本身无法启动时，可能只有 Windows 错误提示。

## 导出、撤销与卸载

导出使用原生保存对话框；保存前后重新检查原始授权和会话排序代次。撤销会清除 UI、旧缓存、订阅和待发送回应，旧事件不能在重新授权后复活。用户已经保存到磁盘的导出不会被远程删除；请自行保护这些报告。报告含授权范围内内容，应用不上传。

移除本应用 Hook：设置中“移除本应用 Hook”，再次确认后暂停监控，调用官方 plugin remove，仅移除带本应用独立身份的插件。宿主信任及插件缓存由官方客户端管理。本地历史和插件目录保留供用户检查。卸载桌面应用前先移除其 Hook，并关闭开机启动；不要在 Hook 执行时移动 EXE。

安装版卸载：Windows 设置 → 应用 → Agent Progress Studio Desktop → 卸载。卸载保留个人授权、报告和日志；如果确认不需要，再自行删除其专用 AppData 目录。便携版退出后删除自己的解压目录。不要删除其他 Codex/Work 插件或会话目录。

安装包尚未使用代码签名证书，Windows 可能显示未知发布者。候选阶段用交付 SHA256 核对。未宣称 SmartScreen 信誉认证。桌面 EXE 的版本资源采用 Windows 数字版本 0.3.0.1，程序/GUI/package/ZIP/文档采用完整 SemVer 0.3.0-desktop.1。

## 浮窗、侧拉与通知

点“打开浮窗”，拖动标题条移动，自由悬浮时拖动右下角手柄缩放；手柄获得焦点后也支持方向键调整。解锁位置时，拖到左/右/上/下边缘松开会吸附；可关闭自动吸附。侧边收缩只剩 2 × 24 DIP 短小贴边提示（150% 缩放约 3 × 36 个屏幕像素），鼠标接近出现 28 × 44 DIP 小 APS 标签（上下边缘为 64 × 28 DIP），单击 APS 即可展开，无需拖拽；默认悬停不直接打开大面板。左向右、右向左、上向下、下向上展开。点图钉固定展开，取消后移出收缩。固定位置、置顶、固定展开是三个独立开关。标签平时完全透明（不透明度 0%），不显示窗口并穿透鼠标，真实露出下层桌面。鼠标靠近时不透明度 50%，点击展开后为 100%。离开并收缩后恢复完全透明；旧版保存的抽屉透明度不会覆盖这三档行为。

The short cue is fully transparent and click-through at rest, 50% opaque near the pointer, and 100% opaque after clicking to expand. Retraction restores full transparency. Legacy saved drawer opacity no longer overrides these states.

展开后上方为仪表盘，下方为消息及回复框。只有现有 Codex 正文权限有效时显示最近公开用户/助手消息，最多 20 条，每条最多 2,000 字符，不显示隐藏推理、工具参数或输出。Work 尚无受支持的消息/回复接口时明确显示不可用。新消息更新不清除正在输入的草稿；切换、隐藏或撤销会清除。回复仍需独立授权及可用的官方本机接口，界面中有输入框不代表宿主已经能够接收。

托盘提供浮窗显示/隐藏、主界面、置顶、暂停/恢复、设置、自动关机管理和退出；默认快捷键 Ctrl+Alt+Shift+A 可在设置更改。窗口按显示器工作区域恢复，丢失显示器或越界时回到安全位置。实际多显示器和 125%/200% 缩放仍需人工验收；150% 单屏真实拖动已测，纯几何测试不替代物理环境。

通知默认只包含状态元数据，位于侧栏附近并随窗口移动，点击穿透且不抢焦点。展开时可在通知中心查看。敏感预览默认关闭，开启后仍受原内容权限约束；撤销清除队列、当前弹窗和历史。通知不把旧历史重放成新事件。

## 进度、解释、缓存与自动关机

没有计划显示“尚未获得任务计划”；总体进度一直 UNKNOWN，除非将来提供完整范围度量。计划完成数和验收通过率分别计算。智能解释只使用事件、明确命令结果和实际验收证据；测试命令返回成功不等于所有产品功能验证通过。可以展开看事实、推断、依据与未确认信息。没有新证据仍持续观察，不谎报 Agent 此刻正在执行。

每日缓存清理仅调用本应用 Chromium 缓存清理接口，保留授权与历史并提示结果。设置可关闭自动清理或立即清理；它不删除私人会话、源码、独立探针或整个数据目录。自有 Hook 轮转另行限制 8,000 个事件。

“自动关机”默认全部：范围是当前来源中已接入且授权的任务，不是整台电脑所有 GPT/云任务。初次开启需明确授权；任务结束后不会再次询问。仅在执行结束、无待完成计划/验收阻碍、官方空闲且没有后台执行等最新证据都满足时，经过至少 120 秒稳定期和至少 60 秒倒计时调用普通 Windows 关机。主界面、浮窗和托盘均能取消；新活动、撤销、断线或重启会阻止/取消。不开强制关闭，其他程序仍可能阻止 Windows 关机。

Work Hook 没有可靠后台状态，所以不能单独触发关机；本次实际宿主官方控制套接字也不可用。此时显示不可用/等待，不伪造成功。开发和验收测试均仅模拟，未真实关闭 Windows。开关不跨重启保存。

## Installation and operation (English)

Run the per-user Setup EXE or extract the **entire** portable ZIP and open AgentProgressStudio.exe. End users need no Node, npm, command prompt or browser. Keep all bundled DLLs/resources. Portable.flag selects sibling data; an unwritable folder falls back to AppData. The first-use guide separates available collection, actual observed activity and unknown data.

Work setup uses the official local plugin installer only after native checkbox consent. Client trust is separate; never assume installed means trusted or running. Select the metadata adapter and a full session ID, then explicitly classify its source. Existing probes can be connected through a native folder picker. Four base metadata fields, six for tool events; no transcripts or tool output are persisted. The live main-process authority owns the authenticated Windows named pipe and the write permission. Hook input is not consumed when observation is inactive.

Codex UUID discovery does not read bodies. A specific backend/ID requires explicit Codex confirmation and content permission, remembered after clean exit; workspace evidence is separate. Work/unknown bodies stay denied. ID-only RPC discovery depends on negotiated capability. Replies are separately default-off and require a loaded authorized Codex thread and available official local control socket. No resume or runtime-policy overrides; drafts clear on hide/switch/revoke and delivery timeouts never auto-retry. Work replies are unsupported.

Floating close hides it; background-while-hidden is configurable. Main close hides while the floating monitor or opted-in tray mode remains, otherwise quits. Login startup is opt-in. Pause clears live UI/subscriptions/collectors; resume creates a new authority. Quit stops owned collectors/ingress. Independent probes are not managed. Duplicate launches focus the existing profile. Diagnostics use fixed codes only.

Drag-release docking supports all four edges; a 2 × 24 DIP visible cue grows into a 28 × 44 DIP APS tag on vertical edges (64 × 28 on horizontal edges) on pointer approach; one click opens the inward translucent drawer. Leaving shrinks it again. Unused native backing areas cannot draw or intercept clicks. Free floating windows resize through the bottom-right handle or its arrow keys. Position lock, top and pinned expansion are independent. Ctrl+Alt+Shift+A/tray restore it. Popups attach to the sidebar visible region regardless of legacy fixed-corner preferences, are non-focusable/click-through, metadata-only by default and permission-bound across queue/history/output. Daily cleanup covers only Chromium caches, with a result notice.

The expanded drawer puts its dashboard above messages and the reply composer. Public user/assistant messages require the existing confirmed Codex body permission and are bounded to 20 entries of 2,000 characters; reasoning and tool input/output are excluded. Work chat/replies are unsupported. Message updates preserve an in-progress draft; hide/switch/revoke clear it. Reply delivery requires separate opt-in and an available official local host interface; the presence of a composer does not establish delivery compatibility.

Automatic shutdown defaults to all authorized monitored tasks in the current source. It requires initial native opt-in, official idle/background proof and ended execution, then stability/countdown; no post-task question. Unknown Work background state or unavailable official control blocks shutdown. Cancellation is always available; restart never restores arming. Tests simulate shutdown only; normal Windows shutdown is non-forced and can be blocked by other applications.

Remove this app's Hook in its owning installation before moving/uninstalling; another profile cannot overwrite/remove it. Disable login startup. Uninstall through Windows Apps, or remove the portable folder after Quit. Data and saved exports are retained. Candidate binaries are unsigned; verify hashes. Windows version 0.3.0.1; product 0.3.0-desktop.1.

## Developer reproduction

Use Node >=22.17 on Windows x64. `npm ci` installs pinned **build/test** dependencies; `npm start` opens Electron, `npm test` runs Node regression, `npm run test:browser` runs original Edge flows, `npm run test:desktop` runs the native fixture suite. `npm run desktop:build` produces NSIS without publishing; `npm run desktop:unpacked` produces the runtime folder. Set CSC_IDENTITY_AUTO_DISCOVERY=false when no signing is intended. `tests/desktop-packaged.mjs <fresh EXE> <label>` tests the packaged runtime with a no-Node PATH; it enables a local Chromium debug port only for isolated acceptance. Normal app startup opens no HTTP/SSE/debug listener. Source/web compatibility remains available via web:start and web:demo for developers.

Native save picker and first-use plugin trust require human host acceptance. Automated events in the test suite are synthetic, explicitly marked as such. See the delivery handoff for actual observations, package inventory, dependency advisories and pending host/clean-machine checks.


指定旧 Codex 会话不会因为新任务太多而自动失去连接：对当前选择的 UUID 单独执行有上限的文件名/属性定位，再交给原有权限网关。没有正文授权时只列元数据；授权撤销后不再读正文。标准目录存在同 UUID 多个文件或无法完整核实身份时保持不可用。大日志仍按原有最多 8 MiB 增量/尾部窗口读取，不加载整个文件到内存。

An explicitly selected older Codex UUID remains available outside the recent discovery view through bounded metadata-only lookup. Body permission remains separate; duplicates or incomplete identity checks default deny. The existing reader keeps its 8 MiB incremental/tail bound.
