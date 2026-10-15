# RC4 privacy boundary / 读取与输出权限边界

This implements the approved RC4 design against `be9372f3219dbed6b8c6cd8735dba3163337dbcf`. It is not release approval or a real-host compatibility certificate.

## One authority, separate capabilities

`SessionAccess` makes the final decision. A SessionRef contains a backend scope and canonical ID. Local homes, RPC endpoints, Hook spools and Demo are separate namespaces. UUIDs are lowercase; non-UUID RPC/Hook identifiers retain exact spelling. No grant is inherited by another backend, parent, fork or child thread. A filename, environment ID, `sourceKinds`, `originator` or shared runtime is not product attestation. The user must identify the full backend and ID and explicitly confirm Codex content access. Unknown and Work content are denied.

Content and workspace evidence permissions are separate. A workspace argument, reported cwd, acceptance manifest or another session grant is never a file grant. The Hook observer has an independent metadata capability for its configured spool. Confirming a Hook label does not confirm a local-log or RPC identity. Selecting Hook observation enables only its existing four/six-field metadata scope; revoking content does not revoke that separate capability.

Policy metadata is stored in `.aps-data/session-access.json` version 2. v1 labels migrate without body grants. An exclusive owner lock prevents concurrent authorities for one data directory. A synchronized dirty-run marker is written before content can be enabled. Grants become effective only after successful durable file replacement and revision checks. Revoke installs an immediate deny barrier outside the collector queue. An older save cannot replace the new in-memory policy; failed or unfinished persistence retains the dirty marker. Recovery denies old capabilities and durably saves that deny before a later clean stop can remove the marker. No Windows power-loss durability guarantee is made.

## Read boundary

`DataGateway` owns session, evidence, review and Git body access. Business collectors receive opaque authority-issued permits, not arbitrary `canRead` callbacks. Every operation validates permits before I/O and after asynchronous work, before decoding, caching or publication. Already-issued I/O may complete after revoke, but its result is discarded; no new restricted body operation begins after the deny barrier.

`ResourceRegistry` registers default, environment and explicitly configured Codex homes, including both `sessions` and `archived_sessions`, plus Hook and APS data directories. Evidence roots overlapping these stores are rejected. Missing protected roots reserve their canonical ancestor and remaining path; resolution failures do not grant access. Per-file checks reject traversal, sensitive names, session-log names outside their backend, links and ambiguous hardlinks. Normal project directories and legitimate Codex worktrees remain supported. To inspect APS's own source, place its runtime data/spool outside that source tree.

Discovery uses names/stat only, including bounded active/archive candidates. A denied log is never opened, even for its header. After a content permit and registered filename match, the same regular file handle reads a bounded first line without read-ahead. A matching `session_meta` ID is required before the body read. The header confirms consistency; it never establishes product identity.

Manifest, report, recursive and declared-file hashes, file/commit details, cached Git diff and reviews all use the gateway. Git receives only approved commands and literal regular-file path lists, stripped inherited Git environment, disabled fsmonitor/external diff/textconv/hooks and no lazy network fetching. Before any Git subprocess, metadata files (including index, objects and refs) and relevant implicit worktree attributes/ignores/mailmap are checked for links and hardlink aliases. System attributes and external excludes/order/mailmap paths are disabled; submodule recursion is disabled. Object alternates, include/includeIf or clean-filter configuration require separate authorization/review and show Git unavailable; other allowed evidence still works. Metadata validation is bounded at 50,000 entries / depth 32. Legitimate worktree pointers remain supported; linked/shared object stores may require review instead of being silently followed.

## Cache and output boundary

Every derived snapshot retains its original permit dependencies. `ScopedState` rejects evidence without matching lineage. Reviews use files keyed by backend, session, root and capability generations; regrant cannot load old-generation notes. Legacy mixed `reviews.json` stays on disk but is not opened automatically. Migration is pending explicit review/authorization.

`Publication` checks instance, policy revision, selection revision and all original permits immediately before serialization and transport write. Revoke invalidates source state, service snapshots/evidence/reviews and old streams. Slow streams are destroyed, not drained. SSE does not persist or replay old frames; Last-Event-ID triggers no historical restore.

The browser `StateReceiver` is shared by bootstrap, snapshots, controls, details and export downloads. It binds callbacks to the current handshake generation and instance. Snapshots require monotonic selection/policy/publication ordering; same-scope details/exports are independent requests and can finish despite newer snapshots. Mutation acknowledgements may complete after their own SSE snapshot without reapplying old state. The request gateway invokes a synchronous consumer after validation, with no promise continuation between permission checking and final display/Blob creation. A later invalidation cannot be overtaken by an already checked but not yet consumed response.

An authority heartbeat arrives every 3 seconds; the visible page's freshness lease is 10 seconds and checked every second. Disconnect, offline, hidden/resumed pages or lease expiry clear sensitive UI and require a fresh bootstrap. These checks cannot run while the OS suspends the browser. Cross-tab invalidation messages only remove state; they cannot grant permission. Already transmitted bytes, saved exports, malicious external clients, different data-directory authorities and prior offline copies cannot be remotely erased.

## RPC and Hook boundary

Only literal loopback WebSocket endpoints are allowed. Methods: initialize/initialized, ID-only thread/loaded/list, explicitly scoped thread/read, and scoped thread/turns/list or thread/items/list for incomplete history. No thread/list previews, resume/start/fork, turn execution, approval responses or private host interfaces. Structural routing accepts legal field order, escaped keys, string IDs and lossless int64 correlation; duplicates, ambiguity and excessive structure are rejected. Unknown/ungranted payloads are skipped rather than JSON-parsed. Raw WebSocket bytes necessarily arrive at the observer; no claim is made that rejected frames were never received.

Notification callbacks capture session, grant generation, selection and connection when the channel opens. Revoke/regrant closes the old channel; a delayed callback cannot attach current permissions to an old frame. Only allowed methods for the selected thread/current turn are normalized. A separate endpoint may never receive another desktop client's notifications: cross-client read-only subscription is UNSUPPORTED by the verified interfaces. That limit does not disable ID discovery or authorized history polling. Missing plan, usage and timestamps remain UNKNOWN.

The installed Hook producer remains unchanged: four base metadata fields; PreToolUse/PostToolUse may add tool_name and tool_status. No prompt, reply, parameter, output, password, key or hidden reasoning field is added. It requires no new installation/trust for RC4. Existing historical host observations are in WORK-HOOKS.md; RC4 synthetic tests do not renew that host certification.

## Audit evidence

The tests instrument open/read/readFile/readSync/stream boundaries on synthetic roots, record requested ranges, and retain successful controls. `APS_PRIVACY_TRACE` and `APS_RC4_TRACE` select trace files. Tests also check final serialize/write rejection, real Edge delayed SSE/download application, persistence interleavings and old-generation transport callbacks. See RC4-REMEDIATION.md and the external RC4_WORK_B_HANDOFF.md for actual run results and remaining manual steps.

中文：默认拒绝；来源确认、正文许可、工程许可和 Hook 元数据范围相互独立。撤销先立即阻止访问，再持久化；旧缓存、通知和导出不能换上新的授权代次。真实宿主未提供的数据不补造。本程序不是 Windows 安全沙箱，不承诺抵御同用户恶意改写或收回已发出的字节。
