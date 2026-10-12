# Acceptance and evidence / 验收与证据

> Historical development notes for 0.1.1-rc.4. These describe implementation intent or earlier observations; they do not certify current safety or host compatibility. The original baseline had five independent-review findings; the current branch implements fixes. Current review status and remaining limits are recorded below. Read [KNOWN-ISSUES.md](KNOWN-ISSUES.md) and [VERIFICATION.md](VERIFICATION.md) before using a real session.


## State rules

| State | Required proof | Counts as accepted? |
| --- | --- | --- |
| Unknown / 未知 | No usable proof, missing inputs/checks, or incomplete fingerprint | No |
| Implemented / 已实现 | All declared implementation files exist | No |
| Auto-verified / 已自动验证 | All declared files exist and all named checks pass in a current report; no human gate | Yes |
| Awaiting review / 等待人工验收 | Automatic checks pass (or manual-only implementation exists) and human gate is open | No |
| Failed / 失败 | Current named check failed, or current human rejection | No |
| Accepted / 已人工通过 | Required evidence ready and current human acceptance | Yes |

Weights default to 1 and must be positive, at most 100. Criterion IDs are unique. Conditions with no checks and no human gate can be implemented but cannot be accepted. Skipped checks never count as passing. Counts are mutually exclusive; the detailed criterion additionally shows implementation and automatic-verification booleans.

文件存在只是实现证据。测试不是从 Agent 的“已完成”文字或终端日志模糊猜测的；需要明确、可定位的检查 ID。人工确认不会覆盖测试失败。改变验收定义会改变分母，并使旧人工确认失效。

## Report protocol v1

Save at `<workspace>/.agent-progress/results.json`:

```json
{
  "version": 1,
  "generatedAt": "2026-10-09T00:00:00Z",
  "sourceFingerprint": "sha256-from-sourceFingerprint",
  "tests": [
    { "id": "validation-tests", "status": "passed", "exitCode": 0 },
    { "id": "reconnect-tests", "status": "failed", "detail": "Expected an initial snapshot" }
  ],
  "detail": "Bounded test runner output"
}
```

IDs must be unique; status is `passed`, `failed` or `skipped`. A report must fit the 2 MiB read limit. Neither commands nor filenames inside a report are executed. Example reports intentionally contain an invalid placeholder fingerprint, so they cannot accidentally certify a project.

## Integrate your test runner

1. Import `sourceFingerprint` from this project's `src/collectors/evidence.mjs` in your local test-reporting script.
2. Hash the explicitly selected workspace immediately before tests.
3. Run your own fixed, reviewed test command; capture its real result and assign a stable check ID. The observer itself does not run it.
4. Hash again after tests. Only publish a matching hash if both complete hashes are equal; otherwise write `null` and rerun against stable sources.
5. Write the report atomically. The dashboard notices it on its next poll.

Use `scripts/verify.mjs` as an original reference for this repository's fixed Node suites. To integrate other projects, choose commands and check IDs deliberately instead of letting model prose supply executable strings. `npm run verify -- --browser` includes the seven real-browser flow checks in the `browser` group.

## Fingerprint scope and stale evidence

The SHA-256 includes normalized relative filenames and file bytes, including acceptance definitions. It excludes `.git`, `node_modules`, `.aps-data`, ordinary test output, logs, virtual environments, coverage and known credential paths. **Explicitly declared implementation evidence is hashed even if it is normally ignored**, subject to the same confinement and size limits. A manifest must not declare the report itself as implementation evidence because it would invalidate itself.

Bounds: 3,000 ordinary files, 40 MiB total bytes, depth 20, 2 MiB per file. Symlinks or incomplete traversal make the fingerprint unknown. Scope omissions are deliberate: fingerprints do not attest actual installed dependency contents, environment variables, external services or OS state. Lockfiles are included, but a matching lockfile does not prove dependency installation integrity.

The human-review fingerprint combines the source fingerprint and exact report bytes. Changing a source, declared artifact, report, or definition expires the corresponding decision. The server also checks the fingerprint captured when the review dialog opened. This is a local audit trail, not tamper-resistant certification.

## Git evidence

Git status, up to 200 changed paths, up to 120,000 diff characters and five commits are shown. Large results are explicitly marked as truncated or unavailable. Click a commit to inspect its metadata/stat; click an indexed changed or declared implementation file for bounded text. All operations are read-only. Binary previews are not an image/file editor.

Git information provides reviewable context. A commit existing, a clean tree, or a large patch never automatically satisfies an acceptance condition.
