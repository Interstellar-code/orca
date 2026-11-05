# Review: Dart phase 3 plan (Fable, round 1)

Reviewed: `docs/plans/dart-phase-3.md` (uncommitted, 2026-11-05) against `docs/plans/dart-phase-2.md`, the Dart OpenAPI YAML saved 2026-11-04, `AGENTS.md`, `docs/STYLEGUIDE.md`, `docs/agents-md-refs/test-antipatterns.md`, and the code on `main` at `47247967004`. Every file:line below was read on that commit (CodeGraph plus line-range checks); phase 2 code is not merged, so phase 2 claims are checked against its plan text only. Read-only review; no other file touched. The OMP review was not read.

Owner decisions (Orca-side saved views, 4x250 + 50, no polling, status-only drag, on-hold-only markers, "Blocked by" only, no live calls, phase 2 unmerged) are not reopened; findings only say where one is unsafe or impossible as written.

## Blocker

### B-1. Drag and blocker writes cannot be wired through phase 2's queue as the plan describes

Plan lines: D5 (line 70), D4a (line 69), B3 files (line 132: `setDartTaskBlockers` "through `enqueueDartTaskWrite`" in `dart-write-actions.ts`), B3.0 `DartBoardModel` (line 124: `pendingStatusIds`, `blockedStatusIds`, one `notice`), B5 (line 148).

What is wrong, three parts that together make B3/B5/B6 unbuildable as specified:

1. Phase 2 puts the queue in a components file, `src/renderer/src/components/task-page/dart/dart-task-write-queue.ts` (phase 2 T3.2), and the enqueue call in the detail hook (T3.4), not in the store. Phase 2's store action is `updateDartTask(taskId, updates: DartFieldUpdates, { sourceContext })` (T3.3). Phase 3 D5 calls a non-existent signature `updateDartTask(taskId, { status }, optimistic)` and B3 has a _store_ action (`dart-write-actions.ts`) call `enqueueDartTaskWrite`, a store-to-components import that phase 2 deliberately avoids.
2. `enqueueDartTaskWrite({ identity, previous, optimistic, write, refresh, patch })` and `subscribeDartTaskWrites(identity, listener, replay)` are per mutation identity (host, account, task). A board with up to 1,000 cards needs `pendingStatusIds`, `blockedStatusIds` and per-card notices for _all_ tasks of one host and account; phase 2 offers no host-wide subscription or snapshot, only `withPendingDartPatches(tasks)` (patches, not pending/blocked fields or notices).
3. `dart-task-write-queue.ts` is in no phase 3 task's "Files owned", and worker rule 2 forbids editing an unowned file; so no worker can add what (2) needs.

Fix: (a) B3 owns `dart-task-write-queue.ts` for one additive export, e.g. `subscribeDartTaskWritesForAccount(hostKey, accountKey, listener)` returning `{ pending: Map<taskId, Set<field>>, blocked: Map<taskId, Set<field>>, notices: Map<taskId, DartNoticeApi> }` (re-read the merged file first; name the exact export in B3.0). (b) D5 and B3 text: `useDartBoardModel.onMove` (B5) builds the enqueue exactly as `use-dart-task-detail-data.ts` does for the detail (identity from the default scope with `dartStatus.viewer.id`, `previous` from the cache entry, `write` = store `updateDartTask(taskId, { status }, {})`, `refresh` = forced `fetchDartTask`, `patch` = `patchDartTask`); `setDartTaskBlockers` is a plain store action that calls the new `dartUpdateTaskBlockersForTarget`, and B8's hook enqueues it with field `blockers`. (c) Fix the B3.0 contract accordingly (see M-4).

## Major

### M-1. `parentId: ''` cannot reach Dart with the changes B1 names

Plan: "What exists" item 1, B1 files (line 96, "`parentId` (string, `''` allowed)"), B1 accept (line 105, "query string for `parentId: ''`").

