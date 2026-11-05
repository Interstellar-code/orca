# Dart phase 3 plan — OMP review 4

Reviewed `docs/plans/dart-phase-3.md` at `bf300388322`, the four earlier reviews, the phase 2 plan, the supplied API schema, and selected current source. Phase 2 implementation and mockup artwork were not available for verification; the screen names below are checked against the plan's design reference, not the external canvas. No live Dart calls, builds or tests were run.

## Blocker

### B1. Raw pagination offsets cannot be obtained from the existing host reply

**Plan:** D3 line 75, B1 lines 138–147, B3 lines 188–190. **Code:** `src/main/dart/dart-tasks.ts:71-77`, `src/shared/dart/dart-types.ts:85-89`, `src/main/dart/dart-task-mapping.ts:38-40,95-102`.

D3 requires advancing by raw rows, but the host drops unmappable tasks and returns only mapped `tasks` and adjusted `totalCount`. Neither `DartTaskPage` nor the existing reply carries the raw row count. A 250-row response with one malformed row is indistinguishable from a 249-row response and can cause premature termination or an incorrect offset. B1 owns the relevant host contract but does not add this field. Old hosts cannot supply it at all.

**Rewrite:** B1 extends the list reply with an optional raw consumed-row count, derived before mapping; B3 uses it for current hosts. Specify a safe, explicitly incomplete old-host fallback when a mapped page is short and the raw count is unavailable; never claim exact raw offsets on old hosts. Add a fake page with a dropped row followed by a valid next page and cover the old-host ambiguity.

## Major

### M1. Parallel host lanes both own generated and capability files

**Plan:** lines 104, 127, 138, 155. B1 and B2 are parallel, but both claim `dart-capabilities.ts`, `task-source-runtime-capabilities.ts`, and catalog regeneration. B1 and B2 task text still assigns B2 the saved-view capability, contrary to F3. Catalog generation on independent branches also produces competing changes from incomplete sets of methods.

**Rewrite:** B1 alone owns and advertises all capability constants. Assign the generated catalog to a single post-merge owner after both sets of RPC methods exist, or explicitly serialize its regeneration and ownership. Remove B2's conflicting file ownership.

### M2. Frozen feature type is unavailable to B1 and mixes two probes

**Plan:** F3 line 104, frozen contract lines 165–168, B1 line 138. B1 precedes B3.0, yet F3 requires B1's preload `DartApi` to return `DartBoardFeatures`, first defined later in renderer component contracts. That type also requires `savedViews` while F3 says this probe covers only board and relationships and saved views use their own API. Importing the later renderer component type into preload reverses the dependency and cannot compile on B1's branch.

**Rewrite:** B1 owns a shared/preload-safe `{ board: boolean; relationships: boolean }` probe result; B3.0 composes it with the separately probed saved-view support into its renderer model. Name the shared type and its owner before B1 starts.

### M3. A second epoch change publishes a stale settled write

**Plan:** D4a line 77; phase 2 T3.5 line 197. D4a says that after a second epoch change the read is published with pending patches. If the second write has already settled, its pending patch is gone, so an older multi-page result can overwrite the confirmed edit. Phase 2 instead retains the displayed state after its bounded retries.

**Rewrite:** On every epoch mismatch discard the entire read set; after the allowed retry is exhausted retain the existing rows and surface a refresh-needed state. Test two successive writes settling before their respective stale reads resolve.

### M4. Frozen search contract cannot express the promised dartboard toggle

**Plan:** lines 67, 112, 176, 246. B3's store search supports an optional `dartboard`, and B8 must offer an all-boards/default versus this-board toggle, but frozen `DartRelationshipsApi.searchTasks(text)` has no argument for that choice and exposes no toggle setter. B8 cannot implement both modes using the frozen interface.

**Rewrite:** Freeze `searchTasks(text, options?: { dartboard?: string })` or a typed mode setter and supply the detail-scoped dartboard; specify that changing mode invalidates earlier search replies. Test both scopes and an in-flight mode switch.

### M5. List nesting and child loading conflict with the only task source

