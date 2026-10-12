# Public preview boundary fixes

This branch starts from `e02febd5184ee679372c779e1c1c07214dec8358` and retains its history. It repairs the five findings recorded against that baseline. The package version remains `0.1.1-rc.4`; these changes do not establish a stable release or renewed real-host compatibility.

## Enforced boundaries

- Git evidence disables signature display in the shared Git dispatch and in its fixed log/show commands. Viewing a signed commit does not execute local OpenPGP, X.509, or SSH verification programs. Signature verification is not a capability of this observer.
- Hook metadata readers reject hard links, path aliases, and protected Codex stores before body reads. They bind directory and opened file identities, read at most 1025 bytes, and validate the same handle before parsing.
- Each Hook poll retains its original observation permit and lifecycle revision. Revocation, close, or a newer poll invalidates that run; records, session summaries, task state, and diagnostics commit together only after the final check.
- RPC handling contains routing, parsing, and normalization failures. Malformed correlated replies reject their pending request. Notification and history normalization stage state and retired-turn changes before committing; rejected input cannot leave half-updated state.
- Experimental history paging is disabled by default. Stable `thread/read` history remains available; missing or summary history reports unsupported paging rather than silently enabling it. Explicit opt-in is captured by each connection and used both in `initialize` and in the shared request gate.

## Deliberate experimental opt-in

The adapter constructor accepts `experimentalApi: true`. The local source-selection API accepts the same explicit boolean under its existing authorization controls. The standard interface does not expose a toggle and the default remains false. An enabled host may still reject a method: unsupported methods, malformed pages, timeouts, identity mismatches, cursor loops, and page limits remain visible as incomplete or unavailable history.

The observer requests the newest turn with full items and descending turn order. Item pages remain bound to that exact turn and use ascending item order. Legacy full turns with an omitted `itemsView` remain supported.

## Regression evidence and limits

The new synthetic boundary tests exercised the original baseline before production edits: 23 tests failed for their intended boundary conditions. They include actual configured Git verifier execution controls, denied hard-link body reads, validation-to-use replacement, an archive junction, revocation pauses after each of three reads, regrant and overlapping polls, a real native WebSocket child process exit, malformed correlated response fields, alternate routing keys, growing inputs, and transactional history state.

Run `npm test` and `npm run verify` against a disposable workspace. The verifier includes the new public-boundary tests. Browser and privacy flow checks use synthetic data and require the documented browser tooling. Detailed execution logs and immutable review artifacts stay outside the public source.

A synthetic peer verifies adapter behavior, not a particular installed Codex or ChatGPT Work build. Real session/host compatibility, manual acceptance, and other operating systems require separate validation. Publication still requires an immutable candidate and independent review.
