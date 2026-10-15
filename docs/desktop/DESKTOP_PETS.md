# 桌宠模式 / Desktop Pet Mode

版本：0.3.0-desktop.1。可选模块，默认关闭；不改变任务进度、权限或自动关机条件。无需账号、云服务、模型 API 或额外付费。

## 开始使用

主窗口点“桌宠” → “启用桌宠模式”，选择小狗、橘猫、水豚或线描犬。四种角色均提供待机、工作、等待、开心、失败、睡觉六种四帧动画。它们按本项目生成的温暖像素图集绘制；美术仍需用户验收，素材权利仍需独立审查。

宠物独立于监控浮窗。拖动宠物本体移动；设置可调整 96–384 DIP 大小、固定位置、始终置顶、显示/隐藏、动画与低性能模式。固定位置与置顶分别控制。透明背景没有绘制像素的区域穿透鼠标；本体可以点击抚摸、右键打开菜单、双击打开信息。主动隐藏释放宠物窗口和渲染进程，保留位置与本地存档；托盘“桌宠”恢复时创建新窗口并重新取得当前权限状态，不恢复旧快照。所有角色无音效；静音设置保留，动画可以全部关闭。

展开的监控窗与宠物重叠时，宠物暂时让出操作区域；收起后恢复原位置，不自动移动被固定的宠物。显示器变化时按可用工作区恢复位置。多显示器与不同 DPI 的实际验收仍需人工完成；不能把坐标单元测试当作物理显示器验证。

## 状态含义

| 观察到的事实 | 宠物表现 | 边界 |
| --- | --- | --- |
| 当前授权范围的新回合或工具执行 | 工作 | 连接成功本身不足以触发 |
| 明确等待用户或审批 | 等待 | 没有等待事件则不猜测 |
| 明确工具或回合失败 | 失败 | 不推断不存在的 Bug |
| 工具返回、Stop、回合结束 | 待机 | 不代表项目完成 |
| 当前证据支持的验收通过 | 短暂开心动作 | 只表示该验收项 |
| 未授权、断线、过时或未知 | 待机并说明未知 | 不伪装成持续工作 |

连接权限心跳与活动时间分别检查。超过 30 秒的新鲜活动边界，工作/等待/错误动画回到待机；权限通道过期时清除旧状态。关闭动画后仍执行状态时效检查，隐藏后停止动画、订阅和看门计时。DEMO 始终有标识，不参与奖励。手动抚摸、招手与睡觉是宠物互动，不能当成 AI 活动证据。

## 等级与小商店

有效新工作回合每个 1 XP、每天最多 8 XP，不给金币。已存在验收项从未通过变为当前自动验证通过时给 5 XP/2 金币；符合人工验收要求时给 8 XP/3 金币。同一验收项只结算一次，后续证据版本或人工升级不重复发奖。Stop、工具次数、Token、导入资源、互动、演示、启动历史及回放不结算任务成功。

帽子、围巾、招手动作、宠物垫和铜色小狗外观使用本地金币解锁，买后装备才生效。金币没有真实支付或交易用途。养成页显示等级、经验、余额和最近成长记录；养成状态与“任务整体进度未知”互相独立。

存档在应用数据目录的 pet/progression。事件/验收去重键只保留本地 HMAC 摘要，最多 20,000 项，不淘汰旧键以避免重复发奖；达到上限后停止新奖励，监控继续。损坏、存储身份异常或并发占用时余额显示未知，不覆盖旧存档、不悄悄归零。卸载保留该数据；不要手工编辑存档来验证正常流程。

## 自定义宠物包

点“导入宠物包”，选择仅含 manifest.json 与 PNG 的普通本地目录。先核对作者、来源与许可，确认有权使用后才导入。只处理受限 PNG，不执行包内代码；拒绝额外日志、会话文件、链接、子目录、远程 URL 或过大资源。确认前后重新核对文件身份及完整清单，变更后必须重新预览。

格式、配额与来源说明见 [资源许可及格式](../PET_RESOURCE_LICENSES.md)。移除只操作应用自己的已注册副本，不删除用户原始资源，不删除成长存档。导入者的声明不等于可公开再分发的授权证明。

## English

Open Desktop pet in the main window and enable it (off by default). Choose among four original AI-assisted pixel animals, each with six four-frame states. The transparent native pet runs independently of the monitor. Drag its painted body; resize, lock position, toggle top, hide/show, mute, disable animation or use low-performance mode. Position lock and top are separate. Right-click opens its menu; double-click opens info. Restore through the tray. Blank pixels pass clicks to the desktop; an overlapping expanded monitor temporarily takes priority without moving the saved pet position.

Only current authorized facts drive work, waiting and failure states. Ended turns leave the pet idle; they do not establish project completion. Stale evidence or dead authority clears working animation even when animation is disabled. Hidden pets stop rendering and subscribing. DEMO is explicit and never pays rewards. Pet interactions are labelled separately.

Local progression grants modest XP for new observed turns and coins only for evidence-backed acceptance. Durable HMAC deduplication prevents replay, regrant, duplicate-source and evidence-version rewards. The five-item shop supports actual purchase/equip and a wave action. There is no login, payment or cloud sync. Storage failure leaves balance unknown while monitoring continues. Data remains in the application's pet directory across uninstall.

Import a local PNG-only pack after reviewing its source and license. Manifest and file identity are revalidated after confirmation; code, links, transcripts, extra files and network resources are rejected before unnecessary body reads. Import/remove never grants session access. See the resource contract for limits. The importer must have rights to use the pack; public redistribution requires separate review.
