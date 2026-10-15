# APS Desktop Pet and monitoring completion implementation plan

> Agentic workers: execute with superpowers:subagent-driven-development. Continue through every task; preserve ledger and actual evidence. User explicitly requested implementation through completion, so do not pause for routine design/plan approval.

Goal: ship integrated optional animated Windows pets with authentic APS monitoring, local progression and safe import while completing desktop validation.

Architecture: one existing DesktopHost/StudioService owns collection and SessionAccess. A new minimal pet projection passes Publication barriers; the renderer never receives chat or evidence bodies. Main-process pet controller owns its transparent native window and local-only progression, sharing the existing lifecycle.

Tech: existing pinned Electron/Node/vanilla modules; no additional runtime packages or external model services.

Spec: outputs/DesktopPetMode/APS_DESKTOP_PET_MILESTONE.zh-CN.md in parent project; user request of 2026-10-14 supersedes its deferral clause.

## Global constraints

- Preserve baseline 67823146adfa880e22e4471ce08a7814cfe2a75a and RC4; work on feature/desktop-pet-mode.
- Default off, no extra private reads, all outputs and delayed callbacks bound to original authority/selection generations.
- Work unknown/unsupported remains truthful; no mock marked real, no public release, no real shutdown during testing.
- Four original classes, six true multiframe states; imported resources never execute code.
- No new source permissions; rewards never affect progress, monitoring or shutdown.

## Review focus

1. Old authority after regrant must not drive pet or pay rewards.
2. Wallet crash/replay/multi-source duplicates must not duplicate a grant.
3. Transparent native window must not capture background clicks or focus.
4. Imported package paths, sizes and code are hostile by default.
5. Hidden/disabled animation consumes no recurring rendering resources; core monitoring remains alive.

## Tasks and interfaces

### 1. Pet progression and catalog

Files: src/pet/catalog.mjs, src/pet/progression.mjs, tests/pet-progression.test.mjs.
Exports PET_CHARACTERS and PET_ITEMS arrays; free characters aps-dog, aps-cat, aps-capybara, aps-outline-dog. Five items: hat, scarf, wave, mat, dog-copper, with explicit slot/price.
PetProgression(directory): async init(); snapshot(); async consume(fact,{validate}); async purchase(id); async equip(slot,id|null); close().
Fact: kind live-turn-activity/criterion-auto-verified/criterion-human-accepted, canonicalSessionKey, turnId/criterionId/definitionKey as needed, at, origin, live, demo. validate is synchronous and throws/returns false if original Publication/context is stale. No renderer ingestion.
Snapshot: level,xp,totalXp,nextLevelXp,coins,owned,equipped,records (no raw identifiers).
- [ ] Failing tests for duplicate/replay/unknown/grant race/corrupt storage/purchase before implementation.
- [ ] Implement data-driven modest rewards, durable at-most-once transaction and identity-checked local storage.
- [ ] Validate revoke during async persistence, crash recovery, day cap and same criterion changed evidence.

### 2. Original assets and safe pack interface

Files: public/pet-assets.mjs, src/pet/pack.mjs, resource source/license statement, tests/pet-assets.test.mjs and pet-pack.test.mjs.
Exports renderPetFrame(character,state,frame,equipped={}) -> trusted original SVG string; six states with >=4 distinct frames. PET_ANIMATION_STATES and PET_FRAME_COUNT.
PetPackManager(directory): init(), list(), importDirectory(source), remove(id), asset(id,file) resolved only from validated registry. Use user-selected directory containing manifest.json and PNG frames; do not require ZIP parsing dependency. No remote URLs/scripts/SVG/font/executable imports; record license/author/origin and SHA256.
- [ ] Verify genuine distinct frames and four independent character classes.
- [ ] Reject unsafe resource identity, traversal, links, conflicts, malformed images/oversized dimensions and license missing.
- [ ] Supply tiny synthetic PNG packs solely for automated tests; no fake pet preview claims.

### 3. Native pet window and minimal authorization-bound integration

Files: desktop/pet-window.mjs, src/pet/state.mjs, public/pet.html/css/mjs; modify window.mjs, host.mjs, ipc-policy.mjs, settings.mjs, preload.cjs as needed.
PetWindow shares host, Publication and selection. Shape messages bounded to own window; dynamic alpha-hit region permits background clicks. Drag/size/topmost independent and persisted. Local overlay/interactions never describe invented AI activity.
Main host pet projection excludes task title/body/messages/paths/session list; fact ingestion is main-only from current valid snapshot, excludes bootstrap and old events.
- [ ] Test role least privilege, stale requests/subscribe/cache/navigation/regrant, no unauthorized body I/O.
- [ ] Add setting default off, tray restore/hide, info/shop/import pages and renderer animation controls.
- [ ] Verify actual desktop movement, interaction, transparent hit and exit cleanup.

### 4. Real monitor and distribution validation

Inspect existing trusted official Work Hook and authenticated ingress without global config changes. Diagnose actual new callbacks or report precise host limitation. Revalidate authorized current Codex events and metadata selection; never send unsolicited test reply.
- [ ] Run full Node/browser/native window regression plus installed/portable tests from fresh directories.
- [ ] Measure sustained pet on/off/hidden/low-mode resources without promising unevaluated targets.
- [ ] Version single source, Chinese/English instructions, pet licenses, release notes and manual acceptance flags.
- [ ] Freeze source commit; produce Windows installer/portable/source/audit manifests and SHA256.
- [ ] Attempt authorized source-only existing GitHub sync if available; exclude private artifacts/history.
- [ ] Work B handoff describes real vs synthetic vs manual results and outstanding issues; no public binary release.

## Implemented interface amendments and acceptance record

The user rejected the initial SVG and naturalistic candidates. The final implementation uses four AI-assisted cozy pixel atlases, 24 frames each, with untouched raw originals in ArtSources and a deterministic local compiler. The actual drawing API is drawBuiltinPet/getPetFrame in public/pet-assets.mjs; renderPetFrame SVG was retired. No third-party artwork was supplied. Resource rights and visual acceptance remain independent gates.

Code, local progression/shop/import, original Publication gating, startup/revocation/freshness, PNG preflight and lifecycle tests are implemented. Current source/full-runtime evidence, exact fixed commit, package hashes and per-file changes are provided in the delivery handoff. Earlier unchecked task bullets are the original implementation checklist, not assertions of pending code.

Actual current authorized Codex events were observed in the native application. Work Hook delivery remains unverified (0 current callbacks); user interrupted physical UI automation with Escape, so remaining physical interactions and multi-display/DPI are MANUAL_TEST_REQUIRED. No real shutdown or reply-delivery success is claimed. GitHub external writes were blocked by automatic approval review. These unresolved environment/approval gates are not marked complete by synthetic tests.
