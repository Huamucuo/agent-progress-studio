# RC3 privacy boundary / 正文读取边界

This is the P-01 repair against RC2 `8495bac1bcabf619afaafb1b4e126b5a429ccf25`. It does not certify a release or change the authorized Work Hook collection scope.

## Classification before access

- Discovery uses directory entries and file metadata only. It never opens a log, even to read its header. Only names ending in a valid UUID under the supported `UUID.jsonl` / `rollout-…-UUID.jsonl` forms are candidates. UUIDs are canonical lowercase; duplicate canonical IDs are excluded. Custom names and invalid UUIDs are not read.
- A filename, directory, current-thread environment variable, absence from a Work list, or old Codex label is **not proof of Codex origin**. New candidates remain product-unknown and body-denied.
- The user must correlate the full ID with their Codex session, then explicitly confirm **Codex and content access**. The two-part decision is persisted in `.aps-data/session-access.json` as `{origin:"codex",bodyRead:true}`. This is a user assertion, not host attestation. Work IDs cannot be granted through that control. Old `hook-origins.json` labels migrate without body permission. UUID alias conflicts fail closed; non-UUID Hook IDs keep exact spelling and can never grant log access.
- Every `LogSource.poll` checks that grant and filename ID **before opening**. On the same regular, non-symlink file handle it reads at most the bounded first line, one byte at a time with no read-ahead, to validate a `session_meta` UUID matching the already-authorized filename ID. A mismatching/invalid header never reaches the body reader. The header is an identity consistency check, not a way to infer the product.
- Only after those gates may the sole body `FileHandle.read` run. Scope is checked again before decoding/reducing. Revocation, invalidation, file replacement or loss of discovery clears cached task text, plan, tools, usage and workspace. Snapshot, SSE attachment, export and evidence requests refresh scope before responding. Switching source clears stale browser dialogs.

中文：来源未知、Work、仅有 Codex 标签而没有单独正文授权、非法或重复 ID，均在打开日志之前拒绝。合法 UUID 不区分大小写；已授权文件的头部 ID 不匹配时，只读取有界首行，不调用正文读取。不能先读提示词或聊天正文再猜测来源。用户若错误确认一个 ID，客户端无法自行证明其产品归属；因此界面和导出保留“用户确认”标识。

## Other entry points

App-server no longer requests global `thread/list`: previews can contain unauthorized content. It polls only locally discovered IDs explicitly granted as Codex. On the wire, only replies to pending authorized requests with a leading numeric `id` (optionally after `jsonrpc:"2.0"`) are parsed. Unsolicited/ambiguous envelopes are dropped. A host with a different response key order is unsupported and may time out; notifications are not advertised. `thread/read` is a targeted authorized request, not product attestation or a subscription to another client's live turn. Returned identity mismatches clear state. Real-host compatibility of this stricter path needs manual acceptance.

Evidence collection is enabled only for a successfully read, authorized Codex source. All evidence helpers reject a workspace overlapping the configured or default session store, including resolved aliases, before reading manifests, hashing files or invoking Git. A custom `--workspace` cannot bypass session protection. Local same-user tampering, malicious hosts and arbitrary copied transcripts disguised as project files are outside this application's authentication boundary.

Hook mode reads only the separately authorized event spool, keeps task content and evidence unknown, and needs no log-body grant. Recorder code/definitions and its four/six-field protocol are unchanged; no reinstall or new trust is introduced by this repair.

## Regression evidence

`tests/privacy.test.mjs` instruments `fs.open`, `FileHandle.read`, `fs.readFile` and `fs.readSync` on synthetic session files. It records requested byte ranges and lifecycle phases, not just rendered values; authorized initial reads remain in the trace even after the test clears its per-phase counters. A body call is any range crossing the first newline, including discarded reads. Denied cases assert zero body calls; unknown/Work/ungranted discovery and polling assert zero opens. Explicitly granted matching Codex sessions are positive controls with actual body reads and append updates.

Run `node --test tests/privacy.test.mjs`. Set `APS_PRIVACY_TRACE` to a chosen output file to retain the machine-readable synthetic I/O trace. Other tests cover grant persistence/revocation, source switching, browser exports, scoped app-server requests and unchanged Hook projection. None of these fixtures proves that a real host fired a callback; host observations are reported separately in the release handoff.
