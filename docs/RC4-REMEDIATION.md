# RC4 implementation record

Approved baseline: `be9372f3219dbed6b8c6cd8735dba3163337dbcf`.
Approved plan SHA256: `8ca79e3f7547012db431184bf14976b58bb3a526b5653f740b2fe127b49edaa5`.
Development branch: `repair-rc4-access-rpc`. No public release is authorized.

| Issue | Root cause | Implementation |
| --- | --- | --- |
| P-02 | Evidence readers and Git formed a second content route; only active sessions were protected. | ResourceRegistry covers active/archive/default/custom/aliases/missing roots. DataGateway mediates body access. Workspace evidence requires a separate explicit capability. |
| P-03 | Grants had no generation; service caches and HTTP/SSE/browser outputs could retain and return old objects. | Backend-scoped authority and opaque permits; immediate revocation; scoped review/evidence provenance; final Publication barrier; one browser lifecycle receiver; old subscriptions destroyed. |
| F-01 | Discovery was reduced to allowedIds and RPC grants depended on local files; notifications never reached the wire parser. | ID-only loaded-list pagination, RPC-specific selection/grant, ongoing local catalog and scoped notifications when actually delivered. |
| F-02 | A regex required a leading numeric id and relied on object field order. | Bounded structural scanner, typed correlation, per-request method/identity/permit/channel validation, independent notification routing. |
| M-01 | GUI, launcher, backend and documentation held independent versions. | package.json.version feeds runtime and RPC; version sync/check drives README and lockfile; fixed-tree release tooling derives ZIP name and release metadata. |

## Required regression matrix

| Design IDs | Main evidence |
| --- | --- |
| A01 | privacy.test: lowercase/uppercase/mixed/invalid/unknown/Work/ungranted/identity mismatch; denied open/body counts and real authorized append controls. |
| A02–A04 / T-06 | resource-boundary.test: full service/export/SSE/detail chain, archive B zero I/O, default/environment/custom roots, missing roots, junctions, hardlinks, forced manifest, protected copied filenames, controlled Git extensions and legitimate worktree. |
| A05 | resource-boundary.test: revoke after header/open and during body completion; no new body call or semantic parsing. |
| A06–A08 / T-01 / T-02 | authority/app-server/publication/resource tests: backend separation, regrant, queued/closed-channel callbacks, staged persistence races, failing writes, clean/unclean and repeated recovery, old reviews, single owner. |
| O01–O04 / T-03 / T-04 / T-05 | publication.test + real Edge browser-privacy: old callbacks, instance/sequence reset, non-starving detail/export, actual delayed SSE/download after revoke, two tabs, offline recovery, scoped permission combinations. |
| R01–R05 | app-server.test: actual connect/message/wire routing, field orders/escaped keys/int64/ambiguity, discovery pagination and unsupported methods, real normalization, multiple history updates, wrong identity and old turn rejection, timeout and reconnect. |
| H01 | work-hooks.test and browser: unchanged four/six-field producer, five events, new IDs, selection, labels, missing values, stop semantics and restart. |
| V01 | version-boundary.test, version.mjs, browser version display, fixed-tree release manifest. |

Windows file symlink creation may require OS privileges. The recorded run uses real directory junctions and hardlinks; it does not claim privileged file-symlink creation succeeded. Tests intentionally use synthetic private sentinels, never a real user's other chat as a leakage fixture. The original 78-test baseline passing did not cover archive evidence or old SSE callbacks; new red records reproduce those missing boundaries. Additional deterministic tests found and fixed shutdown/recovery persistence ordering and a browser mutation acknowledgement overtaken by its own SSE snapshot.

Final candidate checking additionally reproduced three gaps before fixing them: an archived synthetic file aliased as Git's implicit `.gitattributes` input; old history replacing a newer delivered RPC turn; and browser invalidation running in the promise continuation between response acceptance and download creation. The added controls assert zero Git subprocess calls for denied implicit inputs, keep the new turn until history catches up, and consume validated browser responses synchronously. Existing Edge tests now release old SSE after regrant and actually delay an old bootstrap across server restart.

## Compatibility and limits

- v1 body grants must be reconfirmed for a backend. Workspace evidence now needs its own grant. Legacy mixed review data is retained, not automatically migrated or read. Reauthorization uses new review generations.
- A single data directory permits one server. A different directory is a separate authority. Clean stop flushes decisions; failed/unclean stops require reconfirmation. This is not an OS sandbox or power-loss guarantee.
- Git repositories with object alternates, ambiguous metadata links/hardlinks, or metadata above the validation bound require review. Ordinary repositories and legitimate Codex worktrees have positive tests. Submodule internals are outside this evidence scope.
- Work still provides only authorized metadata. A content grant is never inferred from a Hook label; equal IDs in different backends remain separate. Work plans, task text, Token and complete tool output are UNKNOWN by design.
- RPC ID discovery covers loaded IDs only. Local filename discovery covers bounded active/archive candidates; neither proves foreground selection or all historical sessions.
- `thread/read` does not subscribe. Passive cross-client read-only subscription is UNSUPPORTED in the verified interfaces. Scoped notification parsing works for delivered events; actual host delivery and a fresh desktop Work/Codex turn remain PENDING_MANUAL_ACCEPTANCE unless explicitly recorded in the handoff.
- `thread/turns/list` and `thread/items/list` are attempted only for incomplete authorized history. A host's method-not-found response is UNSUPPORTED; timeout/invalid response is UNKNOWN. Legacy permitted history remains usable. No stateful/private fallback is used.
- Overall task completion remains UNKNOWN without reliable criteria/model; plan steps and acceptance pass rate retain their different denominators. No tool-count progress or invented ETA.

## Verification and delivery

Run `npm test`, `npm run test:browser`, `npm run verify -- --browser`, and `npm run version:check`. The verify CLI explicitly authorizes only this repository for fingerprinting through the same gateway; manifests cannot select another root.

After the final fixed commit: `node scripts/release.mjs --out-dir <directory>` packages only that Git tree, writes ZIP SHA256, a per-file content manifest and release notes, and refuses to overwrite prior candidates. The external handoff supplies the actual 40-digit commit, artifact hashes, changed-file list and results. Passing these checks is not independent Work B approval or user acceptance.