`OptionalString` (`src/shared/rpc-contract/rpc-param-primitives.ts:24-28`) transforms `''` to `undefined`, and `buildTaskListQuery` (`src/main/dart/dart-tasks.ts:37`) only forwards a string when `value !== ''`. B1 names neither change; its accept test would fail and the worker would have to guess which layer to touch (changing line 37 for every key would also start sending `assignee=''`, which the spec defines as "no assignee", a behaviour change for existing callers). Nothing in D3, D6 or B5 actually sends `parentId: ''`.

Fix: either drop `''` from B1 (nothing uses it; simplest) or specify both edits: `parentId: OptionalPlainString` and a `parent_id`-only exception in `buildTaskListQuery` with a test that `assignee: ''` is still dropped.

### M-2. Capability constants, probes and ownership do not line up

Plan: D1 (line 65), B1 files (line 96: "`dart.savedViews.v1` is B2's line in the same two files, added after B1 merges"), B2 (line 109).

B1 owns `src/preload/api-types.ts` (`DartApi`) and `web-dart-api.ts` and must add the probe of D1 (`supportsSavedViewsV1` or a `supportedDartFeatures()` set), but the constant it probes does not exist until B2 merges; B1 cannot compile against it. B2's own `web-dart-saved-view-api.ts` already probes `dart.savedViews.v1` itself (Jira pattern, `web-jira-filter-state-api.ts:31-34`), so a `DartApi` probe for saved views is redundant. D1 also lists "`offset` honoured" as part of `dart.board.v1` while the same paragraph says `offset` already works on old hosts (`dart-tasks.ts:42`, confirmed).

Fix: B1 adds all three constants (B2 only imports its one); drop saved views from the `DartApi` probe (saved-view support is probed in the `ui` API as Jira does); pick `supportedDartFeatures(): Promise<ReadonlySet<string>>` now (one `getRemoteRuntimeStatus()` call on the web, one `runtimeEnvironmentSupportsCapability` pass for remote targets) since B3.0 freezes `DartBoardFeatures` anyway; remove "`offset` honoured" from D1.

### M-3. Which filters go to Dart and which are applied locally is undefined, and the cache key says both

Plan: D2 (line 66, `filters` = all eight controls), D3 (line 67, "A board or list read is two parts" with no filter list), D4a (line 69, key = `'scope::' + JSON.stringify(filters)`), B4 (line 138, `applyDartBoardFilters(tasks, { onHold, blockedOnHold, tag, priority }, relationships)` is client-side).

If `tag` and `priority` are sent to Dart (they are `ListTasks` keys today, `dart-params.ts:102-112`), every chip toggle costs a new read set (up to 5 list reads + 20 task reads, D3/D7) and a board filtered by `status` collapses to one column; B4 then re-filters what Dart already filtered. If they are not sent, keying the cache by the full `filters` object makes every chip toggle a cache miss for no reason. Either way B3 and B4 will implement different things.

Fix: name the server scope explicitly: `{ dartboard, mine (assigneeId), search (title) }` goes to Dart and is the cache key; `{ status, tag, priority, onHold, blockedOnHold }` is applied by B4 over the loaded set (the board needs every status anyway). Update D2's "modified" rule, D4a's key and B5's accept ("switching a chip does not read").

### M-4. Frozen B3.0 contract has gaps that B5/B6/B7 cannot fill without changing it

Plan: B3.0 (lines 115-130).

1. `DartBoardModel.notice: DartNoticeApi` is one notice for the whole board, but phase 2's `DartWriteNotice` is `{ kind, field?, message, checkedAt? }` with no task id, and D5/G5 require the unknown-outcome notice per card ("keeps the card where it was dropped with phase 2's persistent notice"). Two unknown drags cannot be shown. Fix: `notices: ReadonlyMap<string, DartNoticeApi>` (task id → notice) or `cardInfo(taskId).notice`.
2. `DartNestedListModel.rows[].depth: 0 | 1`, while D6 says "a loaded row whose `parentId` is also loaded is drawn under that parent". A grandchild whose parent is a loaded child has no defined row. Fix: state the rule (cap at depth 1: a row whose parent is itself nested is drawn under its top-most loaded ancestor, or stays top level) and add it to B4's tests next to the cycle case.
3. `DartScopeMeta.fetchedAt` duplicates `CacheEntry.fetchedAt`; D4 says "Updated N ago" uses the cache entry's. See M-8 for why the meta copy must be the one shown.
4. `DartRelationshipsApi` is built from `{ task, sourceContext, writeScope, config }` (B8, line 168); in phase 2 `writeScope` _is_ the `sourceContext` (T3.4: "return `writeScope` (the `sourceContext`)"). One argument.

