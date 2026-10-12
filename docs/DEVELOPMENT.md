# Development, review and releases

## Source preview and stable release

The public source preview is a reviewable codebase with known issues. A prerelease tag or source publication is not a stable release or a claim of security approval. The `0.1.1-rc.4` runtime version remains unchanged. Stable release requires the [remaining gates](KNOWN-ISSUES.md), renewed real-host acceptance, and successful required checks. Source publication does not waive them.

## Branch and pull-request procedure

1. Preserve the existing repository history and author identities. Published main preserves all nine original commits plus the approved repair and documentation commits. Start normal feature/fix branches from main. Source-review exports contain no `.git`; never substitute a fresh export history for the maintained Git checkout.
2. Use `feature/<topic>`, `fix/<topic>` or `docs/<topic>` for subsequent work. Each PR states the concrete trigger, before/after behavior, source boundaries, license/asset changes, synthetic checks, untested environments and remaining risks.
3. Request independent review by a reviewer who did not implement the change. A separate reviewer should examine code and test evidence, especially permission, Git, RPC and Hook boundaries. Automated tests supplement that review.
4. Configure protected `main` with PR review and passing required checks when the owner approves repository setup. The published main requires one PR approval, approval of the latest push, current matrix checks and resolved discussions. Ordinary force pushes/deletions are disabled. The single-account owner retains an administrative recovery path that requires independent review, CI evidence and explicit owner merge authorization. Merge with a normal merge or approved fast-forward; do not force-push, rewrite existing commits or erase authors.
5. Build in public through sanitized issues, roadmap updates, PRs and release notes. Attach only synthetic examples. Screenshots, exports, logs, acceptance notes and traces must be checked for paths, account data, secrets, task text and session IDs before sharing.

## Offline checks and CI

`node scripts/ci-offline.mjs` uses the original version check, Node test suites and new boundary regressions in isolated synthetic roots. It does not install dependencies, read real Codex/Work data or invoke a cloud API. Its child processes receive a minimal environment and an empty developer Git configuration. Test-created Git histories are disposable fixtures; the source repository history is not initialized or changed.

The proposed Actions workflow runs this command on Windows and Ubuntu with Node 22.17.0 and 24.17.0. It has `contents: read`, full-SHA action pins, no persisted checkout credential, and no deployment, publishing, real-session inputs, repository secrets, cache upload, artifact upload or `pull_request_target`. Runner setup and checkout can access the network; the tests themselves use fixtures and loopback. The first hosted matrix ran after publication and exposed Windows compatibility failures; the follow-up PR retains those logs and corrects the declared minimum and fixture setup. Full-SHA pins were checked against official action metadata on 2026-10-12; review and update them through normal PRs as runner support changes.

For optional browser checks, install the locked development dependency with `npm ci --ignore-scripts`, then run `node scripts/ci-offline.mjs --browser`. Windows uses installed Edge; other systems require a separately provisioned Playwright Chromium. Do not infer real-host compatibility from a synthetic browser run. Generated reports are local and ignored.

## Immutable candidate and release procedure

1. Resolve known issues in reviewed commits, rerun required checks, and record the exact final SHA and environment.
2. Audit all proposed files and reachable history; keep MIT and third-party notices. Any historical secret or personal-content exposure blocks publication until the owner chooses a response. Do not silently flatten or rewrite history.
3. Confirm manual host acceptance separately. Source publication approval does not authorize real session access or a stable release.
4. Only after explicit release approval, run the existing `scripts/release.mjs` in the original clean Git checkout for an immutable candidate ZIP and exported-byte manifest. It refuses to overwrite an existing candidate. The script currently emits candidate notes referring to the earlier private review; review those notes as part of a release PR before using it for a public release.
5. Mark unresolved candidates as prereleases. Publish a stable release only when required findings, checks, licenses, package contents and manual acceptance are resolved and approved. Record hashes and known compatibility; never include `.aps-data`, logs, exports, test artifacts, credentials, dependencies or browser binaries by accident.

The owner-approved source preview is public. Feature/fix branches and PRs may be prepared for review; no stable release or deployment follows from source publication.

GitHub's [security-hardening guidance](https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions) supports least-privilege tokens and immutable action references. Official pinned action definitions: [checkout](https://github.com/actions/checkout/blob/11bd71901bbe5b1630ceea73d27597364c9af683/action.yml), [setup-node](https://github.com/actions/setup-node/blob/49933ea5288caeca8642d1e84afbd3f7d6820020/action.yml).
