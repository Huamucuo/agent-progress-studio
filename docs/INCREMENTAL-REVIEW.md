# 0.1.1-rc.3 P-01 / D-01 repair candidate

> Historical development notes for 0.1.1-rc.4. These describe implementation intent or earlier observations; they do not certify current safety or host compatibility. The original baseline had five independent-review findings; the current branch implements fixes. Current review status and remaining limits are recorded below. Read [KNOWN-ISSUES.md](KNOWN-ISSUES.md) and [VERIFICATION.md](VERIFICATION.md) before using a real session.


Status: **pending Work B independent supplemental audit and user acceptance**. No public release. Development freezes at the delivered commit and archive.

Repair baseline: **8495bac1bcabf619afaafb1b4e126b5a429ccf25** (0.1.1-RC2, Work B: NEEDS_REWORK). Branch: `repair-rc2-p01-d01`. RC2 commit and ZIP remain unchanged. The earlier V0.1 READY_FOR_RELEASE decision does not apply to this candidate.

## P-01: enforcement before session content

RC2 compared Work IDs case-sensitively, despite accepting case-insensitive UUID filenames; its metadata probe could prefetch body bytes before deciding to exclude a Work session. It also treated lack of a Work label as permission. The repair uses filename/stat-only discovery and a separate explicit Codex content grant, canonical UUIDs, bounded same-handle identity validation before the sole body reader, and state invalidation on denial. Unknown/Work IDs and labels without grants do not open a log. See [complete access rules](PRIVACY-SCOPE.md).

The same boundary covers selected-source polling, replacement, cached snapshot/export/evidence and app-server history requests. Evidence helpers protect both the default session store and custom environment/CLI roots. UI scope changes close focused dialogs and discard delayed evidence responses; delayed mutation replies cannot override newer SSE snapshots.

Compatibility restrictions are intentional and visible: custom non-UUID log names are not opened, grants are required even for old Codex labels, and app-server no longer lists all threads or consumes unsolicited notifications. Its remaining authorized history polling does not provide notification-only plan/usage fields. Real host behavior under this stricter envelope rule awaits manual acceptance; this candidate does not assert unchanged full RPC compatibility.

## D-01: documentation follows the unchanged protocol

The existing recorder stores four base fields. Current PreToolUse/PostToolUse records add tool_name and tool_status (six total); the receiver still accepts legacy four-field tool records. README, interfaces, field-source table and synthetic examples now say the same thing. Neither the recorder nor Hook definitions/receiver were changed; no installation, trust change or client restart is required by this patch.

## Verification and handoff

`tests/privacy.test.mjs` records actual synthetic file-I/O requests and byte ranges, proving denied body readers are never called. It includes authorized controls, case aliases, invalid/duplicate/unknown IDs, header mismatches/replacement, grant/revoke/restart/export and scoped RPC behavior. D-01 examples are checked against the producer and receiver. Existing Node and real Edge flows cover the monitoring and evidence features. Final counts, outputs and I/O traces accompany the release candidate; test quantity is not product-completion evidence.

This round also renders previously observed real Work callbacks in RC3 and observes fresh callbacks from the existing development session. Their product is not attested by Hook payloads. A new user-created Work greeting/tool test, a real completed Codex turn through the new consent flow, and the stricter real app-server endpoint remain **pending manual acceptance**. Historical Work observations and earlier Codex timeout remain recorded in [VERIFICATION](VERIFICATION.md) / [WORK-HOOKS](WORK-HOOKS.md).

The external handoff identifies the full final commit, exact RC2 Git diff, every added/modified path, Windows ZIP SHA256 and every distributed file hash. Only the generated verification report is added to committed source bytes. Private metadata, prompts, credentials, local settings, node_modules and Git internals are excluded. Font inspection is an inventory check, not a repeated provenance audit. Work B's independent directory is untouched.
