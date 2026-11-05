# Dart phase 3 plan review 1 — reconciled follow-up

Reviewed base `47247967004`, the **current revised** `docs/plans/dart-phase-3.md` (snapshot `7EB1`), approved Phase 2 plan, current source, supplied OpenAPI schema, styleguide, and test anti-patterns. This supersedes the initial open-finding counts: fixes made while the review ran are marked **fixed in plan**, not left open. The only written file is this review.

## Disposition of initial findings

| Initial finding                        | Current disposition                                                                                                                   | Current plan evidence                                                                                                                      |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| B1 aggregate cache integration         | **Open blocker**, narrowed below                                                                                                      | D4a chooses `dartListCache`, but does not define a compatible canonical page/aggregate shape.                                              |
| B2 missing scoped detail plumbing      | **Fixed in plan** for ownership and hook/container mounts; contract precision remains M11                                             | B8 now owns `use-dart-task-relationships.ts`, `TaskDetail.tsx`, and `TaskDetailView.tsx`; signature and mount props are assigned.          |
| M1 old-host detail/Show-more fallback  | **Fixed in plan** for request gating, hidden missing relationships, and supported offset; latest-completed claim still needs M1 below | D1 omits `order`, allows old-host offset; D6 hides unavailable sections.                                                                   |
| M2 partial-refresh publication         | **Fixed in plan** for errors/rate limits and timestamp preservation; epoch handling remains open                                      | D4 and B3 accept now retain the previous complete read on refresh failure and expose partial first loads.                                  |
| M3 completed-page cursor/generation    | **Fixed in plan** for generation/reset/stale append suppression; paging consistency/offset details remain open                        | D3/B3.0 add `doneOffset` and generation; B3 accept drops stale Show-more replies.                                                          |
| M4 unchecked blocker filter            | **Fixed in plan**                                                                                                                     | D7 keeps unchecked held tasks, labels them, and offers Check next 20.                                                                      |
| M5 saved-view missing chips            | **Fixed in plan**                                                                                                                     | D2 and B3.0 explicitly include `onHold`/`blockedOnHold`.                                                                                   |
| M6 synchronous picker reference        | **Fixed in plan**                                                                                                                     | Reuse map 7/B8 assign `DartBlockerPicker.tsx`, async search, debounce/loading/error/retry, and `shouldFilter={false}`.                     |
| M7 keyboard focus                      | **Fixed in plan** for move/rollback/Escape and announcement; nested disclosure semantics remain open                                  | B6 explicitly restores card focus and uses polite live announcements.                                                                      |
| M8 delivery/race tests                 | **Open major**                                                                                                                        | B9 remains an abbreviated fake-runtime/probe checklist.                                                                                    |
| M9 focused gate commands               | **Open major**                                                                                                                        | B2 has only catalog/typecheck commands; several component/web test paths remain unselected.                                                |
| M10 lossy relationship PUT             | **Fixed in plan**                                                                                                                     | D8/B1 now copy raw fresh relationship JSON, not display-mapped/sanitized lists, and refuse before PUT when the object is absent/nonobject. |
| N1 permissions                         | **Open minor**                                                                                                                        | What exists 1 still says every read/write is workspace.                                                                                    |
| N2 ignored offset                      | **Fixed in plan**                                                                                                                     | What exists 2/B1 now correctly say the base forwards offset.                                                                               |
| N3 nullability/mobile citation         | **Open minor**                                                                                                                        | What exists 4 still calls each list nullable; item 11 points at the comment above the declaration.                                         |
| N4 subtask truncation                  | **Fixed in plan**                                                                                                                     | D6 now caps sequential ID batches at three and labels >300; expanded children label >250 and offer Open in Dart.                           |
| N5 visual/accessibility state criteria | **Open minor**, narrowed below                                                                                                        | Theme fixtures exist; specific focus/partial/error/reduced-motion checks remain incomplete.                                                |

## Open blocker

### B1. D4a does not define a cache representation Phase 2 can actually patch

**Reference:** current Phase 3 D4a (`docs/plans/dart-phase-3.md:69`), B3.0/B3 (`:115-119`); `src/renderer/src/store/slices/dart/dart-slice-contract.ts:27-28`; `src/shared/dart/dart-types.ts:85-89`; Phase 2 T3.3.

The existing `dartListCache` contains `CacheEntry<DartTaskPage>`, whose data is `{ tasks, totalCount }`. B3.0's `DartScopeRead` is `{ open, openTotal, openTruncated, done, doneTotal, ... }`, not that shape. D4a says to store it in the same map “with each task also present as a list row” and assumes Phase 2's list patcher will therefore cover it. It never specifies whether `open`/`done` are canonical arrays, derived projections of `tasks`, or duplicated arrays. If the patcher updates only `data.tasks`, a separately retained `open`/`done` projection can remain stale. If the cache is widened to a union, the old patcher does not automatically understand the new shape. A compatibility stop/report clause is not an executable preservation contract.

