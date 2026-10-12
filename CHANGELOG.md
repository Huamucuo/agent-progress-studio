# Changelog

## Unreleased — Windows CI compatibility follow-up (2026-10-12)

- Correct the declared runtime range to `^22.17.0 || ^24.2.0` and test Node 22.17.0/24.17.0, which include upstream Windows file metadata fixes. Exclude Node 23, early Node 24 and unreviewed future majors. Dependency versions and permissions are unchanged.
- Canonicalize the newly created synthetic temporary root before deriving fixture homes, keeping the existing path/identity guards and assertions intact.
- Record the initial hosted failures and separate branch/PR checks. Source is public; real-host acceptance and stable release remain pending.

## Independent boundary repair (2026-10-12)

- Disable configured Git signature-verifier execution while collecting evidence.
- Validate Hook directory/file identities before bounded reads; reject aliases and hard links. Preserve each poll's captured grant and stage state changes until its final check.
- Contain RPC routing, scalar and normalization failures, reject malformed correlated replies, and keep notifications/history transactional.
- Keep experimental history paging disabled unless explicitly opted in; connection negotiation and request gates agree.
- Add 23 synthetic boundary regression cases. All failed on the original baseline and passed after the scoped repair. The full local Node suite passes 133 cases.
- Prepare bilingual installation/capability documentation, MIT/third-party notices, contribution procedure, roadmap, ignore rules and read-only fixture CI. Independent review status: completed static review of the immutable fix: no concrete source-backed bypass or regression found within the five-finding scope.
- Retain all nine original commits and the current runtime version 0.1.1-rc.4. Preserve the original running project. No stable tag, release, deployment or public repository is created by these local preparations.

## 0.1.1-rc.4 — original candidate (2026-10-09)

Original commit: `e02febd5184ee679372c779e1c1c07214dec8358`.

Scoped capability generations, resource registration, evidence/output invalidation, browser response checks and ID-only RPC discovery were introduced here. Its 2026-10-10 independent review returned NEEDS_REWORK. The entries above describe the subsequent repair; this original commit is retained rather than rewritten.

## Earlier 0.1.1 candidates — development history (2026-10-09)

Optional metadata Hooks, separate plan/acceptance/activity views, explicit session confirmation and bounded content access. These historical records do not establish current safety or real-host support.

## 0.1.0 — recorded baseline (2026-10-09)

Original commit: `5e2afd02cc9305da13f19336b7dd639e54937d85`.

Local browser dashboard, deterministic demo, evidence views, human review states, bilingual UI and MIT license. Earlier release approval is not inherited by this repair candidate.
