# Remediation status and remaining limits

The retained original commit `e02febd5184ee679372c779e1c1c07214dec8358` received NEEDS_REWORK on 2026-10-10. The independent branch fixes the five recorded findings without rewriting that history or replacing the original running project. Independent fix review status: completed static review of the immutable fix: no concrete source-backed bypass or regression found within the five-finding scope. The package version remains 0.1.1-rc.4.

| Original finding | Repair boundary | Evidence |
| --- | --- | --- |
| RC4-P02-GIT | Evidence collection disables signature display and configured OpenPGP/X.509/SSH verification. | Raw local verifier controls and guarded log/show cases; ordinary Git evidence remains available. |
| RC4-P02-HOOK | Protected stores, path aliases and hard links are rejected before body reads; same opened identity is checked around a maximum 1025-byte read. | Hard-link zero-I/O, archive junction, identity replacement and input growth cases. |
| RC4-P03-HOOK | Each poll retains its original grant and lifecycle revision; cached records and derived state commit after a final authorization check. | Revoke at three read points, revoke/regrant, close and overlapping-poll cases. |
| RC4-F02-CRASH | Wire handling includes routing and normalization; malformed correlated replies reject their request without partial notification/history state. | Actual native WebSocket child process, long keys/scalars, alternate routing and valid continuation controls. |
| RC4-F-PAGING | Experimental paging is off by default. Explicit opt-in is captured by the connection and shared request gate. | Default-deny, negotiation and explicitly enabled paging controls. |

The 23 new synthetic cases failed on the original baseline and pass after repair. The full local suite passes 133 cases. Review and test scope are finite: they do not prove every input or integration safe. See [fix notes](SECURITY-FIX-NOTES.md) and [verification](VERIFICATION.md).

Remaining gates:

- Real Codex/ChatGPT Work schema, version compatibility and manual acceptance have not been renewed. A separate endpoint may never receive another client's notifications. Synthetic peers do not establish real-host subscription.
- Experimental paging can be rejected by a host; unsupported or incomplete history remains visible. Standard UI has no experimental toggle; the existing local source-selection API or adapter constructor requires explicit `experimentalApi: true`.
- The minimum declared Node version, Linux/macOS and other browsers have not been locally certified. Hosted CI remains unrun until approved publication.
- Local programs running as the same user can change files or saved exports. This observer is not an OS sandbox and cannot retract bytes already delivered or downloaded.
- Under initial concurrent validation the unchanged Hook producer recorded four of five callbacks and Edge page load timed out. Sequential unchanged checks passed; the original trigger was not traced. The producer has a fixed two-second deadline, so real-host/load completeness remains an acceptance gate.
- Older release-packaging notes refer to a previous private review. Review their wording before any public package/tag is issued.
- Source publication, stable software release and real-session operation require separate decisions. Begin with synthetic sessions and disposable workspaces.

Detailed execution logs, local paths and review attachments stay outside the public source. Keep original authors and commits; do not suppress failing tests or rewrite history to conceal a boundary defect.
