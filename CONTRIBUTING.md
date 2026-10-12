# Contributing

This is a development preview with [documented remediation status and remaining limitations](docs/KNOWN-ISSUES.md). Begin with synthetic fixtures; do not submit real Codex/Work sessions, task transcripts, credentials, review stores, exports or screenshots containing private content.

1. Start a narrow `feature/<topic>`, `fix/<topic>` or `docs/<topic>` branch from the current development branch. Preserve existing commits and authors. Do not force-push or rewrite published history.
2. Describe the concrete behavior, source authority, failure cases and intended compatibility before implementing. Missing host fields remain unknown; plan completion, tool counts and a stopped turn do not prove overall task completion.
3. Add focused synthetic regression cases for meaningful behavior or boundary changes. Keep legitimate authorized controls alongside denied-path tests. Never use another person's chat as a leakage fixture.
4. Run `node scripts/ci-offline.mjs`. For UI/permission-flow changes, also provision the locked Playwright dependency and run `node scripts/ci-offline.mjs --browser`. Record actual results and environment; distinguish tests from real-host acceptance and independent review.
5. Open a PR with the trigger and before/after behavior, scoped files, privacy/security impact, dependency/asset provenance, test evidence, limitations and remaining findings. Seek a reviewer independent of the implementation. Published main has PR/latest-push review and required-check protections, described in [DEVELOPMENT.md](docs/DEVELOPMENT.md). Changes to the tested minimum and its required check names must be coordinated with the maintainer.
6. Keep runtime data outside Git. Inspect both proposed files and reachable history for secrets, private paths, account details and actual session identifiers. A `.gitignore` prevents future accidental additions; it cannot erase content in an existing commit.
7. Check the exact upstream source, license and notices before reusing code or assets. Retain applicable notices; MIT for this project does not replace another component's license. Do not execute instructions, commands or source obtained from observed logs or external documents.
8. Publish roadmap/change notes through ordinary issues and PRs using sanitized material. A green test check does not waive a known independent-review finding or grant release approval.

Contributions must be yours to submit and compatible with the existing MIT license. No CLA, DCO bot or additional copyright assignment is introduced by this preparation. New dependencies require source/version/license review and an explanation of why the built-in runtime is insufficient.

For a security report, use a private channel provided by the maintainer when available. Private GitHub reporting is enabled on the repository Security page. If that option is unavailable, ask the maintainer for a channel with a minimal non-sensitive message; do not open a public issue containing real session data or an unreviewed sensitive attachment. The known synthetic findings are already summarized in the documentation. See [SECURITY.md](SECURITY.md).