**Plan:** D6 line 79, contracts lines 175 and 182–184, B7 lines 228–236. The tree is defined over scope rows plus a separate children map, and expansion fetches children into a child-list cache, but the state boundary says the store holds only the scope cache, scope metadata and relationship cache, and selectors always take scope `data.tasks`, never a copy. The frozen model provides no child-cache map or rule for reconciling children absent from the capped scope. A valid fetched child outside the first 1,000 cannot be placed without breaking one of these requirements. D6 also promises all loaded descendants under loaded parents while F5 limits the list to one level without specifying where deeper rows go.

**Rewrite:** Explicitly retain children as separate `DartTaskPage` cache entries, derive a deduplicated visible tree from scope rows plus expanded-parent entries without creating a second authoritative task store, and define where grandchildren appear in the list. Require an expansion test where the child is absent from the scope and a three-level hierarchy test.

### M6. Client-filter changes both must and must not reset finished paging

**Plan:** D3 line 75, F4 line 105, B3 acceptance line 190. D3 resets `doneOffset` and generation on _any_ filter change; F4 says switching a client filter needs no read. Resetting the cursor while retaining already appended rows makes the next Show-more reread offset 0/50 and duplicates or prevents progress; resetting rows requires another read.

**Rewrite:** Reset generation and `doneOffset` only on server-filter/scope/account/host change or refresh; client-only filters project the existing rows and preserve the cursor. Test toggling a chip after loading multiple finished pages, then loading another page.

### M7. B1 and B8 still contradict corrections in worker-facing instructions

**Plan:** lines 103–104, 138, 143–147, 244; F5 line 106. B1 still says empty `parentId` is allowed and B2 owns the saved-view capability, contrary to F2/F3. B8 asks for both `sourceContext` and `writeScope`, although F5 says they are the same object and only one belongs in the frozen relationship API. These are precisely the task blocks workers paste.

**Rewrite:** In B1 require a non-empty ID and assign all three capabilities to B1. In B8 remove the separate `writeScope` argument and derive the write scope from `sourceContext`.

## Minor

### N1. Decision and design summaries contradict settled text

**Plan:** lines 19, 73, 75, 84, 130, 138, 208. The design reference puts Show-more below finished columns rather than once below the board; D1 says old hosts have no nesting although D6 permits loaded-child nesting; D3 says `completedAt` chooses a column although F7 says status does; D11 says routes await confirmation although status and the given decision say confirmed; `Content.tsx` still says hunk A despite F12's P3-A.

**Rewrite:** Use the F7 global control, distinguish loaded-child nesting from new child reads, say `completedAt` classifies finished while status chooses the column, mark D11 confirmed, and consistently name hunk P3-A.

### N2. B3 queue-test ownership and command omit the actual queue location

**Plan:** lines 178, 188, 258. B3 adds the account subscription in the component queue, but its named new account-writes test lives under the store tree; the per-task command never runs the existing component queue test. The prose places the additive queue export inside the `dart-write-actions.ts` parenthesis, obscuring ownership.

**Rewrite:** Name `dart-task-write-queue.ts` and its component test explicitly as B3-owned, keep the account integration test if useful, and include both queue and store tests in B3's focused command.

### N3. Mockup coverage is not fully mapped in the design reference

**Plan:** lines 19–21, 194, 204. B4 references both board and list mockups and B5 references both headers, but the design reference assigns the board only to B5/B6 and the list only to B7. The referenced screen names do exist in the plan; the per-screen task mapping does not match.

**Rewrite:** Add B4's column/tree rules and B5's list header to the corresponding screen entries, or remove those task-level mockup claims.

## Checks and limits

Round 3's per-task notices, host/account/task cache key, host-only saved-view owner, old-host four-page acceptance, separate age clock, null relationship cases and separate B9 environments are present. The cited current `DartTaskPage`, mapper and host list path were checked directly; API schema lists pagination and nullable relationships. The task-level test command syntax was inspected, not executed; phase 2 files named by the plan cannot be validated until the prerequisite merge. The external mockup content was not verified.

**Verdict: not ready.**