### M-5. Saved views are keyed by a client-supplied account id

Plan: D2 (line 66), B2 (line 109: "every call carries `dartUserId`"), B5 (line 144: "owner key = host id plus Dart user id; no read or write until the user id is known").

The renderer only knows the viewer of the _active_ host (`dartStatus.viewer`, valid only while `dartStatusContextKey` is that host, phase 2 T3.1 says the same). The Jira hook the plan copies derives its owner from `jiraTaskSourceContext?.hostId ?? accountBackedTaskSourceHostId` (`use-task-page-jira-saved-filters.ts:35`), which can be a host other than the active one; a view would then be saved under the active host's viewer id on the other host. And any client can read or write any account's views on a host by sending a different id (`ui.*` methods are permission `workspace`). D2's "oldest account by last write dropped first" also needs a per-account `updatedAt` that the stored shape `{ [dartUserId]: { views, activeViewId } }` lacks.

Fix: the host derives the account inside `ui.getDartSavedViews` / `ui.mutateDartSavedViews` from its own Dart connection (the same viewer `dart.status` returns) and refuses with a named failure when not connected; params carry no `dartUserId`; add `updatedAt` to the account entry; B2's isolation test switches the host's connected viewer, not a client argument.

### M-6. Three different definitions of "finished"

Plan: D3 (line 67: finished part = `isCompleted: true`, "the winner's `completedAt` decides its column"), D4a (line 69: "a task is 'done' when `completedAt` is set"), D9 (line 74: columns are statuses, "finished tasks placed by their status").

A column is a status, so `completedAt` never "decides a column". `is_completed` is a status-kind test on Dart's side ("tasks with a completed status", spec) and `completedAt` is a timestamp; whether they always agree is exactly open item C2. B3 (read split), B4 (`buildDartBoardColumns`, counts) and B5 (count line, "Show 50 more" placement) will each pick one.

Fix: one sentence in D3 used by all: the column is always `status`; "done" for `doneTotal`, the count line and the "Show 50 more" control is `completedAt != null`; delete "decides its column"; B4 tests a task with a completed status and `completedAt: null` and documents the chosen behaviour until C2.

### M-7. Old hosts (no `dart.board.v1`) are degraded further than the host requires

Plan: D1 (line 65), B3 accept (line 134: "an old host gets one page"), B5 accept (line 146: count line "old host").

`offset`, `isCompleted` and `limit` up to 250 exist on every `dart.provider.v1` host (`dart-params.ts:131-148`, `dart-tasks.ts:41-42`), and `parentId` is already mapped on list rows (`dart-task-mapping.ts:48`). Only `parent_id`, `ids`, `o` and `relationships` are new. Yet D1 limits old hosts to one open page plus "Showing N of M. Update the remote Orca server to load all tasks", and D6 says "only loaded children nest" as if nesting needed the capability. The plan itself relies on `offset` for old-host "Show 50 more", so the limit is inconsistent, not a safety choice.

Fix: old hosts run D3's 4x250 open read and nesting of loaded rows unchanged; the only old-host differences are the finished-recency label, no expand or `ids` reads, and read-only or hidden blockers. Remove the "load all tasks" message; simplify B3/B5/B9 old-host cases to match.

### M-8. D4a's single cache entry depends on how phase 2 marks entries stale, and on count-based eviction