**Fix:** Freeze an exact, type-compatible cache entry and canonical source of truth in B3.0. The smallest route is a canonical `DartTaskPage` row set plus typed metadata, with open/done projections rebuilt from those patched rows—not duplicated authoritative task arrays. Alternatively explicitly assign B3 the extension of the Phase 2 patch/invalidation helper after merge. Define alias registration and on-hold marker-cache patching. Acceptance must use the real Phase 2 queue/patcher: default-list plus explicit-detail aliases, status/blocker updates, cache invalidation, subsequent forced read, and another host/account untouched. Do not leave a known contract gap as “stop if the shapes do not match.”

## Open major findings

### M1. Sorting an arbitrary old-host page cannot produce the latest completed tasks

**Reference:** current D1 (`docs/plans/dart-phase-3.md:65`), G3/D3; `src/shared/rpc-contract/dart-params.ts:21-23,131-148`.

The revised fallback correctly omits unsupported `order` and correctly permits existing `offset`. But it sorts each returned page by `completedAt` on the client. The base documents server order as opaque, not completed-time order. Sorting 50 arbitrary completed tasks cannot choose the latest 50 from a larger set; sorting appended pages cannot establish that either. D1's update-required notice explains truncation, not the missing recency guarantee.

**Fix:** Keep the one-page fallback and supported offset if desired, but explicitly label this as a completed sample with **unknown recency**, not “latest done,” whenever `dart.board.v1` is absent. Do not claim G3's recency guarantee for that host. Test a fake old host returning older tasks before newer tasks to prove the copy does not overclaim. No change to Rohit's new-host 50-most-recent decision is needed.

### M2. Aggregate refresh still needs Phase 2's post-settlement epoch rule

**Reference:** current D4/D4a and B3/B5; Phase 2 T3.5 (`docs/plans/dart-phase-2.md:197`); current `dart-read-actions.ts:65-76`.

The partial-refresh conflict is fixed. The remaining race is a multi-page read starting before a drag/blocker write and resolving after the queue settles. `withPendingDartPatches` only protects pending writes; Phase 2 explicitly requires capture/drop/re-read epochs for reads resolving after settlement. The new aggregate read and appended pages do not explicitly preserve that rule. The existing read helper can return a result it refused to cache, so cache invalidation alone is insufficient.

**Fix:** Capture the relevant host/account epoch before the aggregate read and reject the entire publication if it changed. Apply the same rule to appended completed pages and enrichment publication; retain current visible state and follow Phase 2's bounded forced reread policy. Add a deferred rendered test where a pre-write read resolves only after successful queue settlement, plus a concurrent unrelated-field update that must survive. Distinguish this from the now-fixed filter/scope generation check.

### M3. `doneOffset` remains underspecified under dedupe and mutable offset paging

**Reference:** current D3/B3.0/B3 accept (`docs/plans/dart-phase-3.md:67,115-119`); schema `schema.yaml:1325-1372,2675-2721`.

Generation/reset/stale-append behavior is fixed, but the cursor increment is not defined. Advancing by deduplicated visible length can reread ranges after overlaps. Open and finished requests also observe different moments: a task completing between the two parts can appear in both arrays unless dedupe is global. Ordinary limit/offset pagination has no snapshot token; dedupe cannot recover tasks omitted when deletions or order changes shift earlier offsets. A short page/count mismatch is not assigned an incomplete state.

**Fix:** Advance offsets by server rows consumed, not unique displayed rows; prevent concurrent Show-more reads; define deterministic duplicate precedence across **both** open/done parts and how classification follows the winning record. State the non-snapshot limit and disclose detected inconsistencies instead of promising a complete snapshot. Test overlap, deletion/transition between parts, a short mapped page versus raw page length, repeated click, and refresh generation reset. This need not add retries or exceed the chosen read caps.

### M7. Nested disclosure structure and focus semantics are still missing

**Reference:** current B7 (`docs/plans/dart-phase-3.md:141-145`); `src/renderer/src/components/task-page/dart/TaskList.tsx:87-120`; `docs/STYLEGUIDE.md:55-78`.

B6's move-focus correction is sufficient at plan level. B7 still specifies only an expand button, indentation, and arrow keys. The existing row is a focusable `role="button"` with action descendants. Nesting rows under that click target risks opening the parent on expand/child actions and provides no accessible expanded state or parent-child association. Collapse behavior when a descendant has focus is unspecified.

**Fix:** Require sibling disclosure/open controls or another coherent list/tree structure, accessible expand names, `aria-expanded`, controlled-region association, and event isolation. Arrow handlers must not hijack focused descendant controls. Specify focus return on collapse and test Enter/Space/Left/Right, expanding without opening the detail, opening a child, and collapsing a focused subtree.