Plan: D4a (line 69), D4 (line 68: "Updated N ago" uses the cache entry's `fetchedAt`").

Today `CacheEntry` freshness is a 60 s TTL on `fetchedAt` (`dart-read-coordination.ts:19,39-41`); there is no stale flag, and `evictStaleDartCacheEntries` (`:43-54`) drops the oldest-`fetchedAt` entries once a map passes 300. Phase 2's `invalidateDartLists` "marks stale" every list entry of the host and account after every write (D11, T3.3) by a mechanism its plan does not name. If it resets `fetchedAt`, then after any drag: "Updated N ago" shows a wrong age, the 2-minute visibility rule fires on the next focus, and the board's only copy of its rows becomes first in line for eviction once B8's per-query search entries and D6's per-parent entries (both `dartListCache`) push the map past 300: a blank board with no error. The plan's existing "stop and report" at B3.0 covers only the patch shape.

Fix: D4a states (a) `DartScopeMeta.fetchedAt` is the shown age and the visibility baseline, never the entry's; (b) B3.0 reads how the merged `invalidateDartLists` marks stale and stops to report if it touches `fetchedAt`; (c) the scope entry is exempt from count eviction, or search and children reads do not use `dartListCache` (see M-11); (d) a B3 test: 301 other list entries after a refresh do not drop the board entry.

### M-9. `dart-task.mock.ts` is unowned and needed by three parallel tasks

Plan: "What exists" item 6 (line 43), B6/B7/B8 fixtures (lines 152, 160, 168).

B6 (`DartBoard.fixture.tsx`: on-hold cards, subtask counts), B7 (`nested`), and B8 (relationships, subtasks) all need fixture tasks with `relationships`, `parentId`, an `On hold` status and `on-hold` tag. The shared mock file is in no task's owned files; three parallel edits collide at merge, or each task invents its own data in violation of the "one fixture file per task" rule 11.

Fix: B5 (last sequential task before the fan-out) extends `dart-task.mock.ts` with the phase 3 sets (`fixtureSubtasks`, `fixtureOnHoldTasks`, `fixtureRelationships`, a 1,000-card generator for the performance fixture) and B6/B7/B8 only import.

### M-10. A task whose `taskRelationships` is `null` can never get a first blocker and looks like an old host

Plan: "What exists" item 4 (line 41, correctly notes the object may be `null`), B1 step 2-3 (lines 101-102), D8 (line 73: "if `taskRelationships` itself is missing or not an object the host sends nothing and fails `notApplied`"), D6 (line 71: "without `relationships` in the reply (old host) the sections are hidden").

Spec (verified): `Task.taskRelationships` is `oneOf: TaskRelationships | null`, and `TaskUpdate.taskRelationships` likewise. A task with no links may well come back as `null`; D8 then refuses every "add blocker" on it, and B1 step 2 maps `null` to "absent", which D6 reads as "old host" and shows "Update the remote Orca server to see these tasks" on a current host.

Fix: B1 maps a `null` object to `relationships` with five empty lists (absent key stays `undefined` = old host); D8's host treats raw `null` as `{}` and sends `{ ...{}, blockerIds }` only when the read was `null`, otherwise the raw lists as now; C5 adds "first blocker on a task with no links". Keep the "not an object and not null" refusal.

### M-11. Blocker search reads go through the cached, aliased list path and are limited to one dartboard

Plan: reuse map item 7 (line 59), B8 (line 170: `searchTasks` reads `listTasks({ title, dartboard, limit: 20 })`), rule 14 (line 84: every list read through the store).

`listDartTasks` stores one `dartListCache` entry per distinct args (`dart-read-actions.ts:118-139`, key from `listCacheKey(args)`), and phase 2 registers an alias per read scope and marks every list entry stale on every write. Each debounced search string adds a cached, aliased entry that is never read again; see M-8 for the eviction knock-on. The `dartboard` restriction means a blocker on another dartboard (allowed in Dart) cannot be added from Orca, which contradicts G6/the dartai-parity goal without saying so.

Fix: add a store read `searchDartTasks(args, { sourceContext })` that runs `runDartRead` with no `store` (and no alias registration) for search; drop the `dartboard` filter or make it a "This dartboard only" toggle defaulting on; say so in B8's accept.

## Minor

### m-1. Citation slips

1. "What exists" item 8: `use-worktree-card-lifecycle-effects.ts:129` is an `installWindowVisibilityInterval(...)` call, not a `visibilitychange` listener; only `:179` is (`document.addEventListener('visibilitychange', ...)`).
2. Item 2: `countAfterDrops` is `dart-tasks.ts:63-65`, not `:62-65`.
3. D4a: `dart-slice-contract.ts:27` is `dartTaskCache`; `dartListCache` is `:28` alone.
4. Item 9 lists `jira-saved-filter-state.test.ts` without a path; it is `src/main/runtime/rpc/methods/jira-saved-filter-state.test.ts` (B2's own test path is consistent with that).
5. Item 9: `runtime-rpc-mobile-method-routing.ts:10-11` is inside `EXECUTION_HOST_METHODS`, which the file header says "also defines mobile allowlisting"; B2 should say it adds to the execution-host allowlist, not just "for parity".

### m-2. `Content.tsx` "hunk A" is already phase 2's hunk A

Line 92 names the list mount `:231-240` "hunk A"; phase 2 (line 108 of its plan) uses "hunk A" for the detail props at `:243-250`, which T4a edits. Rename phase 3's to hunk D (list mount) and hunk E (count line `:139-168`) so a worker pasting both plans does not edit the wrong lines.

### m-3. "Show 50 more" is one global read drawn under several columns

D3 reads 50 finished tasks across all completed statuses; B6 (line 154) puts a "Show 50 more" under every column holding finished tasks. Pressing it under "Done" may add rows to "Cancelled" and nothing to "Done". Put the control once (board footer or the count line): "Show 50 more finished tasks", and keep `hasMoreDone` global as the contract already has it.

### m-4. Children reads: say the cache key and the invalidation cost

D6 "cached with the list" does not say where. If `readDartSubtasks(parentId)` stores a `dartListCache` entry keyed `list::{parentId}`, phase 2's patch and invalidation reach it (good) but every write marks every expanded parent stale, so the next expand re-reads up to 250. State the key and that re-expanding after a write re-reads; or keep children in the scope meta (then patches must be applied by B4's selectors).

### m-5. Visibility refresh expectations

`visibilitychange` fires when the window is hidden, minimized or fully occluded, not on a plain app switch on macOS with the window still visible. State this in D4 and in Rohit's C-list so a test with the window visible is not reported as "refresh on return did not run".

### m-6. B5's timing tests must use fake clocks

B5 accept (line 146): "visibility after 2 minutes refreshes once, before 2 minutes does not". Say `vi.useFakeTimers()` plus a stubbed `document.visibilityState`, per `test-antipatterns.md` ("Wait on real time or networks instead of fake clocks").

### m-7. Accessibility details the styleguide and the Jira board already set

1. B6 column: `role="group"` (or `region`) with `aria-label` "<status>, N tasks"; the card list a `list`/`listitem` pair so a screen reader announces position.
2. B6 "Move to" trigger: an `aria-label` naming the task, as Jira does (`task-page-jira-board.tsx:221`, "Move {{key}}"); B6 only says "per-card Move to DropdownMenu".
3. B7 Right/Left keys must guard `event.target !== event.currentTarget` like the Enter handler (`TaskList.tsx:113-115`), or a key pressed inside the expand button toggles twice.
4. `aria-live` region: one per board, `polite`, cleared after announcing; two quick moves must not drop the second announcement (test it).

### m-8. B9's fake host has no path and two test environments

`dart-board-fake-host.test-support.ts` (line 176) is driven "on the desktop IPC, remote RPC and web routes": IPC tests run in the main-process environment, web and renderer tests in the renderer one. Name the location (under `src/main/dart/` for IPC parity tests; a renderer-side fake under `task-page/dart/` for the store/web routes) or state that one file is importable from both without violating `verify:renderer-boot-graph`.

## Suggestions

### s-1. Page the open read with an explicit order

D3 sends no `o` for the open pages, so Dart's default order applies and any update during the read can move a row across page boundaries. On hosts with `dart.board.v1`, send `o=created_at` (append-only ordering: only creates and deletes shift rows) and sort client-side `-updated_at` per D9. Keeps the "possibly incomplete" rules, triggers them less.

### s-2. Collapse `dart.board.v1` and `dart.relationships.v1`

Both ship in the same host build (B1). Two flags double the old-host matrix in B3/B9 and in the D1 prose for no observable benefit. One `dart.board.v1` (list keys, relationships read and write) plus `dart.savedViews.v1` (B2, `ui.*`) is enough.

### s-3. Performance acceptance for 1,000 cards

B6 renders up to 1,000 cards across up to ~20 columns with no virtualization (`WorkspaceKanbanLaneCardList.tsx:50` is "a pattern only"). Add a B6 accept: the 1,000-card fixture renders and a drag starts within a stated budget under the 200 ms simulated latency (styleguide line 87), or require per-column virtualization.

### s-4. Parallelism in the order

B2 needs B1 only for one capability line (M-2 removes even that); B4 is pure functions over `DartTask` and needs only B1's `relationships` type. Run `B1 ∥ B2 → B3 → (B4 ∥ B5-prep) → B5 → B6, B7, B8 → B9`, or at least `B1 ∥ B2`.

## What was checked and found correct (so the next round need not re-check)

1. Spec: `/tasks/list` has `parent_id` (empty string = no parent), `ids` (comma-separated 12-char ids), `is_completed`, `o` (array enum incl. `-completed_at`), `limit`, `offset`, `status_id`, `dartboard_id`, `view`, `view_id`, `updated_at_after`; reply `PaginatedConciseTaskList` (`count`, `results` required); `ConciseTask` has `parentId`, `updatedAt`, `completedAt`, `tags`, `priority`, `assignee`, no `description`, no `taskRelationships`; `Task` and `TaskUpdate` carry nullable `taskRelationships`; `TaskRelationships` lists are all optional arrays of `TaskId`; `/config` returns `UserSpaceConfiguration` with `statuses` as plain strings; no list endpoint for views or dartboards (`/views/{id}`, `/dartboards/{id}` only); `/tasks/{id}/move` exists and is out of scope.
2. Code: `ListTasks` is `.strict().optional()` (`dart-params.ts:131-148`); `DART_METHOD_PERMISSIONS` as stated (`:81-93`); `buildTaskListQuery`/`listTasks`/`getTask`/`readDartPage`/`mapDartTask`/`mapDartConfig` lines; `DART_PROVIDER_RUNTIME_CAPABILITY` and its advertisement; `TaskList.tsx` row and key handling; `Filters.tsx` props, selects, refresh wiring; `use-task-page-dart-state.ts` state, effects, `setDartLoading(true)` per read; `task-page-dart-list-model.ts`; `Content.tsx` header, truncation and mounts; `runtime-dart-client.ts` (`sanitizeDartTask` spreads, so `relationships` survives); `dart-read-actions.ts` list cache and `fetchedAt`; `getDartReadScope`/`scopedDartCacheKey`; `useNow`; the full Jira saved-filter path (shared rules, capability, persisted state, parity check, IPC, RPC, params, mobile routing, catalog, preload, web, hook, UI, mount, tests); the Jira board, sections, drag payload (`application/x-orca-jira-issue-ref`, 1024-byte cap, JSON parse), view container, Linear `hidden` case, view-mode storage and `ToggleGroup`, WSL dispositions entry; mobile `DEFERRED_ON_MOBILE_TASK_PROVIDERS = ['dart']`; `WorkItemScopePicker` is options-only (no async search); `formatRelativeTime`; `openDartDetailPage`; `dartTaskSourceContext` carries `providerIdentity.userId`; styleguide lines 39, 75, 78, 87; `component-fixtures.md`; every `pnpm` script named in the plan exists.
3. Ownership: no two parallel tasks (B6/B7/B8) own the same file; `TaskDetail.tsx`/`TaskDetailView.tsx` are B8's only; phase 2's `dart-detail-contracts.ts` is not edited (except that B-1 shows the write queue must be, by B3).

## Verdict

Not ready. One blocker (B-1: the board cannot reach phase 2's write queue or learn pending/blocked state as written) and eleven majors, most of them in text that B3.0 freezes; fix those before dispatch. Minor and suggestion items can be applied in the same pass.

Counts: blocker 1, major 11, minor 8, suggestion 4.