### M8. B9 still permits callback echoes instead of delivery evidence

**Reference:** current B6/B8 accepts and B9 (`docs/plans/dart-phase-3.md:139,153-157`); `docs/agents-md-refs/test-antipatterns.md:5-23`.

“Delivery through a fake remote runtime” does not explicitly require the fake to mutate independent host state or require a fresh rendered read/remount. Callback and request-recording assertions alone can pass while persistence or routing is broken. B9's pending-drag refresh does not cover a read resolving after settlement, and “web client probes” permits flag-only tests.

**Fix:** Require composed UI → real store/runtime routing → independently stateful fake host → forced read/remount → rendered result, for status, saved views and blockers. Add accepted-write/lost-response with evidence-not-proof notice persistence and same-field blocking, same-task status/blocker serialization and other-field progress, explicit-detail/default-list alias updates, same task ID in another account/host untouched, old-host strict refusal across remote and web-paired paths, and host-switch during a delayed probe/search. Keep lower-level callback/query assertions only as complementary checks.

### M9. Owned test surfaces lack runnable focused gate commands

**Reference:** current B1-B9 acceptance (`docs/plans/dart-phase-3.md:105-157`); `package.json:85-86,97-100`.

B2 owns normalization, persistence, IPC/RPC, preload and web registration but only names catalog verification and typecheck commands. B3's test selection covers store/runtime, not web-preload tests. B4-B8 specify tests/fixtures without naming a complete runnable selection, and B9 has no final focused test sweep. Those gates can miss the newly owned behavior.

**Fix:** Name exact test files/patterns with `pnpm test ... --maxWorkers=2` for each task, including shared saved views, persistence, IPC/RPC, web preload, runtime/store, Dart components, and composed page tests. Keep final `pnpm tc`, catalog, lint/design/boot and changed checks after the last edit. Run gates serially in one checkout. No new test framework is needed.

### M11. The frozen contracts are still names rather than complete consumer interfaces

**Reference:** current B3.0 (`docs/plans/dart-phase-3.md:115`), B4/B5/B8 (`:123-153`); Phase 2 T3.0/T4a; current `TaskDetail.tsx:10-25,55-64`.

The B8 plumbing ownership is fixed, but B3.0 still gives “columns from B4,” opaque `childLoad`, `relatedTasks` load state, `notices`, and just a `DartSavedViewsModel` name. It imports no defined column contract before B4 exists. The relationship API still lacks explicit pending/blocked blocker-field and notice/recheck/dismiss contracts needed by the accepted unknown-outcome semantics. B8 additionally refers to the detail's “existing open-task callback”; neither the current detail props nor Phase 2's frozen API defines parent/subtask navigation of that name.

**Fix:** Before B3.0 freezes, specify exact readonly column/task/count metadata, child load/retry/completeness states, relationship load/error/unsupported state, `onSetBlockers` result type, pending/blocked fields and notice API, and saved-view operations/modified state. Define column types in the frozen contract itself so B4 implements them. Give B8 an explicit scope-preserving `onOpenTask(task)` input or hook contract and its composition owner. B5 must pass the board/nested models at its assigned mount. A compile check of real typed consumer mounts should fail if any required field is absent; avoid test-only stubs or a generic extension-slot layer.

## Open minor findings

### N1. Credential permissions are misstated

**Reference:** current What exists 1 (`docs/plans/dart-phase-3.md:38`); `src/shared/rpc-contract/dart-params.ts:81-93`.

`connect`, `disconnect`, and `testConnection` are `accounts-admin`; task reads/writes are workspace-scoped. Replace “every read and write is workspace” with the narrower accurate description. The query-map range `:102-112` is correct.

### N3. Relationship nullability and mobile declaration citation remain inaccurate

**Reference:** current What exists 4/11 (`docs/plans/dart-phase-3.md:41,48`); schema `schema.yaml:3327-3366`; `mobile/src/tasks/mobile-task-provider-visibility.ts:9-13`.

The relationship **object** may be null and its fields may be omitted; individual arrays are not nullable in the schema. Correct “each … nullable.” Mobile's declaration is line 10; line 9 is its comment. Preserve absent/unsupported versus confirmed empty display semantics. D8's raw-write preservation now avoids the earlier lossy-write finding.

### N5. Complete both-theme accessibility/state review criteria

**Reference:** current B5-B9 fixtures/acceptance; `docs/STYLEGUIDE.md:21-39,55-78`.

Move/rollback focus and dragging/unknown fixtures now exist. Still require inspection of focus-visible rings, selected/current contrast, partial/failed-refresh/unchecked relationship states, and reduced-motion behavior in both themes. Specify persistent inline retry/acquire actions where data is unavailable rather than relying on a toast. Do not invent unavailable card fields.

## Suggestions

1. **S1:** Reuse one stateful fake-host delivery harness for B9 rather than separate echo-heavy provider replays.
2. **S2:** Add a concise remediation owner matrix: B1 API/transport mapping, B2 saved-view persistence, B3 capability/cache/epochs, B4 pure projections, B5 page model, B6 board/focus, B7 nesting, B8 detail/search/navigation. Sequential shared-file ownership across B1→B2 is not itself a conflict; B6/B7 do not both own `Content.tsx`.

## Citation and API audit evidence

The initial review used `codegraph explore` (completed successfully: 95 symbols across eight files) and seven parallel read-only area passes, then reconciled candidate findings against source/spec evidence. Do not propagate discarded scout claims: offset is already forwarded; `mapDartTask` ends at line 64; the query map ends at 112; Jira saved capability is at `task-source-runtime-capabilities.ts:30`, main-owned state at `ui-state-schema-parity-checks.ts:9`, catalog entries at `:1550-1551`, and Jira view-mode storage is in its disposition registry at line 68.

| What exists item | Evidence checked / result                                                                                                                                                                      |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1                | `dart-params.ts:61-112,131-148`; strict optional schema confirmed; N1 permission wording remains.                                                                                              |
| 2                | `dart-tasks.ts:31-91`, mapping page reader; ignored-offset claim **fixed in plan**. Existing test `dart-tasks.test.ts:149-165` asserts offset 500 reaches the request; it was read, not rerun. |
| 3                | `dart-task-mapping.ts:38-64,81-103`, `dart-types.ts`; current mapped fields/plain-string configuration verified.                                                                               |
| 4                | Task list/detail/update/relationships/pagination definitions in supplied schema; N3 nullability correction remains.                                                                            |
| 5                | Dart capability, task-source aggregate, protocol-version spread; Phase 2 writes-v2 is explicitly an unmerged prerequisite.                                                                     |
| 6                | Dart list, filters, page hook, list model and Content mounts; no false claim of existing board/nesting implementation.                                                                         |
| 7                | Runtime list/get/call wrapper and store read/cache/scope paths; default and explicit aliases differ as Phase 2 documents.                                                                      |
| 8                | use-now/visibility precedent; absent feature is dataset freshness and visible-window refresh, not per-task updated times.                                                                      |
| 9                | Jira shared rules, IPC/RPC, persistence/preload/web/renderer saved-filter path checked as reuse model; account isolation must be added, not inherited.                                         |
| 10               | Jira board/sections/payload/container/view-mode/disposition patterns checked; no concurrent B6/B7 shared-file conflict established.                                                            |
| 11               | Current mobile exclusion verified; N3 line correction remains; historical commit metadata was not independently inspected.                                                                     |

Schema checks: `parent_id` empty-string roots (`:1367-1372`); comma-separated `ids` (`:1294-1298`); `o` array enum with `style: form`, `explode: false` (`:1325-1360`) means a singleton `o=-completed_at` is valid. `offset` and `is_completed` basic semantics match the plan; Cancelled-kind behavior remains unverified as intended. Concise tasks omit description/relationships but have required `completedAt` (`:2288-2305`), so completion evidence exists after successful hydration. GET/PUT use wrapped tasks (`:930-999,4093-4102`); the five relationship fields are optional arrays under a nullable object. Pagination has count/next/previous/results/meta, not a snapshot guarantee. The schema has GET-by-ID views/dartboards but no corresponding list endpoint; Orca-owned saved views are not reopened.

Account storage remains a host-local account map with renderer owner key host plus user; that basic identity choice is feasible from `DartConnectionStatus.viewer.id` and `TaskSourceContext.providerIdentity.userId`. Tests must cover delayed reads/writes after owner changes and unknown user IDs. The accepted no-precondition relationship race is not a new finding; raw-preserving host read-then-PUT is retained.

## Verification limits and verdict

No live Dart calls, credential reads, product tests, builds, rendered screenshots, commits, or product edits were performed. The external artifact returned only a generic shell; visual analysis used the plan's design-reference descriptions. Phase 2 implementation is not merged, so its queue/cache contracts were checked against the approved plan, not its branches. This follow-up re-read the current plan before deciding which initial findings remain open.

**Open counts: 1 blocker, 7 major, 3 minor, 2 suggestion.** Fixed in plan: scoped detail ownership, partial-refresh failure publication, saved filter chips, unchecked blockers, generation/reset suppression, raw relationship writes, async blocker picker, move focus/announcement, offset inventory, and explicit subtask truncation. Remaining work is precise existing-contract integration and behavioral acceptance—not a new board abstraction.

Verdict: not ready
