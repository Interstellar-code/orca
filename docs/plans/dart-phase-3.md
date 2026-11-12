# Plan: Dart phase 3, a dartai-style board

Status: built and merged, 2026-11-11 (PR #12, fork `main` at `b60c0d4dd13`); installed on the Mac and Orca Ubu 7of9 (`1.4.247-fork…b60c0d4dd131` / `…6a3fd64e5af9`); Rohit's C checks pending (see "Delivery record"). Owner: Rohit. Delivery: fork `Interstellar-code/orca`, never upstream. Previous plan: `docs/plans/dart-phase-2.md`.

How to use this plan: a worker prompt is "Rules for every worker" + "Decisions" + "Glossary" + the one task, and the worker reads this whole file once. The Decisions section is the only source of rules; the Changelog at the end is history, not instructions.

Id key: G = goals, D = decisions, A1-A7 = release A tasks, B1-B7 = release B tasks, L = Rohit's live checks before a release, C = checks in Rohit's test of a release.

## Problem

The Dart tab is a flat list of at most 100 tasks with no columns, no saved places to look, no subtask tree and no blockers. Triage means opening tasks one by one or switching to dartai. Phase 2 made tasks editable; phase 3 makes the tab a board.

## Goal and done-when

1. G1 (release A): a List/Board switch in the Dart tab. The board shows one column per status (D6) with a card per loaded task, and the choice is remembered on that device after a restart.
2. G2 (A): the user saves the current filters and layout as a named Orca saved view, then picks, renames or deletes it. A view saved on a remote host appears in every client of that host.
3. G3 (A): every open task in the scope appears, up to 1,000. Finished tasks sit in their status columns, the 50 most recently completed, with one "Show 50 more finished" under the board. Past 1,000 open tasks the count line reads "Showing 1,000 of M open tasks. Pick a dartboard, Mine or search to narrow."
4. G4 (A): dragging a card to another column, or "Move to" from its menu, changes the task's status through phase 2's write queue. The card moves at once; a refusal moves it back with the message; an unknown outcome keeps it with phase 2's notice; a rate limit moves it back with phase 2's toast. No reorder inside a column, no move across dartboards.
5. G5 (A): refresh runs on the refresh button and when the window becomes visible after 2 minutes; there is no timer. "Updated N ago" shows the data's age. A refresh keeps scroll, selection, open menus and pending edits.
6. G6: (A) a custom `On hold` status is its own column and the "On hold" chip filters on-hold tasks. (B) blocked cards show a blocker icon with a count (D14), the "Blocked (on hold)" chip filters on-hold tasks with a blocker, and the detail shows Parent, "Blocked by", "Blocking" and Subtasks and edits "Blocked by".
7. G7 (B): in the unfiltered view, subtasks appear under their parent in the list and are not repeated as top-level rows or as their own cards; a search for a subtask's title shows the subtask.
8. G8 (A and B): a host without `dart.board.v1` shows the phase 2 list with the switch disabled and the tooltip "Update the remote Orca server to use the board"; a host without `dart.relationships.v1` shows release A's behaviour; the web client probes capabilities like the desktop and gets the same results; a folder workspace keeps linked mode and task opening as in phase 2; mobile still hides Dart; all repo gates pass.

Out of scope: reorder inside a column (`POST /tasks/{id}/move`), drag across dartboards, dartai's own saved views (`view`, `view_id`), polling, `updated_at_after`, "Blocking" edits, duplicate and related links, adding subtasks, multiple assignees, custom properties (phase 4), attachments, time tracking, delete, Docs, Dart on mobile.

## Prerequisites

1. Phase 2 is complete: tasks T1 to T8 merged on the fork's `main`, its final review approved, its gates green on that commit.
2. Phase 2 is verified: Rohit's hands-on test of the phase 2 dev build is done on a local and a remote host, its fix rounds are merged, and he accepted it.
3. Phase 2 is shipped: the phase 2 build is installed on the Mac and on the Orca server on Orca Ubu 7of9.
4. Live checks L1 to L5 are answered; their answers are recorded in the Decisions.
5. Release B only: live checks L6 and L7 are answered before B1's second commit and before B2.0 (release B's contracts) is written. B1's first commit (shared types only) may land before them.

State on 2026-11-07: 1 holds (PR #10 merged as `5fe2edc1cb3`, follow-up PR #11 as `6665c9c8d90`). 2 holds (Rohit accepted phase 2 on 2026-11-07; known non-blocking leftovers: PR #11's 3 low items, and a 429 never seen from the real Dart API). 3 holds (Orca Ubu 7of9 runs `1.4.214-local.1794049092976.f37650978e89`, the Mac `1.4.214-local.1794049848208.f37650978e89`, both phase 2 from fork `main` with no upstream merge; Rohit tested both). 4 holds. 5 is open. Update 2026-11-12: 5 holds (L6 and L7 answered, see D14 and D15).

Orchestrator step before the first lane of each release: re-read the phase 2 files named in "What exists" on the lane base commit and check every file and symbol name this plan uses. A mismatch is fixed in this plan before any lane starts.

## Design reference (mockups)

Canvas: https://claude.ai/artifact/KQ1KRfMTagC8me6fhvADsb (bottom row, "Phase 3").

1. `P3-Board.dc.html`, "Dart board view": A4 (column order), A5 (header: List/Board switch, dartboard picker, saved-view picker, "Save view", "Updated N ago", refresh button, filter chips, count line), A6 (columns, cards, drag with the drop column outlined, empty column "No tasks"), B4 ("Blocked (on hold)" chip), B5 (card blocker marker). "Show 50 more finished" is drawn once below the board, not per column as the mockup shows.
2. `P3-List.dc.html`, "Dart list with nested subtasks": B3 (tree rules), B4 (header row), B5 (expand and collapse, subtask count, indent, blocker markers).
3. `P3-Relationships.dc.html`, "Task detail with blockers and subtasks": B6 (on-hold banner, Relationships panel with Parent, "Blocked by" with remove buttons, "Blocking" read-only, "+ Add blocker" search popover, Subtasks section). The card's blocker marker is an icon with a count, not the mockup's text line. The mockup's Dependencies chips are not built: the Relationships panel shows the same links.

The mockups set layout, content and behaviour. Colours, type, spacing and components come from `docs/STYLEGUIDE.md`, the tokens in `src/renderer/src/assets/main.css` and the shadcn primitives in `src/renderer/src/components/ui/`, never from the mockup's hex values. A card shows only title, priority, assignee, due date, tags, subtask count and blocker marker; any other mockup field is dropped, not faked.

## What exists

Names checked on fork `main` at `b520e9824d1` (2026-11-07). File and symbol names only; find them with `git grep` on your base.

1. Contract, `src/shared/rpc-contract/dart-params.ts`: `DART_LIST_PAGE_DEFAULT = 100`, `DART_LIST_PAGE_MAX = 250`; `DART_METHOD_NAMES`, `DART_METHOD_PERMISSIONS` (task reads and writes are `workspace`; `dart.connect`, `dart.disconnect`, `dart.testConnection` are `accounts-admin`), `DART_UNVERIFIED_WRITE_METHODS`; `DART_TASK_LIST_QUERY_PARAMS` (`assigneeId`, `assignee`, `dartboard`, `status`, `tag`, `priority`, `isCompleted`, `title`, `description`); `ListTasks` is a strict optional object with those filters plus `limit` (1 to 250) and `offset`. Strict means a host refuses a key it does not know as invalid params. Reply `DartTaskPage = { tasks, totalCount }` in `src/shared/dart/dart-types.ts`; no cursor.
2. Host list, `src/main/dart/dart-tasks.ts`: `buildTaskListQuery` sends only whitelisted filters, always sets `limit`, and already sends `offset`; `countAfterDrops`; `listTasks`; `getTask`; `validateNamedFields` refuses an unknown status name before any request. `readDartPage` in `src/main/dart/dart-task-mapping.ts` keeps Dart's `count` and drops `next`.
3. Mapping, `mapDartTask` in `src/main/dart/dart-task-mapping.ts`: `id, title, htmlUrl, description?, parentId, dartboard, type, status, assignee, tags, priority, size, startAt, dueAt, createdBy, updatedBy, createdAt, updatedAt, completedAt`. `taskRelationships` is not mapped anywhere in `src/`. Cleared dates come back as `""` and pass through. `mapDartConfig` maps every config field as `string[]`: statuses have no kind, colour, order or "finished" flag, and no link to a dartboard.
4. Dart public API (OpenAPI saved 2026-11-04 from `https://app.dartai.com/api/v0/public/schema/`; spec only unless a live check says otherwise): `GET /tasks/list` returns `{ count, next, previous, results, meta }` of `ConciseTask`, which has no `description` and, per the spec, no `taskRelationships`. Query parameters include `parent_id` (direct subtasks), `ids` (comma-separated Dart ids), `is_completed`, `o` (`order`, `dartboard__order`, `updated_at`, `created_at`, `title`, `completed_at`, each also with a leading `-`), `limit`, `offset`. `GET /tasks/{id}` returns `taskRelationships` `{ subtaskIds, blockerIds, blockingIds, duplicateIds, relatedIds }` (the object may be `null`, each list may be omitted, a present list is a full id array). `PUT /tasks/{id}` accepts `taskRelationships`; there is no add or remove operation and no precondition. No endpoint lists views or dartboards. Webhooks need a URL Dart can reach, so a desktop app cannot use them.
5. Real Dart facts from phase 2's live test (2026-11-06): task replies carry `taskRelationships` and `customProperties`; datetimes are UTC; priority casing differs between tasks (`High`) and `/config` (`high`); no 429 was seen.
6. Capabilities: `DART_PROVIDER_RUNTIME_CAPABILITY = 'dart.provider.v1'` and `DART_WRITES_V2_RUNTIME_CAPABILITY = 'dart.writes.v2'` in `src/shared/dart/dart-capabilities.ts`, advertised in `TASK_SOURCE_RUNTIME_CAPABILITIES` (`src/shared/task-source-runtime-capabilities.ts`), spread into `RUNTIME_CAPABILITIES` (`src/shared/protocol-version.ts`). The renderer probes per target: `dartSupportsWritesV2ForTarget` in `src/renderer/src/runtime/runtime-dart-write-client.ts` (remote: `runtimeEnvironmentSupportsCapability`; local: `window.api.dart.supportsWritesV2()`), called on each detail mount, never cached. `writesV2Refusal` in the same file refuses a write with `notApplied` when the capability is missing.
7. Dart tab: `src/renderer/src/components/task-page/dart/TaskList.tsx` (`TaskPageDartTaskList`, row `DartTaskRow`, a `div role="button"` opened by Enter or Space); `src/renderer/src/components/task-page/dart/Filters.tsx` (local `FilterSelect`, Status and Dartboard selects, Mine/All toggle, linked-workspace toggle, search applied on Enter, refresh button that bumps `setDartRefreshNonce`); `src/renderer/src/components/task-page/dart/use-task-page-dart-state.ts` (filters in `useState`; linked-workspace mode `dartHasWorkspace` reads through `readLinkedDartTasks` in `src/renderer/src/components/task-page/dart/task-page-dart-linked-issues.ts`; the list read is wrapped in `readPastDartWrites`; a recency sort); `src/renderer/src/components/task-page/dart/use-dart-account-filters.ts` (`useDartAccountFilters` resets `mine` and `dartboard` on a host or account switch); `src/renderer/src/components/task-page/dart/use-dart-list-pinned-rows.ts` (`useDartListPinnedRows` keeps edited and created row objects per host and account in a ref, `noteDartTaskCreated`, `mergeDartListRead`, one `subscribeDartTaskWrites` per row); `src/renderer/src/components/task-page/dart/task-page-dart-list-model.ts` (`DEFAULT_DART_LIST_FILTERS`, `buildDartListArgs` with `limit: DART_LIST_PAGE_DEFAULT`, `isDartListTruncated`, `getDartStatusTone`); `src/renderer/src/components/task-page/dart/Content.tsx` (header "Dart tasks" and "{count} shown", truncation notice, list mount, detail mount); `src/renderer/src/components/task-page/dart/use-task-page-dart-detail-routing.ts` (`openDartDetailPage(task)` stores the page's `dartTaskSourceContext` as `openDartSourceContext`); fixtures `src/renderer/src/components/task-page/dart/TaskList.fixture.tsx` and `src/renderer/src/components/task-page/dart/TaskDetail.fixture.tsx`; mock data `src/renderer/src/components/task-page/dart/dart-task.mock.ts` (`fixtureTasks`, `fixtureConfig`).
8. Detail (phase 2 T4a split): `src/renderer/src/components/task-page/dart/TaskDetail.tsx`, `src/renderer/src/components/task-page/dart/TaskDetailView.tsx`, `src/renderer/src/components/task-page/dart/TaskDetailHeader.tsx`, `src/renderer/src/components/task-page/dart/TaskDetailProperties.tsx`, `src/renderer/src/components/task-page/dart/TaskDetailDescription.tsx`, `src/renderer/src/components/task-page/dart/TaskDetailComments.tsx`, `src/renderer/src/components/task-page/dart/TaskDetailLoadStates.tsx`, `src/renderer/src/components/task-page/dart/TaskDetailNotice.tsx`, `src/renderer/src/components/task-page/dart/TaskDetailSectionHeading.tsx`; hooks `src/renderer/src/components/task-page/dart/use-dart-task-detail-data.ts`, `src/renderer/src/components/task-page/dart/use-dart-task-detail-reads.ts` (`useDartDetailMetadata` probes `dartSupportsWritesV2ForTarget` on mount), `src/renderer/src/components/task-page/dart/use-dart-task-detail-writes.ts` (private hook `useDartTaskWriteState(identity)` over `subscribeDartTaskWrites` and `dartTaskWriteState`). Frozen phase 2 contracts: `src/renderer/src/components/task-page/dart/dart-detail-contracts.ts` (`DartDetailEditApi` with `pendingFields`, `blockedFields`, `configFailed`; `DartWriteNotice`; `DartNoticeApi`).
9. Phase 2 write path: `enqueueDartTaskWrite({ identity, previous, optimistic, fields?, write, refresh, patch, invalidateLists })` in `src/renderer/src/components/task-page/dart/dart-task-write-queue.ts` (`settleRefused` rolls a `dart.rateLimited` write back with a toast); `subscribeDartTaskWrites(identity, listener, replay)`, `dartTaskWriteState`, `withPendingDartPatches`, `pendingDartPatches`, `dismissDartTaskNotice`, `recheckDartTaskNotice` and the fixed field list `EDITABLE_DART_TASK_FIELDS` in `src/renderer/src/components/task-page/dart/dart-task-write-state.ts`; `readPastDartWrites` (`MAX_STALE_REREADS = 2`) in `src/renderer/src/components/task-page/dart/dart-stale-read.ts`. Outcome types `DartWriteOutcome`, `DartWriteResult`, `DartFieldUpdates` in `src/renderer/src/runtime/runtime-dart-write-client.ts`.
10. Store: `src/renderer/src/store/slices/dart/dart-slice-contract.ts` (`DartSlice` with `dartTaskCache`, `dartListCache` of `CacheEntry<DartTaskPage>`, `dartConfigCache`, `fetchDartTask`, `listDartTasks`, `updateDartTask(taskId, updates, options?: DartWriteOptions)`, `createDartTask`, `patchDartTask(identity, patch)`, `invalidateDartLists(identity)`; `DartReadOptions`, `DartWriteOptions`); `src/renderer/src/store/slices/dart/dart-read-actions.ts` (`runDartRead`, `listDartTasks`); `src/renderer/src/store/slices/dart/dart-write-actions.ts` (`createDartTask` does not write the new task to `dartTaskCache`); `src/renderer/src/store/slices/dart/dart-read-coordination.ts` (`DartReadScope`, `getDartReadScope`, `scopedDartCacheKey` = `<cachePrefix ?? contextKey>::<key>`, `isFreshDartCacheEntry` with a 60 s TTL, `evictStaleDartCacheEntries` keeping the newest 300 by `fetchedAt`, `EMPTY_DART_READ_CACHES`); `src/renderer/src/store/slices/dart/dart-connection-actions.ts` (spreads `EMPTY_DART_READ_CACHES` on connect and disconnect only; a host switch keeps caches apart by host prefix); `src/renderer/src/store/slices/dart/dart-task-identity.ts` (`dartTaskIdentity`, `dartTaskIdentityKey` = JSON array of host, account, task; `registerDartCacheAlias`; `bumpDartEpochs`; `captureDartEpoch`; `isDartEpochCurrent`); `src/renderer/src/store/slices/dart/dart-task-patch-action.ts` (`patchDartTask` and `invalidateDartLists` touch only `dartListCache` keys starting `<prefix>::list::` (`isListKeyUnder`) and set a patched entry's `fetchedAt` to 0).
11. Test support: `FakeDartHost` and `installFakeDartRuntime` in `src/renderer/src/store/slices/dart/dart-fake-runtime.test-support.ts`; the private `Transport` type, `TRANSPORTS` list and `seedPage` in `src/renderer/src/components/task-page/TaskPage.dart.delivery.test.tsx`; `installDartHost` in `src/main/dart/dart-host.test-fixture.ts` for main-process tests.
12. Jira saved filters, the model for saved views: `src/shared/jira/jira-saved-filters.ts` (50 filters, 128-char ids, 80-char names unique case-insensitively, bounded `normalizeJiraSavedFilters`, state `{ filters, activeFilterId }`, mutation union `save | delete | select` on a `kind` field, `mutateJiraSavedFilterState`); `src/shared/jira/jira-saved-filter-capability.ts` (constant and update text); storage `PersistedUIState.jiraSavedFilterState` (`src/shared/persisted-ui-state-types.ts`) with its `notApplicableDisposition` entry in `src/shared/wsl-move/wsl-move-ui-dispositions.ts` (an exhaustiveness check over `PersistedUIState`) and its line in `src/main/runtime/rpc/methods/ui-state-schema-parity-checks.ts`; IPC `src/main/ipc/ui.ts`; RPC `ui.getJiraSavedFilters` and `ui.mutateJiraSavedFilters` in `src/main/runtime/rpc/methods/client-ui.ts` (permission `workspace`), params `src/shared/rpc-contract/jira-saved-filter-params.ts`; preload `src/preload/api/ui-bridge-state-and-menu-commands.ts` and `src/preload/api/ui-command-event-api.ts` (optional methods); web `src/renderer/src/web/preload-api/web-jira-filter-state-api.ts`, registered in `src/renderer/src/web/preload-api/web-ui-api.ts`; renderer `src/renderer/src/runtime/runtime-jira-saved-filter-state.ts`, `src/renderer/src/components/task-page/jira/use-task-page-jira-saved-filters.ts`, `src/renderer/src/components/task-page/jira/TaskPageJiraSavedFilters.tsx`. Keyed by host only.
13. Jira board, the model for the board: `src/renderer/src/components/task-page/jira/task-page-jira-board.tsx` (columns `flex gap-3 overflow-x-auto`, each `w-72 shrink-0`, `Badge` header with count, ring drop indicator, dashed empty column that is a drop target, per-card "Move" `DropdownMenu` as the keyboard path), `src/renderer/src/components/task-page/jira/task-page-jira-board-sections.ts`, `src/renderer/src/components/task-page/jira/task-page-jira-board-view.tsx`; drag payload `src/renderer/src/lib/jira-board-drag-payload.ts` (custom MIME, size cap, malformed JSON rejected); Linear's `src/renderer/src/lib/linear-board-drag-payload.ts` (the `hidden` case: Electron hides `getData` during dragover). Layout switch: `src/renderer/src/components/jira-view-mode-storage.ts` (device-local key, stores only the non-default) and `src/renderer/src/components/task-page/jira/task-page-jira-view-controls.tsx` (shadcn `ToggleGroup` with `List` / `Columns3` icons); the storage module paths (not keys) are listed in `src/shared/wsl-move/wsl-move-storage-dispositions.ts`.
14. Other reuse: `formatRelativeTime` (`src/renderer/src/components/task-page/task-page-source-context.tsx`) and `use-now` (`src/renderer/src/hooks/use-now.ts`); `isWindowVisible` (`src/renderer/src/lib/window-visibility-interval.ts`); `WorkItemScopePicker` (`src/renderer/src/components/work-item-scope-picker.tsx`, static options only, Popover + Command chrome); `taskProviderErrorMessage`, `sonner`; `defineFixture` and `pnpm fixtures:shot <id> --theme both` (`docs/agents-md-refs/component-fixtures.md`); the `visibilitychange` listener precedent in `src/renderer/src/components/sidebar/use-worktree-card-lifecycle-effects.ts`; per-lane virtualisation with `@tanstack/react-virtual` in `src/renderer/src/components/sidebar/WorkspaceKanbanLaneCardList.tsx` (the pattern for a C6 fix round that virtualizes columns).
15. Mobile hides Dart: `DEFERRED_ON_MOBILE_TASK_PROVIDERS = ['dart']`, `isSelectedMobileTaskProvider`, `normalizeMobileVisibleTaskProviders` in `mobile/src/tasks/mobile-task-provider-visibility.ts`; no test asserts the hiding today.

## Glossary

1. Host: the Orca main process that talks to Dart, either this app or a remote Orca server. A target is the transport to it.
2. Capability: a string a host advertises in `RUNTIME_CAPABILITIES`. The renderer probes it per target before it sends a request key or method the host may not know.
3. Scope (`DartReadScope`): the target and cache prefix a read or write uses. The default scope is the page's active host; an explicit scope is the host and account named by a source context.
4. Source context (`TaskSourceContext`): the provider, host and account a task row came from. A detail opened from it reads and writes on that host even if the page's active host changes.
5. Cache alias: one host and account can have list entries under several cache prefixes (default scope and explicit scope). `registerDartCacheAlias` groups them, so `patchDartTask` and `invalidateDartLists` reach every `<prefix>::list::` entry of that host and account.
6. Mutation identity (`DartTaskIdentity`): `{ hostKey, accountKey, taskId }`, the key of phase 2's write queue, notices and task epochs; serialized by `dartTaskIdentityKey`.
7. Epoch: a counter per host and per task that every write bumps when it starts and settles (`bumpDartEpochs`). A read captures it first (`captureDartEpoch`); if it changed by the time the reply arrives (`isDartEpochCurrent` false), the reply is stale and `readPastDartWrites` reads again, at most twice.
8. Read set: one refresh's pages (the open pages plus the first finished page), published together or not at all; the one exception is a first read that fails part-way (D4.5).
9. "Request sent" flag: set by the host immediately before a write's own HTTP request. A failure before it is `notApplied`; after it the HTTP status decides.
10. `notApplied` / `unknown` (phase 2 D3): `notApplied` means Dart certainly did not apply the write (a 4xx other than 408, or a refusal before sending): the change rolls back with a message. `unknown` means it may have applied (network error, timeout, 408, 5xx, unreadable reply): the value stays, a persistent notice offers "Check again" and "Dismiss", and the field takes no further write until the user reconciles it.
11. Hunk: a named block of lines in a shared file that exactly one task owns.

## Architecture

Read path (board host):

1. The page hook probes the host's features on mount and on target change (D1).
2. It calls the store's `readDartScope`, a read-only attempt that reads the open pages and the first finished page and returns them without touching any cache, wrapped in phase 2's `readPastDartWrites`.
3. If the read set is current, the hook calls `publishDartScope`, which writes one ordinary list entry (`data.tasks`) and its metadata. Otherwise rows on screen stay and a message shows.
4. Pure selectors build columns, rows and card info from `data.tasks` on every render; components only render.

Write path (drag or "Move to"):

1. The card calls the board model's `onMove`, which calls phase 2's `enqueueDartTaskWrite` with `write` = phase 2's `updateDartTask(taskId, { status })`.
2. The queue applies the optimistic change through `patchDartTask`, which reaches the board's list entry by its `list::` key; on settle it patches the reply or rolls back, and `invalidateDartLists` marks the host's list entries stale.
3. Each card reads its own pending, blocked and notice state from the queue through a per-task hook.

Blocker writes (release B) take the same path with `write` = `setDartTaskBlockers` and field key `relationships`.

## Decisions

1. D1, capabilities and old hosts.
   1. Release A adds `dart.board.v1` (the `ListTasks` key `order`, `raw` on every list reply) and `dart.savedViews.v1` (the two saved-view methods). Release B adds `dart.relationships.v1` (the `ListTasks` keys `parentId` and `ids`, `relationships` on `getTask` replies and on list items when Dart sends them, and the method `dart.updateTaskBlockers`).
   2. A capability is advertised in the same commit as its handlers, never before.
   3. `DartApi` gets `supportedDartFeatures(): Promise<DartHostFeatures>` (desktop bridge: all true; web client: a capability probe). The renderer probes on tab mount and on target change, as phase 2 does for `dart.writes.v2`; the result lives in the page hook and is passed to the store actions. Saved views probe through their own web API, as Jira's do. No component checks capabilities itself.
   4. A host without `dart.board.v1` gets linked mode's treatment (D11): today's phase 2 list on today's read path, the List/Board switch disabled with the tooltip "Update the remote Orca server to use the board".
   5. A board host without `dart.relationships.v1` gets release A's behaviour unchanged: flat rows and cards, no blocker markers, no "Blocked (on hold)" chip, no Relationships or Subtasks sections in the detail. Blockers are missing on such a host, not shown read-only (Rohit, 2026-11-07; this replaces his earlier "blockers are read-only" for that host).
   6. Without a capability the renderer never sends its keys or method: `ListTasks` is strict, so an old host would refuse the whole read.
   7. Not taken: a degraded board for old hosts (a second paging mode and its tests for hosts that a server update fixes).
2. D2, paging.
   1. Open part: `isCompleted: false`, `order: 'order'`, pages of 250 by `offset`, at most 4 pages (1,000 tasks), read one after another. The read stops early when a page is short (`raw.rowCount` below the limit) or the offset reaches `raw.totalCount`.
   2. Finished part: `isCompleted: true`, `order: '-completed_at'`, 50 per read; "Show 50 more finished" reads the next 50 by `offset`. One "Show 50 more" read at a time (the button is disabled while it runs).
   3. Every cursor (open `offset`, finished `doneOffset`) advances by `raw.rowCount`, the rows Dart sent before the host dropped unmappable ones, never by the mapped or deduped count. A board read reply without `raw` fails the read set as `partialReason: 'error'`.
   4. Offset paging has no snapshot, so tasks changing in Dart during a read can shift between pages. A read set is marked possibly incomplete when a page is short before the total, ids repeat, or the final open count differs from Dart's `count`; the count line then reads "About N open tasks (Dart changed during the read) · Refresh".
   5. Dedupe by id across all pages, open and finished together: the record with the newer `updatedAt` wins (tie: the later read) and keeps the first position. The winner's `completedAt` decides whether it counts as finished; its status chooses the column (D6).
   6. Finished means a non-empty `completedAt` (`""` is not finished). Assumed equal to Dart's `is_completed`; unverified, C2 checks it for a Cancelled-kind status. If C2 shows Dart does not count a Cancelled-kind status as completed, Orca records it and accepts it with no fix round (Rohit, 2026-11-07): cancelled tasks then sit among the open tasks in their own column, count against the 1,000 cap and are included in "N open".
   7. Server filters (sent to Dart, part of the cache key): `dartboard`, `mine` (`assigneeId`, the viewer id the store holds in `dartStatus.viewer`), `search` (`title`). Client filters (applied by the selectors over loaded rows): `status`, `tag`, `priority`, `onHold`, and in release B `blockedOnHold`. Status, tag and priority match case-insensitively and show the `/config` spelling.
   8. A refresh, or a change of server filter, scope, account or host, starts a new read set: `doneOffset` returns to 0 and the read generation goes up; a "Show 50 more" reply from an older generation or cache key is dropped. A client-filter change starts no read and leaves `doneOffset`, the generation and the loaded finished pages unchanged.
   9. "Show 50 more" rows go through the dedupe rule and `withPendingDartPatches` before they are appended, then `readMoreDone` writes them into the same scope entry under the same key (`dartMountedScopeKey` is unchanged). Accepted risk: there is no epoch check on this read, so a write that overtakes it can leave at most those 50 finished rows one write stale until the next refresh.
   10. Both read actions, `readDartScope` and `readMoreDone`, take the viewer id from the store's `dartStatus.viewer?.id` at the moment they run; no caller passes it, so neither can send an unknown value. `mine` on with no viewer id sends no request: `readDartScope` returns an empty read set (`openTotal: 0`) that `publishDartScope` stores, and `readMoreDone` appends nothing, as `buildDartListArgs` does today; the page shows phase 2's sign-in copy.
   11. Count line: "N open of M · K latest done". Over 1,000 open tasks: "Showing 1,000 of M open tasks. Pick a dartboard, Mine or search to narrow." With a client filter on a read cut at 1,000: "Filtering the first 1,000 of M open tasks." Totals come from Dart's `count`.
   12. Request budget per refresh: 5 list reads, up to 3 attempts (D4), so at most 15; in release B add up to 20 task reads (D14 outcome 2) and 20 per "Check" click. Per detail mount in release B: up to 3 id reads for Parent, "Blocked by" and "Blocking", plus up to 3 for Subtasks (`readDartTasksByIds` does not cache). Search applies on Enter, so typing sends nothing.
   13. Not taken: sending status, tag and priority to Dart (a chip would need a read each time; the cost is that they filter only the loaded 1,000). Unlimited paging (rate limits are unknown; Rohit's largest dartboard has 593 tasks).
3. D3, board cache.
   1. `publishDartScope` stores one ordinary `CacheEntry<DartTaskPage>` in `dartListCache` under `scopedDartCacheKey(scope, 'list::scope::' + JSON.stringify(serverFilters))`, registered as a cache alias like every list read. `data.tasks` (open and finished, deduped) is the only copy of the rows; `data.totalCount` is the open total.
   2. Read metadata lives in `dartScopeMetaCache` under the same key and holds no tasks: `DartScopeMeta` (A3.0). `openTotal` mirrors `data.totalCount` and is written in the same store update.
   3. Open and finished lists, columns and rows are never stored; the selectors rebuild them from `data.tasks` on every render. So phase 2's `patchDartTask` and `invalidateDartLists` cover the board with no change to phase 2 files.
   4. Any other list-shaped entry phase 3 adds (release B's children entries) uses the same `list::` prefix.
   5. The new caches are keyed per host (and, for D14's relationship cache, per account), emptied on connect and disconnect through `EMPTY_DART_READ_CACHES`, and not cleared by a host switch.
   6. Eviction: the store records the key `publishDartScope` last wrote as `dartMountedScopeKey`; every action that evicts passes it (and, in release B, its `list::children::` keys) to an optional `keep` set of `evictStaleDartCacheEntries`, so a just-patched entry (`fetchedAt: 0`) cannot be evicted. `dartScopeMetaCache` is pruned to the keys still in `dartListCache`.
   7. Two clocks, on purpose: the store's 60 s TTL decides whether a re-mount reuses the cache; the 2-minute rule (D4) decides whether returning to the window refreshes. The age label and the visibility rule read only `DartScopeMeta.fetchedAt`, set when a read set is published complete, never by phase 2's stale marking.
   8. Not taken: separate open and finished copies (a second copy goes stale on every write).
4. D4, refresh and stale reads.
   1. No timer. A refresh runs on the refresh button and on `visibilitychange` to visible (`isWindowVisible`) when `DartScopeMeta.fetchedAt` is older than 2 minutes. "Updated N ago" uses `formatRelativeTime` and `use-now` over `fetchedAt`.
   2. A refresh is quiet when rows exist: no skeleton; rows, scroll, selection, open menus and pickers stay. If the refreshed rows no longer contain a task whose "Move to" menu is open or that is being dragged, the menu closes and the drag is cancelled.
   3. The page hook captures the host epoch and calls `readDartScope` through `readPastDartWrites`: a read set that a write overtook is read again, at most twice. `publishDartScope` applies `withPendingDartPatches` only to a read set that passed its epoch check.
   4. If the epoch still changed after the last re-read, nothing is published: rows and `fetchedAt` stay and "Tasks changed while loading. Refresh to try again." shows (`partialReason: 'changed'`). With nothing on screen, the same message shows with "Retry".
   5. `dart.rateLimited` or any error on any page stops the read set and discards its pages: the previous complete read stays with its own `fetchedAt` and the message shows (`partialReason: 'rateLimited'` or `'error'`). A first read with nothing on screen publishes the pages it got, marked incomplete, with the message. Nothing retries by itself.
   6. Accepted risk: the epoch is per host, so a write to any task on the host during a refresh triggers a re-read. C6 watches how often "Tasks changed while loading" shows.
   7. Not taken: polling (Rohit, 2026-11-04); `updated_at_after` delta refresh (deferred until the first live 429 or C6 shows a need); per-id stale marking (it would change phase 2's epoch code); keeping good pages after a 429 (no 429 seen yet).
5. D5, drag.
   1. Status only. A drop or "Move to" calls the board model's `onMove`, which calls `enqueueDartTaskWrite({ identity, previous, optimistic: { status }, write: () => updateDartTask(taskId, { status }), refresh: () => fetchDartTask(taskId, { force: true }), patch: (p) => patchDartTask(identity, p), invalidateLists: () => invalidateDartLists(identity) })` in the page's default scope.
   2. The reply task decides the column: a refusal rolls the card back with the message; if Dart returns another status than the one dropped on, the card moves to the status Dart returned. `unknown` keeps the card where it was dropped with phase 2's notice on that card ("Check again", "Dismiss"). A rate limit rolls back with phase 2's toast.
   3. Each card reads its own write state with phase 2's `useDartTaskWriteState(identity)`; while its `status` write is pending or blocked the card is not draggable and its "Move to" is disabled.
   4. A drop on the card's own column does nothing.
   5. Not taken: reorder inside a column (`/move`); moving across dartboards (stays in the detail); one account-wide write subscription (it would recompute the board on every write and need a second phase 2 edit).
6. D6, columns.
   1. Columns are the `/config` statuses that at least one loaded task in the scope carries, in `/config` order, plus a column for any status a task carries that `/config` does not list (named as the task gives it, after the others, `inConfig: false`).
   2. "Show empty columns" (off by default, remembered with the layout, D10) adds the remaining `/config` statuses so a card can be dropped into an empty status. While it is on, one muted line above the columns reads "Includes statuses from the whole workspace."
   3. "Move to" lists every `/config` status. A column with `inConfig: false` is not a drop target and never appears in "Move to" (the host would refuse the unknown name); a drop on it sends nothing and announces "This status is not in the workspace settings".
   4. `/config` has no dartboard-to-status link, so Orca promises only: (a) no column for a status no loaded task carries while "Show empty columns" is off; (b) every status a loaded task carries has a column; (c) an empty status of the dartboard is missing while the option is off, and with it on, statuses of other dartboards also appear. If Dart adds a mapping later, that is a follow-up.
   5. Not taken: columns from dartai's board configuration (not in the API).
7. D7, card order.
   1. Inside a column: open tasks first, in read order (`order`, dartai's board order); then finished tasks by `completedAt`, newest first. Ties break by task id.
   2. Finished after open is an Orca approximation; nothing shows dartai splits a column that way. C3 compares only the open cards; if they do not match, a fix round tries `dartboard__order`.
   3. List layout on a board host shows the same filtered `data.tasks` in phase 2's existing recency sort, with "Show 50 more finished" under the list.
8. D8, on hold.
   1. `isDartTaskOnHold(task)`: the status equals `On hold` case-insensitively, or the tags include `on-hold` case-insensitively.
   2. The `On hold` status is created in dartai as a custom status; Orca creates no statuses. Once it exists, `/config` lists it, phase 2's status picker offers it, and it is a column like any other.
   3. The "On hold" chip shows when `/config` has that status or that tag; it filters to on-hold tasks. A tag-only task counts as on hold but adds no column.
9. D9, saved views.
   1. Orca's own views, stored on the host in `PersistedUIState.dartSavedViewState` as `{ views, activeViewId }` and keyed by host only, like Jira's saved filters. A view follows its remote host.
   2. A view is `{ id, name, filters, layout, showEmptyColumns }`; release B adds the optional `nestSubtasks` (absent = `true`) and `filters.blockedOnHold` (absent = `false`). `filters` is the tab's full filter state, so a view restores exactly what is on screen: `mine`, `status`, `dartboard`, `search`, `tag`, `priority`, `onHold`.
   3. Limits copied from Jira: at most 50 views, ids at most 128 characters, names at most 80 characters and unique case-insensitively; every string filter value (including `search`) at most `DART_TITLE_MAX_LENGTH` characters (`src/shared/dart/dart-text-limits.ts`). Normalize drops invalid entries and strips unknown keys, so an older host drops a newer client's extra field instead of refusing the view. Accepted consequence: a release B client's `nestSubtasks` and `blockedOnHold` are silently dropped by a release A host and come back as their defaults.
   4. Mutation union on `kind`: `save` (upsert by id), `rename`, `delete`, `select`. Replies are the bare state, as Jira's.
   5. Selecting a view applies its filters and layout and turns linked mode off. A view is applied as saved; a name no longer in `/config` matches nothing. Changing a filter after that shows the view as modified. "Save" overwrites the active view's filters and layout and keeps its name; "Save as new" asks for a name.
   6. An account switch still resets `mine` and `dartboard` (`useDartAccountFilters`); the active view then shows as modified.
   7. Without `dart.savedViews.v1` the picker shows "Update the remote Orca server to save and reuse views." and filters still work.
   8. Not taken: dartai views (no API lists them); views per Dart account (two accounts on one host are unlikely for one user, and it needs an account lookup on the host).
10. D10, layout memory. The device-local key `orca.dart.view-mode.v1` stores `{ layout, showEmptyColumns }` (release B adds the optional `nestSubtasks`), omitting defaults; the storage module `src/renderer/src/components/dart-view-mode-storage.ts` is listed in `src/shared/wsl-move/wsl-move-storage-dispositions.ts`. An active saved view's values win over the stored ones.
11. D11, list-only modes. Two cases share one rule: linked-workspace mode (`dartHasWorkspace`) and a host without `dart.board.v1`.
    1. The tab shows today's phase 2 list on today's read path (`readLinkedDartTasks` in linked mode, `listDartTasks` with 100 rows otherwise), with phase 2's header, filters, truncation notice (still suppressed in linked mode, as today) and sort. Phase 3's chips and selects are hidden; the saved-view picker stays.
    2. The List/Board switch is disabled with the tooltip "Turn off linked tasks to use the board" (linked mode) or "Update the remote Orca server to use the board" (old host). In board layout the linked toggle is hidden.
    3. Linked mode is not part of the filters or a saved view.
12. D12, pinned and created rows. Phase 2's rules stay: an edited row stays listed until the next refresh even if it no longer matches the filters, and a created task shows at the top after the read that follows the create. The pinned-rows hook keeps the edited and created task objects per host and account (the store never holds a created task) until a read returns them; a pure `mergeDartPinnedRows(tasks, pinned, account)` adds the missing ones on top of `data.tasks` without writing to the store, and list and board models call it before the selectors. `noteDartTaskCreated` keeps its signature.
13. D13, subtasks (release B).
    1. With "Show subtasks nested" on (the default) and no search or client filter active: a task with a `parentId` is never a top-level row and never its own card. In the list it shows under its parent when the parent is loaded; when not, it is left out and the count line adds "N subtasks are under tasks not shown here" (one: "1 subtask is under a task not shown here"). On the board the parent's card carries the subtask count.
    2. With a search or any client filter active, or the option off, the list and board are flat: every task is a top-level row and its own card, as in release A. So a search for a subtask's title shows it.
    3. The list has two levels: a loaded descendant deeper than a child is drawn at depth 1 under its top-level ancestor, after that ancestor's direct children, with no expand button. A `parentId` cycle never loops. The detail shows the full hierarchy.
    4. A parent's children are read on first expand with `listTasks({ parentId })`, up to 250, cached per parent under `scopedDartCacheKey(scope, 'list::children::' + parentId)`, an ordinary list entry that phase 2's patch and invalidation reach. An expanded parent's children are its scope rows with that `parentId` plus its children entry, deduped by id (newer `updatedAt` wins). Over 250 the block ends with "Showing 250 of N subtasks · Open in Dart".
    5. A count from loaded rows says so ("3 loaded"); "N of M done" shows only after all children were read. Counts from `relationships.subtaskIds` in the detail are totals.
    6. The detail's Subtasks section reads `relationships.subtaskIds` and fetches titles and statuses with `listTasks({ ids })`, 100 ids per read, at most 3 reads, then "Showing 300 of N · Open in Dart". "Adding subtasks from Orca comes later."
    7. Not taken: subtasks as their own rows (Rohit's L2 answer: dartai shows them only under the parent); a parent breadcrumb on orphan search hits (flat rendering covers it with no new UI).
14. D14, blocker markers (release B; outcome set by L6).
    1. The marker is an icon (lucide `Ban`, or the closest styleguide icon) with the count beside it and the accessible label "Blocked by N" or "Blocking N"; a card with both shows both. The "Blocked (on hold)" chip filters to on-hold tasks with at least one blocker. In the detail, under either outcome, a task on a relationships host whose `getTask` reply has no links data (no `relationships` key) shows "Dart did not return this task's links" in place of the Relationships and Subtasks sections (Rohit, 2026-11-07).
    2. Outcome 1, L6 shows list items carry `taskRelationships`: relationships come with the list rows. Every card and row with blockers gets the marker, with no extra reads. A card or row without `relationships` (no links data) shows "Blockers not checked" and the chip keeps it (Rohit, 2026-11-07). L6 also reports whether an item for a task with no links carries empty lists or omits the field; if Dart omits it, every unlinked card shows "Blockers not checked", which Rohit accepted. No relationship cache, no enrichment reads, no "Check" button.
    3. Outcome 2, list items do not carry them: after a read set is published, `readDartOnHoldRelationships` reads `getTask` for the first 20 on-hold tasks in read order, one after another; each read set reads them again. Results go to `dartRelationshipCache`, keyed by `dartTaskIdentityKey`, with states `known | loading | error | notChecked`. Only on-hold cards get markers. An on-hold task past the 20 cap or whose read failed is "not checked", never "not blocked": the chip keeps it, its card shows "Blockers not checked", and the count line shows "N on-hold tasks not checked" with a "Check" button that reads the next 20. These reads are outside the epoch window. A blocker write's optimistic change, rollback and `unknown` update `dartRelationshipCache` through the queue's `patch` callback, and the detail's fresh `getTask` read replaces the task's `dartRelationshipCache` entry, so opening a task refreshes its marker state.
    4. Not taken: a `getTask` per card (up to 1,050 reads per refresh).
    5. Answered (L6, run through Dart's MCP server rather than the planned REST `GET /tasks/list`): list items carry no `taskRelationships`. Outcome 2 is built.
15. D15, blocker writes (release B; outcome set by L7).
    1. Only "Blocked by" is editable, on the task open in the detail; "Blocking" is read-only with "change it on that task".
    2. New host method `dart.updateTaskBlockers { taskId, blockerIds }`, permission `workspace`, listed in `DART_UNVERIFIED_WRITE_METHODS`. Ids match the 12-character Dart id pattern, are unique, at most 100, and never equal `taskId`.
    3. Outcome 1, L7 shows the other lists survive a partial write: the host sends `PUT /tasks/{id}` with `{ item: { id, taskRelationships: { blockerIds } } }` and nothing else; no pre-read.
    4. Outcome 2, they are wiped: the host reads the task fresh (`GET /tasks/{id}`) and sends the other four lists copied from the raw response JSON as Dart returned them (never from the sanitized `relationships`). A raw `null` `taskRelationships` is treated as `{}`; a missing field, or a present non-object value, sends nothing and fails `notApplied` with "Dart did not return this task's links"; a failed pre-read fails `notApplied`. Accepted limit: a link changed in dartai between that read and the write can be lost; there is no precondition to detect it. C5 confirms.
    5. The reply task is authoritative. The "request sent" flag is set right before the `PUT`. Failure operation `relationships`: a write operation, task-targeted (a 404 is `dart.taskNotFound`, `notApplied`), message "Could not update blockers.".
    6. The write goes through phase 2's queue with field key `relationships`; `relationships` is added to `EDITABLE_DART_TASK_FIELDS` (the one non-additive phase 2 edit). The renderer client refuses with `notApplied` when the host lacks `dart.relationships.v1`, as `writesV2Refusal` does.
    7. Blocker search: `searchDartTasks(text, { sourceContext, dartboard? })` in `src/renderer/src/store/slices/dart/dart-read-actions.ts`, non-caching, sends `title`, `isCompleted: false` and `limit: 25`. The picker searches all dartboards by default, with a "This dartboard only" toggle.
    8. Not taken: add and remove operations (Dart has none); editing "Blocking" (it writes another task).
    9. Answered (L7, run through Dart's MCP server rather than the planned REST `PUT`): a blockers-only update kept the other four lists. Outcome 2 is built anyway, because the REST path itself was not verified; it costs one extra `GET` per blocker write and is safe under either answer. C5 still confirms on the real build.

## Security

1. New RPC methods (`ui.getDartSavedViews`, `ui.mutateDartSavedViews`, `dart.updateTaskBlockers`) use permission `workspace`, like phase 2's Dart writes; no mobile routing is added.
2. Blocker ids are validated on the host (pattern, unique, at most 100, never the task itself) before any request.
3. Saved-view payloads are bounded by a Jira-style normalize (D9 limits, including `search` length), so a client cannot store unbounded text on the host.

## Rules for every worker (copy into each worker prompt)

1. Only the main orchestrator routes. You never call `jev_*`, never pick or switch models, efforts or agents, and use your default model for any subagent your prompt allows.
2. Stay inside "Files owned". If you need a change in a file you do not own, stop and report it; do not edit it.
3. Never `git checkout` or `git stash` to undo; fix forward.
4. No silent workarounds. If the named tool, path or method fails, stop and report: what was called, the exact text, the likely cause. Ask before any substitute. A failed tool gets three real tries, each changing something.
5. Follow `AGENTS.md` and `docs/STYLEGUIDE.md`: shadcn primitives in `src/renderer/src/components/ui/`, tokens from `src/renderer/src/assets/main.css`, comments only where code cannot say it (one line, why not how); no vague file names (`helpers`, `utils`); no type assertions except `as const` without a line-specific `SAFETY:` note; reuse before reimplementing (rule 13 is the one exception); avoid low-value tests (`docs/agents-md-refs/test-antipatterns.md`: no list-membership or inventory tests).
6. First-class concerns on every change: macOS, Linux and Windows; remote hosts (mixed client and server versions); folder workspaces (a Dart task link must keep working for a plain folder); mobile (Dart stays hidden there; do not touch `mobile/`, except task A7's new `mobile/src/tasks/mobile-task-provider-visibility.test.ts`).
7. Run your task's checks and report the real output. Do not claim done without it.
8. Never print, log, commit or paste the Dart token. Never call the real Dart API or write to the user's Dart workspace; all tests use mocks and fakes. The live checks L6 and L7 and the C checks are Rohit's own.
9. Every new user-facing string uses `translate('auto.components.task.page.dart.<File>.<key>', 'English default')` like the existing Dart files; new error codes also get an English `COPY` entry.
10. Copy patterns from the current files named in the task, not from memory.
11. Each task has its own fixture file (named in the task); do not edit another task's fixture file in the same release. A release B task listed as an owner of a release A (or phase 2) fixture or test file may add to it.
12. Do not edit phase 2's frozen `src/renderer/src/components/task-page/dart/dart-detail-contracts.ts`. Phase 3's types live in `src/renderer/src/components/task-page/dart/dart-board-contracts.ts`, frozen after A3.0 merges; release B only adds to it, in B2.0, and every field or option it adds to a type release A code already builds is optional with a named default.
13. Do not edit Jira, Linear or GitHub files; copy the named pattern into a concretely named Dart file. This is a deliberate exception to AGENTS.md "Reuse Before Reimplementing": the fork merges upstream regularly, and generalising upstream's provider files would turn each upstream change to them into a merge conflict.
14. Every new list read and search goes through the store's `src/renderer/src/store/slices/dart/dart-read-actions.ts` (including `searchDartTasks`), so caching, scope and phase 2's epochs apply; no component calls the runtime client directly.
15. Read this whole plan once. The Decisions section is the only source of rules; the Changelog is history, not instructions. This plan gives file and symbol names, not line numbers: find them with `git grep` on your base.
16. Phase 2 files take only the edits a task names. Any other needed change goes to the orchestrator.

## Releases and task order

Release A is the board: paging, drag, refresh, the On hold column and chip, saved views, the layout switch and "Updated N ago". Subtasks are plain rows and cards in release A, as in phase 2. Release B adds subtask nesting, blocker markers, the "Blocked (on hold)" chip, the detail's Relationships and Subtasks sections, and blocker writes. Each release has its own integration, review gate and Rohit test. Contracts are frozen within a release; release B only adds to them, and only optional fields with named defaults where release A code already builds the type (B1 item 2, B2.0), so release A code compiles and runs unchanged.

```
Release A: A1, A2 (parallel) -> A3.0 -> A3, A4 (parallel) -> A5 -> A6 -> A7 -> integration, review, Rohit's test
Release B: B1 first commit; L6, L7 answered -> B1 second commit -> B2.0 -> B2, B3 (parallel) -> B4 -> B5, B6 (parallel) -> B7 -> integration, review, Rohit's test
```

A1's first commit (types and the board constant, not advertised) and A2's first commit (the saved-view types file) merge to the integration branch at once; A3.0 starts from both. The integrator merges A1 before A2; A2 rebases (each advertisement in `src/shared/task-source-runtime-capabilities.ts` is an import line plus an array entry, so the rebase touches two hunks) and the integrator re-runs `pnpm generate:rpc-params-catalog`, never hand-merging the catalog. B1's first commit (shared types only) may land before L6 and L7 are answered and merges at once; B1's second commit and B2.0 wait for L6 and L7, and B2.0 starts from B1's first commit. Each of these first commits, and B2.0, must pass `pnpm tc` on its own. Release B lanes start from the fork `main` commit that carries accepted release A. L6 and L7 may run while release A is built.

Composition hunks: `src/renderer/src/components/task-page/dart/Content.tsx` hunk P3-A (the list mount becomes a List/Board switch on `layout`, plus the count line) is A5's; hunk P3-B (the nested model passed to the list, `onOpenTask` passed to the detail, the hidden-subtask count) is B4's. `src/renderer/src/components/task-page/dart/TaskDetail.tsx`: B4 adds the optional `onOpenTask` prop, B6 the relationships hook call. `src/renderer/src/components/task-page/dart/TaskDetailView.tsx`: B6 only.

## Tasks

### A1. Host and contract for the board

Goal: the host pages with a fixed order and reports raw row counts, behind `dart.board.v1` (G3, G8). Mockup: none.

Files owned:

1. `src/shared/rpc-contract/dart-params.ts`: `order` in `ListTasks` (enum of the spec's `o` values) and in `DART_TASK_LIST_QUERY_PARAMS` (`order → o`).
2. `src/shared/dart/dart-types.ts`: `raw?: { rowCount: number; totalCount: number }` on `DartTaskPage`; `DartHostFeatures = { board: boolean }`.
3. `src/shared/dart/dart-capabilities.ts`: `DART_BOARD_RUNTIME_CAPABILITY = 'dart.board.v1'`.
4. `src/shared/task-source-runtime-capabilities.ts`: the advertisement (an import line plus an entry in the array).
5. `src/main/dart/dart-tasks.ts`: `buildTaskListQuery` sends `o=<value>` (one value); `listTasks` returns `raw` read from the unmapped page (`rowCount` = results length, `totalCount` = Dart's `count`).
6. `src/main/dart/dart-task-mapping.ts`: `readDartPage`, only if `raw` needs the unmapped row count from it.
7. `src/preload/api/dart-bridge.ts` (`supportedDartFeatures: async () => ({ board: true })`), `src/preload/api-types.ts` (`DartApi.supportedDartFeatures`, with a one-line note that it is a client-side capability query, not an RPC).
8. `src/renderer/src/web/preload-api/web-dart-api.ts`: `supportedDartFeatures` probes `getRemoteRuntimeStatus()` exactly as its `supportsWritesV2` does; a probe failure gives all false.
9. `src/shared/rpc-contract/rpc-params-catalog.generated.ts`, regenerated with `pnpm generate:rpc-params-catalog`.
10. Tests (additions): `src/main/dart/dart-tasks.test.ts`, `src/shared/rpc-contract/dart-params.test.ts`, `src/main/dart/dart-transport-parity.test.ts`, `src/renderer/src/web/preload-api/web-dart-api.test.ts`.

Steps:

1. First commit: items 2 and 3 only (types and constant, not advertised); it merges at once.
2. Then the query key, `raw`, the bridge and web probe, and the advertisement line in one commit.
3. No `DELETE`, `move`, `view`, `view_id` or `updated_at_after`.

Accept:

1. `order: 'order'` sends `o=order`; `order: '-completed_at'` sends `o=-completed_at`; no `order` sends no `o`.
2. `offset: 500` reaches the request.
3. `ListTasks` still refuses an unknown key.
4. 250 raw rows with one unmappable return 249 `tasks`, `raw.rowCount` 250 and `raw.totalCount` equal to Dart's `count` (not the adjusted `totalCount`).
5. IPC, RPC and web replies carry `raw` identically.
6. The web probe returns `board: true` with the capability, false without it, false on a probe failure, and does not trust a host switched mid-probe.

Test command: `pnpm test src/main/dart src/shared/rpc-contract/dart-params.test.ts src/renderer/src/web/preload-api/web-dart-api.test.ts --maxWorkers=2`; then `pnpm verify:rpc-params-catalog`, `pnpm tc`, `pnpm exec oxlint <changed files>`.

### A2. Host side of saved views

Goal: saved views are stored on the host and reachable over IPC, RPC and the web client (G2, G8). Mockup: none.

Files owned:

1. `src/shared/dart/dart-saved-views.ts` (new, modelled on `src/shared/jira/jira-saved-filters.ts` and `src/shared/jira/jira-saved-filter-capability.ts`): `DartLayout = 'list' | 'board'`; `DartBoardFilters = { mine: boolean; status: string | null; dartboard: string | null; search: string; tag: string | null; priority: string | null; onHold: boolean }`; `DartSavedView = { id: string; name: string; filters: DartBoardFilters; layout: DartLayout; showEmptyColumns: boolean }`; `DartSavedViewState = { views: DartSavedView[]; activeViewId: string | null }`; `DartSavedViewMutation = { kind: 'save'; view: DartSavedView } | { kind: 'rename'; id: string; name: string } | { kind: 'delete'; id: string } | { kind: 'select'; id: string | null }`; the D9 limits; `normalizeDartSavedViewState`; `mutateDartSavedViewState`; `DART_SAVED_VIEWS_RUNTIME_CAPABILITY = 'dart.savedViews.v1'`; `DART_SAVED_VIEWS_UPDATE_REQUIRED = 'Update the remote Orca server to save and reuse views.'`.
2. `src/shared/rpc-contract/dart-saved-view-params.ts` (new, modelled on `src/shared/rpc-contract/jira-saved-filter-params.ts`): zod schemas for the mutation and `filters`, with D9's bounds; unknown keys stripped (`z.object`, which strips, not Jira's `z.strictObject`, which refuses).
3. `src/shared/persisted-ui-state-types.ts`: field `dartSavedViewState`.
4. `src/shared/wsl-move/wsl-move-ui-dispositions.ts`: a `notApplicableDisposition` entry for `dartSavedViewState`, as Jira's.
5. `src/main/runtime/rpc/methods/ui-state-schema-parity-checks.ts`: its main-owned line.
6. `src/main/ipc/ui.ts`: two handlers beside Jira's.
7. `src/main/runtime/rpc/methods/client-ui.ts`: `ui.getDartSavedViews` and `ui.mutateDartSavedViews`, permission `workspace`, bare state replies.
8. `src/shared/task-source-runtime-capabilities.ts`: the advertisement of `dart.savedViews.v1` (an import line plus an entry in the array).
9. `src/preload/api/ui-bridge-state-and-menu-commands.ts`, `src/preload/api/ui-command-event-api.ts` (optional methods, as Jira's).
10. `src/renderer/src/web/preload-api/web-dart-saved-view-api.ts` (new, modelled on `src/renderer/src/web/preload-api/web-jira-filter-state-api.ts`) and its registration in `src/renderer/src/web/preload-api/web-ui-api.ts`.
11. `src/shared/rpc-contract/rpc-params-catalog.generated.ts`, regenerated.
12. Tests (new): `src/shared/dart/dart-saved-views.test.ts`, `src/main/runtime/rpc/methods/dart-saved-view-state.test.ts` (modelled on `src/main/runtime/rpc/methods/jira-saved-filter-state.test.ts`), `src/main/persistence/applying-settings/persistence-dart-saved-views.test.ts` (modelled on `src/main/persistence/applying-settings/persistence-jira-saved-filters.test.ts`), `src/renderer/src/web/preload-api/web-dart-saved-view-api.test.ts`.

Not edited: `src/main/runtime/runtime-rpc/runtime-rpc-mobile-method-routing.ts` (it would allow the methods for paired phones).

Steps:

1. First commit: item 1's types and constants only; it merges at once.
2. Then normalize and mutate, the storage, handlers, web API and the advertisement line in one commit.

Accept:

1. Normalize drops a 51st view, an 81-character name, a duplicate name differing only in case, and a `search` over the cap; it strips unknown keys.
2. `save` with a new id adds a view; with an existing id it replaces that view.
3. `rename` to a duplicate name is refused; `delete` of the active view clears `activeViewId`; `select` of an unknown id gives `null`.
4. Persistence round trip through the settings path the code writes.
5. IPC and RPC replies are equal.
6. The web API against a host without the capability returns `DART_SAVED_VIEWS_UPDATE_REQUIRED`.

Test command: `pnpm test src/shared/dart/dart-saved-views.test.ts src/main/runtime/rpc/methods/dart-saved-view-state.test.ts src/main/persistence/applying-settings/persistence-dart-saved-views.test.ts src/renderer/src/web/preload-api/web-dart-saved-view-api.test.ts --maxWorkers=2`; then `pnpm verify:rpc-params-catalog`, `pnpm tc`, `pnpm exec oxlint <changed files>`.

### A3. Renderer client, store reads and frozen board contracts

Goal: the renderer reads and publishes a whole scope through the store, with the contracts every later release A task builds on (G3, G5, G8). Mockup: none.

A3.0 (own commit, merges first): new `src/renderer/src/components/task-page/dart/dart-board-contracts.ts`, types only, all fields `readonly`. It imports `DartLayout`, `DartBoardFilters` and `DartSavedView` from `src/shared/dart/dart-saved-views.ts`, `DartHostFeatures` from `src/shared/dart/dart-types.ts`, and phase 2's `DartWriteResult` and `DartWriteNotice`; it defines nothing twice.

```ts
type DartServerFilters = Pick<DartBoardFilters, 'mine' | 'dartboard' | 'search'>
type DartClientFilters = Omit<DartBoardFilters, 'mine' | 'dartboard' | 'search'>
type DartBoardFeatures = DartHostFeatures & { savedViews: boolean }
type DartScopeMeta = {
  openTotal: number
  doneTotal: number
  doneOffset: number
  generation: number
  fetchedAt: number
  incomplete: boolean
  partialReason: 'rateLimited' | 'error' | 'changed' | null
}
type DartScopeReadResult = {
  tasks: readonly DartTask[] // deduped, read order
  openTotal: number
  doneTotal: number
  doneOffset: number
  incomplete: boolean
  failure: { reason: 'rateLimited' | 'error'; message: string } | null
}
type DartLoad<T> = {
  state: 'idle' | 'loading' | 'ready' | 'error'
  data: T | null
  error: string | null
  retry(): void
}
type DartBoardColumn = {
  key: string
  status: string
  inConfig: boolean
  tasks: readonly DartTask[]
  count: number
}
type DartCardInfo = { task: DartTask; onHold: boolean }
type DartBoardModel = {
  columns: readonly DartBoardColumn[]
  statuses: readonly string[] // every /config status, for "Move to"
  hostKey: string
  accountKey: string // drag payload and per-card write state
  showEmptyColumns: boolean
  meta: DartScopeMeta
  hasMoreDone: boolean
  doneMore: DartLoad<null>
  features: DartBoardFeatures
  cardInfo(taskId: string): DartCardInfo
  onMove(task: DartTask, status: string): Promise<DartWriteResult<{ task: DartTask }>>
  showMoreDone(): void
  onOpenTask(task: DartTask): void
}
type DartBoardProps = { model: DartBoardModel; selectedTaskId: string | null }
type DartSavedViewsModel = {
  views: readonly DartSavedView[]
  activeViewId: string | null
  modified: boolean
  load: DartLoad<null>
  pending: boolean
  supported: boolean
  apply(id: string | null): Promise<boolean>
  saveCurrent(): Promise<boolean> // overwrites the active view, keeps its name
  saveAsNew(name: string): Promise<boolean>
  rename(id: string, name: string): Promise<boolean>
  remove(id: string): Promise<boolean>
}
// A4 implements, over the scope entry's data.tasks (never a copy):
// isDartTaskFinished(task): boolean
// isDartTaskOnHold(task): boolean
// hasDartOnHoldOption(config: DartWorkspaceConfig): boolean
// buildDartBoardColumns(tasks, config, opts: { showEmptyColumns: boolean }): DartBoardColumn[]
// buildDartCardInfo(task): DartCardInfo
// applyDartBoardFilters(tasks, filters: DartClientFilters): DartTask[]
```

The board keeps open on click or Enter and the current-card style; workspace links and "start workspace" stay list-only. The compile check is real mounts: A5 mounts `DartBoard` with `DartBoardProps`, so `pnpm tc` fails on a missing field.

Store signatures (in `src/renderer/src/store/slices/dart/dart-slice-contract.ts`, written in A3.0's commit):

1. `readDartScope(serverFilters: DartServerFilters, options: { features: DartHostFeatures }): Promise<DartScopeReadResult>`: read-only, default scope; writes nothing to any cache. The viewer id for `mine` comes from the store's `dartStatus.viewer?.id` (D2.10), never from the caller.
2. `publishDartScope(serverFilters: DartServerFilters, outcome: { result: DartScopeReadResult; current: boolean }): void`: applies D3 and D4 (complete and current: replace entry and meta, `fetchedAt` now, generation + 1; failure or not current with an entry on screen: entry and `fetchedAt` unchanged, only `partialReason` set; failure with nothing on screen: publish the pages, incomplete; not current with nothing on screen: meta only, `partialReason: 'changed'`).
3. `readMoreDone(serverFilters: DartServerFilters, options: { features: DartHostFeatures }): Promise<DartClientResult<object>>`: D2.2, D2.8, D2.9, D2.10; the viewer id comes from the store as for `readDartScope`.
4. State: `dartScopeMetaCache: Record<string, DartScopeMeta>`, `dartMountedScopeKey: string | null`.

Files owned (after A3.0):

1. `src/renderer/src/runtime/runtime-dart-client.ts`: the list wrapper passes `order`; new `dartBoardFeaturesForTarget(target): Promise<DartHostFeatures>` (remote: `runtimeEnvironmentSupportsCapability`; local: `window.api.dart.supportedDartFeatures()`; any failure: all false).
2. `src/renderer/src/runtime/runtime-dart-saved-view-state.ts` (new, modelled on `src/renderer/src/runtime/runtime-jira-saved-filter-state.ts`).
3. `src/renderer/src/store/slices/dart/dart-slice-contract.ts`, `src/renderer/src/store/slices/dart/dart.ts` (initial state), `src/renderer/src/store/slices/dart/dart-read-actions.ts` (the three actions).
4. `src/renderer/src/store/slices/dart/dart-read-coordination.ts` (additive: `dartScopeMetaCache` in `EMPTY_DART_READ_CACHES`; optional `keep: ReadonlySet<string>` on `evictStaleDartCacheEntries`), and `src/renderer/src/store/slices/dart/dart-connection-actions.ts` only if its spreads need a change.
5. `src/renderer/src/store/slices/dart/dart-fake-runtime.test-support.ts`: extend `FakeDartHost` with offset paging, `o`, `raw`, capability flags `board` and `savedViews`, and saved-view state. No second fake host file.
6. `src/renderer/src/components/task-page/dart-delivery-transports.test-support.tsx` (new): `Transport`, `TRANSPORTS` and `seedPage` moved out of `src/renderer/src/components/task-page/TaskPage.dart.delivery.test.tsx`, `open(...)` options gaining `board` and `savedViews`, and the reset also emptying `dartScopeMetaCache`; `src/renderer/src/components/task-page/TaskPage.dart.delivery.test.tsx` (imports only).
7. `src/renderer/src/components/task-page/dart/use-dart-task-detail-writes.ts`: add `export` to `useDartTaskWriteState`, nothing else.
8. Tests: new `src/renderer/src/store/slices/dart/dart-scope-read.test.ts`, new `src/renderer/src/runtime/runtime-dart-saved-view-state.test.ts`, additions to `src/renderer/src/runtime/runtime-dart-client.test.ts`.

Accept (each through the fake host, asserting on its recorded requests and the store state):

1. Paging stops after 4 pages, at a short page (by `raw.rowCount`) and at the total (`raw.totalCount`).
2. A 250-raw-row page with 249 mapped makes the next request `offset: 250`; a count of 251 does not stop after page 1.
3. A reply without `raw` fails the read set with `failure.reason: 'error'`.
4. Dedupe across pages and between open and finished: newer `updatedAt` wins, the first position is kept.
5. Open pages carry `isCompleted: false`, `order: 'order'`, `limit: 250`; the finished page `isCompleted: true`, `order: '-completed_at'`, `limit: 50`.
6. `readDartScope` leaves every cache unchanged.
7. Publishing a refresh whose page 3 hit a rate limit keeps the previous entry and its `fetchedAt` and sets `partialReason: 'rateLimited'`; on a first read it publishes pages 1 and 2, marked incomplete.
8. "Show 50 more" reads `offset` = `doneOffset`; its reply after a refresh or a server-filter change is dropped and `doneOffset` restarts at 0. After three finished pages are loaded, changing a client filter sends no request and leaves `doneOffset` and the generation unchanged, and the next "Show 50 more" reads the next page by raw offset with no duplicate rows. With `mine` on, the "Show 50 more" request carries the same `assigneeId` as the open pages; with no viewer id in the store it sends nothing.
9. After publish, `patchDartTask` on a task in the entry updates it and `invalidateDartLists` marks it stale; another host's entry is untouched. A `patchDartTask` and an `invalidateDartLists` issued with an explicit-scope identity of the same host and account (as a detail opened from a source row does, under a different cache prefix) update and stale the default-scope `list::scope::` entry through `registerDartCacheAlias`; a different account's identity does not. This uses the real phase 2 patcher, not a fake.
10. Connect and disconnect empty `dartScopeMetaCache`; a host switch keeps both hosts' entries.
11. 300 other list entries do not evict the mounted scope entry right after a patch.
12. `mine` on with no viewer in the store's `dartStatus` sends no request and publishes `openTotal: 0`; with a viewer, every open page carries that viewer's `assigneeId`.
13. `DartScopeMeta.openTotal` equals `data.totalCount` after every publish.
14. `dartBoardFeaturesForTarget`: remote with and without the capability, local through the bridge, a failure gives all false.
15. The saved-view client gets and mutates on a local and a remote target; a host without the capability gives `supported: false`.

Test command: `pnpm test src/renderer/src/store/slices/dart src/renderer/src/runtime/runtime-dart-client.test.ts src/renderer/src/runtime/runtime-dart-saved-view-state.test.ts src/renderer/src/components/task-page/TaskPage.dart.delivery.test.tsx --maxWorkers=2`; then `pnpm tc`, `pnpm exec oxlint <changed files>`.

### A4. Pure board model

Goal: pure, tested rules for finished, on hold, columns and client filters (G1, G3, G6). Mockup: `P3-Board.dc.html` (columns and order).

Files owned:

1. `src/renderer/src/components/task-page/dart/dart-board-columns.ts` (new): the six A3.0 functions, with the exact signatures.
2. `src/renderer/src/components/task-page/dart/dart-board-columns.test.ts` (new).

Accept (unit tests, no React):

1. `isDartTaskFinished`: a date is finished; `null` and `""` are not.
2. Columns follow D6: `/config` order, unknown statuses last with `inConfig: false`, an empty `/config`, duplicate ids, a status matched case-insensitively and shown in the `/config` spelling.
3. "Show empty columns" adds the remaining `/config` statuses.
4. Order inside a column follows D7: a column mixing open and finished tasks keeps read order for open tasks, puts finished after them newest first, and breaks ties by id.
5. Four `/config` cases: `On hold` status only, `on-hold` tag only, both, neither. The `On hold` column exists only when tasks carry that status, or "Show empty columns" is on and the status is in `/config`; `hasDartOnHoldOption` is true with the status or the tag; a tag-only task is on hold and adds no column.
6. `applyDartBoardFilters` applies `status`, `tag`, `priority` (case-insensitive) and `onHold`.

Test command: `pnpm test src/renderer/src/components/task-page/dart/dart-board-columns.test.ts --maxWorkers=2`; then `pnpm tc`, `pnpm exec oxlint <changed files>`.

### A5. Dart tab state, header and saved views UI

Goal: the page state and header: List/Board switch, saved views, filters and chips, refresh and "Updated N ago", the board model, and the list-only modes (G1, G2, G3, G5, G8). Mockup: `P3-Board.dc.html` and `P3-List.dc.html`, header rows.

Files owned:

1. `src/renderer/src/components/task-page/dart/use-task-page-dart-state.ts`: features probe on mount and target change (D1); on a board host, reads through `readDartScope` inside `readPastDartWrites`, then `publishDartScope` (D4); list-only modes unchanged (D11); filters gain `tag`, `priority`, `onHold`; layout state; the visibility refresh (D4.1).
2. `src/renderer/src/components/task-page/dart/task-page-dart-list-model.ts`: default filters for `DartBoardFilters` and the server and client split.
3. `src/renderer/src/components/task-page/dart/Filters.tsx`: List/Board `ToggleGroup` (as `src/renderer/src/components/task-page/jira/task-page-jira-view-controls.tsx`), saved-view picker and "Save view", Tag and Priority selects, "On hold" chip, "Show empty columns" (board only), "Updated N ago" beside the refresh button.
4. `src/renderer/src/components/dart-view-mode-storage.ts` (new, modelled on `src/renderer/src/components/jira-view-mode-storage.ts`) and its entry in `src/shared/wsl-move/wsl-move-storage-dispositions.ts` (D10).
5. `src/renderer/src/components/task-page/dart/use-task-page-dart-saved-views.ts` (new, modelled on `src/renderer/src/components/task-page/jira/use-task-page-jira-saved-filters.ts`, owner key the host target only).
6. `src/renderer/src/components/task-page/dart/TaskPageDartSavedViews.tsx` (new, modelled on `src/renderer/src/components/task-page/jira/TaskPageJiraSavedFilters.tsx`).
7. `src/renderer/src/components/task-page/dart/Content.tsx` hunk P3-A and the count line (D2.11, D2.4, D4.4, D4.5), including the "Show 50 more finished" button under the list in list layout on a board host (D7.3; A6 owns the board's button).
8. `src/renderer/src/components/task-page/dart/use-dart-board-model.ts` (new): `useDartBoardModel(...)` returning `DartBoardModel`; calls `mergeDartPinnedRows`, then the A4 selectors with `useMemo` on store changes; `onMove` as D5.1. No hook or component keeps its own copy of tasks or columns.
9. `src/renderer/src/components/task-page/dart/DartBoard.tsx`: a placeholder typed with `DartBoardProps`, mounted for real in `src/renderer/src/components/task-page/dart/Content.tsx`; A6 takes it over.
10. `src/renderer/src/components/task-page/dart/use-dart-list-pinned-rows.ts`: re-expressed over the store (D12), with the pure `mergeDartPinnedRows`.
11. `src/renderer/src/components/task-page/dart/use-dart-account-filters.ts`: extended to `DartBoardFilters`.
12. `src/renderer/src/components/task-page/dart/dart-task.mock.ts`: release A data (finished tasks, on-hold tasks by status and by tag, an unknown status). A6 and A7 only import it.
13. Fixture `src/renderer/src/components/task-page/dart/Filters.fixture.tsx` (new), exports `wide`, `saved-view-modified`, `list-only`.
14. Tests: additions to `src/renderer/src/components/task-page/dart/use-task-page-dart-state.test.tsx` and `src/renderer/src/components/task-page/dart/Filters.test.tsx`; new `src/renderer/src/components/task-page/dart/use-dart-board-model.test.tsx`, `src/renderer/src/components/task-page/dart/TaskPageDartSavedViews.test.tsx`, `src/renderer/src/components/task-page/dart/use-task-page-dart-saved-views.test.tsx`, `src/renderer/src/components/task-page/dart/use-dart-list-pinned-rows.test.ts`, `src/renderer/src/components/task-page/dart/Content.layout.test.tsx`.

Accept:

1. Switching layout keeps filters; the layout survives a remount through `orca.dart.view-mode.v1`, which stores only non-defaults.
2. A refresh with rows present shows no skeleton and keeps the selected row and scroll.
3. With fake timers: becoming visible 2 minutes after `fetchedAt` refreshes once; before 2 minutes it does not.
4. A status write that settles while a refresh is in flight makes the hook re-read through `readPastDartWrites` (at most two re-reads). If the epoch changes again after the last re-read, nothing is published, rows stay, and "Tasks changed while loading. Refresh to try again." shows; with nothing on screen the message shows with "Retry".
5. Changing the status, tag or priority select or the "On hold" chip sends no request.
6. Count lines: under 1,000; over 1,000; a client filter on a cut read; an incomplete read (exact D2.11 and D2.4 strings).
7. A host without `dart.board.v1` and linked mode each show phase 2's list and reads with the switch disabled and its tooltip; applying a saved view turns linked mode off.
8. Saved views: applying sets filters and layout; a filter change shows "modified"; "Save" keeps the name; "Save as new" asks for one; rename and delete work; a host without the capability shows the update text and filters still work; an account switch resets `mine` and `dartboard` and shows the active view as modified.
9. Pinned rows: an edited row a re-read no longer returns stays listed; a created task shows at the top after the follow-up refresh; `data.tasks` is unchanged; a pinned row from host A does not show on host B.
10. A `patchDartTask` on a loaded task moves its card to the new column with no read.
11. `src/renderer/src/components/task-page/dart/Content.tsx` mounts the placeholder board with its model in board layout and the list in list layout; in list layout on a board host, "Show 50 more finished" shows under the list while more finished tasks exist, calls `showMoreDone` and is disabled while that read runs.
12. `mine` with no viewer id shows phase 2's sign-in copy and sends no request.

Test command: `pnpm test src/renderer/src/components/task-page/dart/use-task-page-dart-state.test.tsx src/renderer/src/components/task-page/dart/Filters.test.tsx src/renderer/src/components/task-page/dart/use-dart-board-model.test.tsx src/renderer/src/components/task-page/dart/TaskPageDartSavedViews.test.tsx src/renderer/src/components/task-page/dart/use-task-page-dart-saved-views.test.tsx src/renderer/src/components/task-page/dart/use-dart-list-pinned-rows.test.ts src/renderer/src/components/task-page/dart/Content.layout.test.tsx --maxWorkers=2`; then `pnpm tc`, `pnpm exec oxlint <changed files>`, `pnpm fixtures:shot task-page/dart/Filters:wide --theme both`.

### A6. Board view and drag

Goal: the board: columns, cards, drag and "Move to", "Show 50 more finished" (G1, G3, G4, G6). Mockup: `P3-Board.dc.html`.

Files owned:

1. `src/renderer/src/components/task-page/dart/DartBoard.tsx` (takes over A5's placeholder), `src/renderer/src/components/task-page/dart/DartBoardColumn.tsx` (new), `src/renderer/src/components/task-page/dart/DartBoardCard.tsx` (new), modelled on `src/renderer/src/components/task-page/jira/task-page-jira-board.tsx`.
2. `src/renderer/src/lib/dart-board-drag-payload.ts` (new, modelled on `src/renderer/src/lib/jira-board-drag-payload.ts`, MIME `application/x-orca-dart-task-ref`, payload `{ taskId, hostKey }`, with Linear's `hidden` dragover case).
3. Fixture `src/renderer/src/components/task-page/dart/DartBoard.fixture.tsx` (new), exports `wide`, `dragging`, `empty-columns`, `unknown-outcome`, `large` (1,000 cards).
4. Tests (new): `src/renderer/src/components/task-page/dart/DartBoard.test.tsx`, `src/renderer/src/lib/dart-board-drag-payload.test.ts`.

Steps:

1. Card: title, priority, assignee, due date, tag chips (at most 3 plus "+N"); click or Enter opens the existing detail; the current card uses the list-row current style from `docs/STYLEGUIDE.md` (`bg-accent` plus `data-current="true"`); a per-card "Move to" `DropdownMenu` lists every `/config` status, and its trigger's accessible name includes the task title. Each card reads its write state with `useDartTaskWriteState` and shows its own notice with "Check again" and "Dismiss".
2. Focus: after "Move to" the moved card keeps focus in its new column, scrolled into view, and an `aria-live="polite"` region says "Moved to <status>"; on rollback focus returns to the card in its old column and the region announces the refusal; Escape closes the menu with focus on its trigger.
3. Column: a `role="group"` labelled with its status and count; header with status and count; a dashed "No tasks" drop target when empty. One "Show 50 more finished" button below the board while more finished tasks exist. The D6.2 hint line when "Show empty columns" is on. Horizontal scroll with `.scrollbar-sleek`. No card tilt or drop animation under `prefers-reduced-motion`.

Accept:

1. A drop calls `onMove` once with the new status and the card moves before the reply; a refusal returns it with the message; `unknown` keeps it with its notice; a reply with another status moves it to that status.
2. A drop on its own column does nothing; a pending or blocked card is not draggable and its "Move to" is disabled.
3. "Move to" works by keyboard only, with the focus rules above; each trigger's accessible name includes its task's title.
4. A payload from another host, or malformed, is ignored.
5. A drop on an `inConfig: false` column sends no write, leaves the card in place and announces "This status is not in the workspace settings".
6. A refresh that no longer contains the task with an open menu closes the menu.

Test command: `pnpm test src/renderer/src/components/task-page/dart/DartBoard.test.tsx src/renderer/src/lib/dart-board-drag-payload.test.ts --maxWorkers=2`; then `pnpm tc`, `pnpm exec oxlint <changed files>`, and `pnpm fixtures:shot task-page/dart/DartBoard:<id> --theme both` for each fixture export.

### A7. Release A checks and Rohit's test list

Goal: prove release A end to end on every transport and host version, and hand Rohit his release A test list (G8). Mockup: `P3-Board.dc.html`, for screenshot comparison.

Files owned (tests and docs only):

1. `src/renderer/src/components/task-page/TaskPage.dart-board.test.tsx` (new), driven by `FakeDartHost` through `src/renderer/src/components/task-page/dart-delivery-transports.test-support.tsx` on the desktop IPC, remote RPC and web routes.
2. Additions to `src/main/dart/dart-transport-parity.test.ts` (uses `installDartHost`).
3. `mobile/src/tasks/mobile-task-provider-visibility.test.ts` (new; the one `mobile/` file phase 3 touches).

Accept (assertions on the fake host's state and the rendered result after a forced re-read or remount, never on mock calls alone):

1. Delivery: a drag, and saved view create, select, rename and delete.
2. Races: a refresh resolving after a drag settles; a refresh that publishes while a drag's write is still pending keeps the card in the dropped column, and the settle then patches or rolls back as usual; two drags settling during a 5-page refresh, where the second re-read publishes; "Show 50 more" after a server-filter change.
3. Creating a task with the board layout open: it shows after the follow-up refresh.
4. Linked mode and a host without `dart.board.v1` keep phase 2's list and reads; a host without `dart.savedViews.v1` shows the update text.
5. Unknown outcome then reconcile; host and account isolation; web client probes; a folder workspace keeps linked mode and task opening.
6. The four `/config` on-hold cases through the real renderer: the `On hold` column and status picker entry appear only with the status, the chip with the status or the tag, and an unknown task status still gets its column.
7. Request order keys: `order: 'order'` on open pages, `'-completed_at'` on finished pages.
8. Mobile: `normalizeMobileVisibleTaskProviders` given a stored list including `'dart'` returns the others without it, and `isSelectedMobileTaskProvider('dart')` is false while another provider is true.
9. Review of fixtures and screenshots: focus-visible rings, the current-card style, partial and error states with inline "Retry", reduced motion, no invented values.

Test commands, each run separately:

1. `pnpm test src/renderer/src/components/task-page/TaskPage.dart-board.test.tsx --maxWorkers=2`
2. `pnpm test src/main/dart/dart-transport-parity.test.ts --maxWorkers=2`
3. `pnpm -C mobile test src/tasks/mobile-task-provider-visibility.test.ts`
4. Every release A test file: `pnpm test src/main/dart src/shared/dart src/shared/rpc-contract src/main/runtime/rpc/methods/dart-saved-view-state.test.ts src/main/persistence/applying-settings/persistence-dart-saved-views.test.ts src/renderer/src/web/preload-api src/renderer/src/store/slices/dart src/renderer/src/runtime src/renderer/src/lib/dart-board-drag-payload.test.ts src/renderer/src/components/task-page/dart src/renderer/src/components/task-page/TaskPage.dart.delivery.test.tsx --maxWorkers=2`
5. `pnpm check:changed`, `pnpm lint`, `pnpm verify:renderer-boot-graph`, `pnpm lint:design-system`
6. `pnpm fixtures:shot <id> --theme both` for `task-page/dart/Filters:wide` and every `task-page/dart/DartBoard` export, plus hidden-renderer screenshots (`ORCA_BACKGROUND_LAUNCH=1`, CDP, never stealing focus) of list and board, light and dark.

A failure goes back as a fix round to its owner (A1 host and RPC, A2 saved-view storage, A3 store and cache, A4 pure rules, A5 page state and header, A6 board and focus); a phase 2 file is reported to the orchestrator. The report ends with Rohit's release A test list: C2, C3, C6, C7 (section "Live checks"), each with its failure disposition.

### B1. Host and contract for relationships

Goal: the host reads subtasks, ids and relationships and replaces a task's blockers, behind `dart.relationships.v1` (G6, G7, G8). Mockup: none. The first commit may land before L6 and L7 are answered; the second commit waits for both (its `updateTaskBlockers` follows L7's outcome).

Files owned:

1. `src/shared/rpc-contract/dart-params.ts`: `parentId` (a non-empty Dart id) and `ids` (1 to 100 Dart ids, sent comma-joined) in `ListTasks` and `DART_TASK_LIST_QUERY_PARAMS` (`parentId → parent_id`, `ids → ids`); `dart.updateTaskBlockers` in `DART_METHOD_NAMES`, `DART_METHOD_PERMISSIONS` (`workspace`), `DART_UNVERIFIED_WRITE_METHODS`, schema `UpdateTaskBlockers { taskId, blockerIds }` (D15.2) and `DartMethodContract`.
2. `src/shared/dart/dart-types.ts`: `DartTaskRelationships = { subtaskIds, blockerIds, blockingIds, duplicateIds, relatedIds }` as `string[]`; `relationships?: DartTaskRelationships` on `DartTask`; `relationships?: boolean` on `DartHostFeatures`, optional so release A's builders of that type (`dartBoardFeaturesForTarget`'s all-false object, the bridge, the web probe, the fake host) compile unchanged; absent means `false`.
3. `src/shared/dart/dart-capabilities.ts` (`DART_RELATIONSHIPS_RUNTIME_CAPABILITY = 'dart.relationships.v1'`) and `src/shared/task-source-runtime-capabilities.ts` (the advertisement: an import line plus an array entry).
4. `src/main/dart/dart-tasks.ts`: the two query keys; new `updateTaskBlockers` (D15, the L7 outcome only).
5. `src/main/dart/dart-task-mapping.ts`: `mapDartTask` maps `taskRelationships` when present (each list through the id pattern; `null` object or `null` list becomes empty lists); an item without the field gets no `relationships` key.
6. `src/main/dart/dart-failure.ts`: operation `relationships` in `DartOperation`, `OPERATION_FAILURE` ("Could not update blockers."), `TASK_TARGETED`, `WRITE_OPERATIONS` and the `DartWriteOperation` union.
7. `src/main/runtime/runtime-dart-commands.ts`, `src/main/runtime/rpc/methods/dart.ts`, `src/main/ipc/dart/register-handlers.ts`, `src/preload/api/dart-bridge.ts` (`supportedDartFeatures` adds `relationships: true`), `src/preload/api-types.ts`, `src/renderer/src/web/preload-api/web-dart-api.ts` (the method and the probe's `relationships` flag).
8. `src/shared/rpc-contract/rpc-params-catalog.generated.ts`, regenerated.
9. Tests (additions): `src/main/dart/dart-tasks.test.ts`, `src/main/dart/dart-failure.test.ts`, `src/shared/rpc-contract/dart-params.test.ts`, `src/main/dart/dart-transport-parity.test.ts`, `src/renderer/src/web/preload-api/web-dart-api.test.ts`.

Steps:

1. First commit: item 2 only; it may land before L6 and L7, must pass `pnpm tc` on its own, and merges at once.
2. After L6 and L7 are answered: everything else, with the advertisement (import line and array entry), in one commit.

Accept:

1. `parentId: <id>` sends `parent_id=<id>`; an empty `parentId` is refused; `ids` is joined, and 101 ids are refused.
2. `taskRelationships` on `getTask` and on list items: present (mapped, bad ids dropped), `null` (five empty lists), absent (no `relationships` key).
3. `updateTaskBlockers`, L7 outcome 1: the `PUT` carries only `{ id, taskRelationships: { blockerIds } }`. L7 outcome 2: the `PUT`'s other four lists equal the raw fresh read (an id that fails the pattern is sent back unchanged, an omitted list stays omitted); a raw `null` gives a `PUT` with only `blockerIds`; a missing field or a non-object value sends nothing (`notApplied`); a failed pre-read sends no `PUT`.
4. A dropped connection after the `PUT` is `unknown`; a 404 is `dart.taskNotFound` with `notApplied`; a self-block and 101 ids are refused before any request.
5. IPC, RPC and web replies are equal.

Test command: `pnpm test src/main/dart src/shared/rpc-contract/dart-params.test.ts src/renderer/src/web/preload-api/web-dart-api.test.ts --maxWorkers=2`; then `pnpm verify:rpc-params-catalog`, `pnpm tc`, `pnpm exec oxlint <changed files>`.

### B2. Renderer client, store and contract additions for relationships

Goal: the renderer reads subtasks, ids, search results and (L6 outcome 2) on-hold relationships through the store, writes blockers through phase 2's queue, and freezes release B's contract additions (G6, G7). Mockup: none.

B2.0 (own commit, merges first, written after L6 and L7 are answered): additions to `src/renderer/src/components/task-page/dart/dart-board-contracts.ts` and to the types in `src/shared/dart/dart-saved-views.ts` (the two optional fields below, so B3 and B4 compile against them in parallel), nothing renamed or removed. Every field or option added to a type that release A code already builds or reads is optional, with the default named below, so release A code compiles and runs unchanged until its release B owner fills the fields: B3 for A4's `buildDartCardInfo` and `buildDartBoardColumns`; B4 for A5's `use-dart-board-model.ts` and `use-task-page-dart-saved-views.ts`; B2 for A3's `runtime-dart-client.ts`, the fake host and A2's `src/shared/rpc-contract/dart-saved-view-params.ts`. A5's `task-page-dart-list-model.ts` needs no release B edit (`blockedOnHold` absent = `false`, and `DartClientFilters` picks it up by `Omit`). B2.0 must pass `pnpm tc` on its own commit.

```ts
type DartRelationshipState = 'known' | 'loading' | 'error' | 'notChecked'
// DartCardInfo gains (all optional; absent = release A card: no marker, no subtask count;
// B3's buildDartCardInfo sets all four on a relationships host):
//   relationshipState?: DartRelationshipState
//   blockedBy?: number | null; blocking?: number | null
//   subtasks?: { loaded: number; total: number | null } | null
// DartBoardModel gains (L6 outcome 2 only, optional; absent = 0 and no "Check" button): notChecked?: number; checkMore?(): void
type DartNestedListRow = { task: DartTask; depth: 0 | 1; parentId: string | null }
type DartNestedListModel = {
  rows: readonly DartNestedListRow[]
  nested: boolean // false while flat (D13.2)
  hiddenSubtasks: number
  expanded: ReadonlySet<string>
  toggle(taskId: string): void
  canExpand(task: DartTask): boolean
  children(
    taskId: string
  ): DartLoad<{ tasks: readonly DartTask[]; total: number; complete: boolean }>
  cardInfo(taskId: string): DartCardInfo
}
// TaskPageDartTaskList props gain: nested?: DartNestedListModel  (absent = flat, as release A)
type DartOpenTask = (task: DartTask, sourceContext?: TaskSourceContext | null) => void
type DartRelationshipsApi = {
  task: DartTask
  state: DartRelationshipState
  parent: DartLoad<DartTask> | null // null when the task has no parentId
  blockers: DartLoad<readonly DartTask[]>
  blocking: DartLoad<readonly DartTask[]>
  subtasks: DartLoad<{ tasks: readonly DartTask[]; total: number; complete: boolean }>
  onSetBlockers(ids: readonly string[]): Promise<DartWriteResult<{ task: DartTask }>>
  pending: boolean
  blocked: boolean // field `relationships` in phase 2's pendingFields / blockedFields
  notice: DartNoticeApi
  searchTasks(
    text: string,
    options?: { thisDartboardOnly?: boolean }
  ): Promise<DartClientResult<{ tasks: readonly DartTask[] }>>
}
// useDartTaskRelationships(args: { task: DartTask | null; sourceContext: TaskSourceContext | null;
//   config: DartWorkspaceConfig | null }): DartRelationshipsApi | undefined  (no viewer id: D2.10)
//   (undefined when there is no task or the host lacks dart.relationships.v1: sections hidden)
// L6 outcome 2 only:
// type DartRelationshipCacheEntry = { state: DartRelationshipState; relationships: DartTaskRelationships | null; fetchedAt: number; error: string | null }
// Selector additions (B3 implements):
// buildDartTaskTree(tasks, children: ReadonlyMap<string, readonly DartTask[]>, opts: { nested: boolean }): { rows: readonly DartNestedListRow[]; hiddenSubtasks: number }
// buildDartBoardColumns opts gain nested?: boolean (absent = false; true leaves out every task with a parentId)
// buildDartCardInfo(task, relationships?: DartRelationshipCacheEntry, loadedChildren?: readonly DartTask[])
// applyDartBoardFilters(tasks, filters, relationships?: ReadonlyMap<string, DartRelationshipCacheEntry>)  // keyed by task id
```

In the same B2.0 commit, `DartBoardFilters` gains `blockedOnHold?: boolean` (absent = `false`) and `DartSavedView` gains `nestSubtasks?: boolean` (absent = `true`), both in `src/shared/dart/dart-saved-views.ts` (types only), optional in the type and in storage, so A5's default filters and saved-view objects compile without them.

Store signatures (in `src/renderer/src/store/slices/dart/dart-slice-contract.ts`):

1. `readDartSubtasks(parentId: string, options?: DartReadOptions): Promise<DartClientResult<{ tasks: DartTask[]; total: number }>>`: stores the children entry (D13.4).
2. `readDartTasksByIds(ids: readonly string[], options?: DartReadOptions): Promise<DartClientResult<{ tasks: DartTask[]; total: number; complete: boolean }>>`: 100 ids per read, at most 3 reads, not cached.
3. `searchDartTasks(text: string, options: { sourceContext?: TaskSourceContext | null; dartboard?: string }): Promise<DartClientResult<{ tasks: DartTask[] }>>`: D15.7, not cached.
4. `setDartTaskBlockers(taskId: string, blockerIds: readonly string[], options?: DartWriteOptions): Promise<DartWriteResult<{ task: DartTask }>>`: a plain write action like `updateDartTask`; the hooks enqueue it.
5. L6 outcome 2 only: `readDartOnHoldRelationships(taskIds: readonly string[]): Promise<void>` (default scope, sequential, at most 20) and state `dartRelationshipCache: Record<string, DartRelationshipCacheEntry>`.

Files owned (after B2.0):

1. `src/shared/dart/dart-saved-views.ts` and `src/shared/dart/dart-saved-views.test.ts`: normalize keeps the two optional fields (B2.0 added their types) and treats an absent one as its default. `src/shared/rpc-contract/dart-saved-view-params.ts`: both fields as optional booleans in the stripping schema, so a release B client's view keeps them on a release B host; additions to `src/main/runtime/rpc/methods/dart-saved-view-state.test.ts` for a save that carries them and one that omits them.
2. `src/renderer/src/runtime/runtime-dart-client.ts`: `parentId` and `ids` pass through; features gain `relationships`.
3. `src/renderer/src/runtime/runtime-dart-write-client.ts`: `dartUpdateTaskBlockersForTarget`, refusing with `notApplied` without the capability.
4. `src/renderer/src/store/slices/dart/dart-slice-contract.ts`, `src/renderer/src/store/slices/dart/dart.ts`, `src/renderer/src/store/slices/dart/dart-read-actions.ts`, `src/renderer/src/store/slices/dart/dart-write-actions.ts`.
5. `src/renderer/src/store/slices/dart/dart-read-coordination.ts`: children keys in the eviction `keep` set; L6 outcome 2: `dartRelationshipCache` in `EMPTY_DART_READ_CACHES`.
6. `src/renderer/src/store/slices/dart/dart-fake-runtime.test-support.ts`: `parent_id`, `ids`, `taskRelationships` (on list items only under L6 outcome 1), `dart.updateTaskBlockers` with L7's observed behaviour, capability flag `relationships`.
7. `src/renderer/src/components/task-page/dart-delivery-transports.test-support.tsx`: `open(...)` option `relationships`; under L6 outcome 2, the reset also empties `dartRelationshipCache`.
8. `src/renderer/src/components/task-page/dart/dart-task-write-state.ts`: `relationships` added to `EDITABLE_DART_TASK_FIELDS`, nothing else.
9. Tests: new `src/renderer/src/store/slices/dart/dart-relationship-reads.test.ts`, new `src/renderer/src/components/task-page/dart/dart-blocker-write-queue.test.ts`, additions to `src/renderer/src/runtime/runtime-dart-write-client.test.ts` and `src/renderer/src/runtime/runtime-dart-client.test.ts`. Phase 2's `src/renderer/src/components/task-page/dart/dart-task-write-queue.test.ts` is run, not edited.

Accept:

1. A child read by `readDartSubtasks` is stored only under its `list::children::` key, and `patchDartTask` updates it.
2. `readDartTasksByIds` with 250 ids sends 3 requests of at most 100; with 350 it stops at 3 and reports `complete: false`.
3. `searchDartTasks` sends `title`, `isCompleted: false`, `limit: 25`, and `dartboard` only when given; it writes no cache.
4. A host without `dart.relationships.v1` gets no `parentId`, `ids` or blocker request; the blocker client returns `notApplied` with nothing sent.
5. With the real phase 2 queue: a pending blocker write marks `relationships` pending; a status write on the same task stays independent; the detail's existing field edits behave as before (phase 2's queue tests pass unchanged).
6. L6 outcome 2: on-hold reads stop at 20, never run for other tasks, report the rest as `notChecked`; the cache is keyed by `dartTaskIdentityKey`; connect and disconnect empty it.

Test command: `pnpm test src/renderer/src/store/slices/dart src/renderer/src/runtime src/renderer/src/components/task-page/dart/dart-task-write-queue.test.ts src/renderer/src/components/task-page/dart/dart-blocker-write-queue.test.ts src/shared/dart/dart-saved-views.test.ts src/main/runtime/rpc/methods/dart-saved-view-state.test.ts --maxWorkers=2`; then `pnpm verify:rpc-params-catalog`, `pnpm tc`, `pnpm exec oxlint <changed files>`.

### B3. Pure model for subtasks and blockers

Goal: pure, tested rules for the subtask tree, flat rendering, blocker card info and the blocked filter (G6, G7). Mockup: `P3-List.dc.html` (tree).

Files owned:

1. `src/renderer/src/components/task-page/dart/dart-task-tree.ts` (new) and `src/renderer/src/components/task-page/dart/dart-task-tree.test.ts` (new): `buildDartTaskTree`.
2. `src/renderer/src/components/task-page/dart/dart-board-columns.ts` and its test: the B2.0 selector additions.

Accept (unit tests, no React):

1. `nested: true`: a subtask whose parent is loaded is never top level; one whose parent is not loaded is left out and counted in `hiddenSubtasks`; a child present only in the children map shows under its parent; duplicate ids keep the newer `updatedAt`.
2. A three-level hierarchy puts the grandchild at depth 1 under its top-level ancestor, after the direct children; a `parentId` cycle terminates.
3. `nested: false`: every task is a depth-0 row and `hiddenSubtasks` is 0; columns keep every task as its own card.
4. `buildDartBoardColumns` with `nested: true` leaves out every task with a `parentId`; the parent's card info counts its loaded subtasks.
5. `buildDartCardInfo` covers blocked, blocking, both, not checked and error.
6. `blockedOnHold` keeps on-hold tasks with a blocker and not-checked on-hold tasks, and drops on-hold tasks known to have no blocker.

Test command: `pnpm test src/renderer/src/components/task-page/dart/dart-task-tree.test.ts src/renderer/src/components/task-page/dart/dart-board-columns.test.ts --maxWorkers=2`; then `pnpm tc`, `pnpm exec oxlint <changed files>`.

### B4. Tab state for subtasks and blockers

Goal: nesting and flat rules, the "Blocked (on hold)" chip, the nested list model, card info with relationships, and detail navigation that keeps the detail's host (G6, G7). Mockup: `P3-Board.dc.html` and `P3-List.dc.html`, header rows.

Files owned:

1. `src/renderer/src/components/task-page/dart/use-task-page-dart-state.ts`: effective nesting (D13.1, D13.2); L6 outcome 2: `readDartOnHoldRelationships` after each publish.
2. `src/renderer/src/components/task-page/dart/Filters.tsx`: "Blocked (on hold)" chip, "Show subtasks nested".
3. `src/renderer/src/components/dart-view-mode-storage.ts`: `nestSubtasks`. `src/renderer/src/components/task-page/dart/use-task-page-dart-saved-views.ts`: "Save" and "Save as new" store `nestSubtasks` and `filters.blockedOnHold`; applying a view restores them (absent = `true` and `false`); a change to either shows the view as modified.
4. `src/renderer/src/components/task-page/dart/use-dart-board-model.ts`: card info with relationships and subtask counts; L6 outcome 2: `notChecked` and `checkMore`.
5. `src/renderer/src/components/task-page/dart/use-dart-nested-list-model.ts` (new): `useDartNestedListModel(...)` returning `DartNestedListModel` (expanded ids, toggle, children loads via `readDartSubtasks`).
6. `src/renderer/src/components/task-page/dart/Content.tsx` hunk P3-B.
7. `src/renderer/src/components/task-page/dart/TaskList.tsx`: the `nested` prop as a placeholder that renders `rows` flat; B5 takes it over.
8. `src/renderer/src/components/task-page/dart/use-task-page-dart-detail-routing.ts`: `openDartDetailPage(task, sourceContext?)` stores a given context as `openDartSourceContext` instead of `dartTaskSourceContext`.
9. `src/renderer/src/components/task-page/dart/TaskDetail.tsx`: the optional prop `onOpenTask?: DartOpenTask`, passed from `src/renderer/src/components/task-page/dart/Content.tsx`; nothing else.
10. `src/renderer/src/components/task-page/dart/dart-task.mock.ts`: subtasks, a three-level hierarchy, on-hold tasks with relationships. B5 and B6 only import it.
11. Tests: additions to `src/renderer/src/components/task-page/dart/use-task-page-dart-state.test.tsx`, `src/renderer/src/components/task-page/dart/use-dart-board-model.test.tsx`, `src/renderer/src/components/task-page/dart/Filters.test.tsx`, `src/renderer/src/components/task-page/dart/use-task-page-dart-saved-views.test.tsx`; new `src/renderer/src/components/task-page/dart/use-dart-nested-list-model.test.tsx`, `src/renderer/src/components/task-page/dart/use-task-page-dart-detail-routing.test.ts`.

Accept:

1. With no filter, a subtask with a loaded parent is not a top-level row; a search for its title shows it as a flat row; turning on any client filter renders flat.
2. The count line adds the D13.1 hidden-subtask text with the right singular form.
3. Expanding reads children once (cached) and shows a spinner after 200 ms; a failed read exposes `retry`.
4. The "Blocked (on hold)" chip sends no request.
5. L6 outcome 2: after a publish, on-hold reads start; "Check" reads the next 20.
6. Opening a blocker from a detail on host B keeps host B's scope.
7. A board host without `dart.relationships.v1` renders exactly as release A.
8. A saved view keeps `nestSubtasks` and `blockedOnHold` through save and apply; a release A view without them applies as nested on and the chip off.

Test command: `pnpm test src/renderer/src/components/task-page/dart/use-task-page-dart-state.test.tsx src/renderer/src/components/task-page/dart/use-dart-board-model.test.tsx src/renderer/src/components/task-page/dart/Filters.test.tsx src/renderer/src/components/task-page/dart/use-dart-nested-list-model.test.tsx src/renderer/src/components/task-page/dart/use-task-page-dart-detail-routing.test.ts src/renderer/src/components/task-page/dart/use-task-page-dart-saved-views.test.tsx --maxWorkers=2`; then `pnpm tc`, `pnpm exec oxlint <changed files>`.

### B5. Nested list and card markers

Goal: subtasks under their parent in the list, blocker markers on cards and rows (G6, G7). Mockup: `P3-List.dc.html`, `P3-Board.dc.html`.

Files owned:

1. `src/renderer/src/components/task-page/dart/TaskList.tsx` (takes over B4's placeholder): expand button, indent, count badge, blocker markers, tags column.
2. `src/renderer/src/components/task-page/dart/DartBoardCard.tsx`: subtask count and blocker marker (D14.1), "Blockers not checked" text.
3. Fixtures: `src/renderer/src/components/task-page/dart/TaskList.fixture.tsx` new export `nested`; `src/renderer/src/components/task-page/dart/DartBoard.fixture.tsx` new exports `blockers` and, under L6 outcome 2, `not-checked`.
4. Tests: new `src/renderer/src/components/task-page/dart/TaskList.nested.test.tsx`, additions to `src/renderer/src/components/task-page/dart/DartBoard.test.tsx`.

Steps:

1. The row stays one focusable open control; the expand toggle is a separate `button` named "Expand subtasks of <title>", with `aria-expanded` and `aria-controls` pointing at the child group. Collapsing while focus is inside a child moves focus to the parent row. Right and Left expand and collapse the focused row (Right only when it can expand); Enter opens.

Accept:

1. A loaded child appears only under its parent; a child fetched on expand that is absent from the scope shows under its parent, not at the top level; a grandchild shows at depth 1 with no expand button; a failed child read shows an inline "Retry" under the parent that calls the model's `retry`.
2. The badge reads "3 loaded" until all children are read, then "N of M done"; over 250 the block ends with "Showing 250 of N subtasks · Open in Dart".
3. Collapse keeps scroll; the keyboard rules above hold.
4. A blocked card shows the icon with "Blocked by N" as its accessible label; a card with both counts shows both; on a relationships host a card with no links data shows "Blockers not checked" (D14.2, D14.3; L6 outcome 2: on-hold cards only).

Test command: `pnpm test src/renderer/src/components/task-page/dart/TaskList.nested.test.tsx src/renderer/src/components/task-page/dart/DartBoard.test.tsx --maxWorkers=2`; then `pnpm tc`, `pnpm exec oxlint <changed files>`, `pnpm fixtures:shot task-page/dart/TaskList:nested --theme both` and the new `task-page/dart/DartBoard` exports.

### B6. Detail: relationships and subtasks

Goal: the detail shows Parent, "Blocked by", "Blocking" and Subtasks, and edits "Blocked by" (G6, G7). Mockup: `P3-Relationships.dc.html`.

Files owned:

1. `src/renderer/src/components/task-page/dart/use-dart-task-relationships.ts` (new): implements the B2.0 signature in the detail's own scope, exactly as phase 2's detail hook does for `DartDetailEditApi`: relationships from the detail's `getTask` read, related titles from `readDartTasksByIds`, writes through `enqueueDartTaskWrite` with `write` = `setDartTaskBlockers`, `fields: ['relationships']`, `refresh: () => fetchDartTask(taskId, { sourceContext, force: true })`, `patch: (p) => patchDartTask(identity, p)` (and, under L6 outcome 2, the relationship cache), `invalidateLists: () => invalidateDartLists(identity)`; the capability probe on mount, as `useDartDetailMetadata` does.
2. `src/renderer/src/components/task-page/dart/TaskDetailRelationships.tsx`, `src/renderer/src/components/task-page/dart/TaskDetailSubtasks.tsx`, `src/renderer/src/components/task-page/dart/DartBlockerPicker.tsx` (new).
3. `src/renderer/src/components/task-page/dart/TaskDetail.tsx`: one hook call, passing `relationships` and `onOpenRelatedTask = (t) => onOpenTask?.(t, sourceContext)` down.
4. `src/renderer/src/components/task-page/dart/TaskDetailView.tsx`: props `relationships?: DartRelationshipsApi` and `onOpenRelatedTask?: (task: DartTask) => void` (absent = sections hidden, so phase 2 fixtures compile) and one mount line after the properties section.
5. Fixtures (new): `src/renderer/src/components/task-page/dart/TaskDetailRelationships.fixture.tsx` exports `default`, `on-hold`; `src/renderer/src/components/task-page/dart/TaskDetailSubtasks.fixture.tsx` exports `default`, `truncated`.
6. Tests (new): `src/renderer/src/components/task-page/dart/TaskDetailRelationships.test.tsx`, `src/renderer/src/components/task-page/dart/TaskDetailSubtasks.test.tsx`, `src/renderer/src/components/task-page/dart/DartBlockerPicker.test.tsx`, `src/renderer/src/components/task-page/dart/use-dart-task-relationships.test.tsx`.

Steps:

1. Relationships: Parent (a link that opens it); "Blocked by" list with status and a remove button per blocker; "+ Add blocker"; "Blocking" read-only with "change it on that task". On-hold banner when `isDartTaskOnHold` and open blockers exist: "On hold · waiting on N open blockers" (one: "waiting on 1 open blocker").
2. `src/renderer/src/components/task-page/dart/DartBlockerPicker.tsx` uses `WorkItemScopePicker`'s chrome (shadcn Popover + Command, `shouldFilter={false}`) without editing it: `searchTasks(text, { thisDartboardOnly })` debounced 300 ms; a spinner after 200 ms; "No matching tasks"; an error line with "Retry"; a reply for an older query is dropped (a request counter; flipping "This dartboard only" counts as a new query); Up, Down and Enter select; Escape closes with focus back on "+ Add blocker"; the task itself and current blockers are not offered. The hook sends the detail task's dartboard only when "This dartboard only" is on.
3. Subtasks: the list from `relationships.subtaskIds`, "N of M done", click opens the subtask, D13.6 truncation, and "Adding subtasks from Orca comes later."
4. A task with no `relationships` key (no links data) on a relationships host shows "Dart did not return this task's links" in place of both sections (D14.1).

Accept:

1. Add and remove call `onSetBlockers` once with the full new list; the change is optimistic; a refusal rolls back with the message; `unknown` shows the notice.
2. The picker offers neither the task itself nor current blockers; its default search sends no dartboard and "This dartboard only" sends the detail task's dartboard; flipping the toggle while a search is in flight drops that reply and shows the new mode's results.
3. Scope isolation: a detail opened from host B searches and writes on host B.
4. With no task, or a host without `dart.relationships.v1`, the hook returns `undefined` and no section renders (blockers are missing, not read-only, D1.5); on a relationships host, a `getTask` reply with no `relationships` key shows "Dart did not return this task's links" and neither section.

Test command: `pnpm test src/renderer/src/components/task-page/dart/TaskDetailRelationships.test.tsx src/renderer/src/components/task-page/dart/TaskDetailSubtasks.test.tsx src/renderer/src/components/task-page/dart/DartBlockerPicker.test.tsx src/renderer/src/components/task-page/dart/use-dart-task-relationships.test.tsx --maxWorkers=2`; then `pnpm tc`, `pnpm exec oxlint <changed files>`, `pnpm fixtures:shot <id> --theme both` for each new export.

### B7. Release B checks and Rohit's test list

Goal: prove release B end to end on every transport and host version, and hand Rohit his release B test list (G8). Mockup: all three P3 artboards, for screenshot comparison.

Files owned (tests and docs only): additions to `src/renderer/src/components/task-page/TaskPage.dart-board.test.tsx` and `src/main/dart/dart-transport-parity.test.ts`.

Accept (same assertion rules as A7):

1. Delivery: blocker add and remove; expand and nested list; search for a subtask title shows it flat.
2. Races: a stale blocker search reply is dropped; a status write and a blocker write on one task at once.
3. A release A host (no `dart.relationships.v1`) behind a release B client renders release A's board and list and sends no new key.
4. Host and account isolation for blocker writes; the web client probes `relationships`.
5. L6 outcome 2: the 20-read cap and "Check" through the real renderer.
6. Screenshot review as A7, for the nested list and the detail sections.

Test commands, each run separately:

1. `pnpm test src/renderer/src/components/task-page/TaskPage.dart-board.test.tsx --maxWorkers=2`
2. `pnpm test src/main/dart/dart-transport-parity.test.ts --maxWorkers=2`
3. The A7 command 4 (every phase 3 test file; it already covers the release B files by folder)
4. `pnpm check:changed`, `pnpm lint`, `pnpm verify:renderer-boot-graph`, `pnpm lint:design-system`
5. `pnpm fixtures:shot <id> --theme both` for `task-page/dart/TaskList:nested`, the release B `task-page/dart/DartBoard` exports, `task-page/dart/TaskDetailRelationships:default`, `task-page/dart/TaskDetailSubtasks:default`, plus hidden-renderer screenshots of the nested list and the detail, light and dark.

A failure goes back as a fix round to its owner (B1 host, B2 store and queue, B3 pure rules, B4 page state, B5 nested list and cards, B6 detail and picker). The report ends with Rohit's release B test list: C1, C4, C5, each with its failure disposition.

## Live checks

All are Rohit's own, on his account; the orchestrator prepares any command, and nothing with real data goes into the repo. L1 to L5 were answered during phase 2's test (2026-11-06 and 2026-11-07); their answers are D6 (L1), D13 (L2), D7 (L3), D8 (L4) and D14.1 (L5).

### Before release B (may run while release A is built)

1. L6, relationships on list items. Rohit runs one read-only `GET /tasks/list` on a dartboard that has a task with a blocker and reports whether list items carry `taskRelationships` with that blocker. In the same read he also inspects one task that has no links and reports whether its list item carries `taskRelationships` with empty lists or omits the field (D14.2: under outcome 1 an item without it shows "Blockers not checked"). Orca's own CLI cannot answer it, because `mapDartTask` drops the field. Yes: D14 outcome 1. No: D14 outcome 2.
2. L7, partial relationship write. On a throwaway task with at least one subtask and one related link, Rohit sends `PUT /tasks/{id}` with `{ item: { id, taskRelationships: { blockerIds: [<one id>] } } }` only, reads the task back, and reports whether `subtaskIds`, `blockingIds`, `duplicateIds` and `relatedIds` survived. Survived: D15 outcome 1. Wiped or changed: D15 outcome 2.

### Rohit's test of release A

1. C2: a Cancelled-kind status counts as completed for `is_completed`. If not, cancelled tasks show among open tasks in their own column, count against the 1,000 cap and in "N open"; Rohit accepted this in advance (2026-11-07, D2.6): it is recorded, with no fix round.
2. C3: the open cards of one column appear in the same order as on the dartai board. A mismatch is a fix round in A3 and A4 trying `dartboard__order`. Where finished cards sit is recorded only.
3. C6: on the 593-task dartboard, the open count matches dartai and no card repeats; scroll and drag stay smooth with every card loaded; note how often "Tasks changed while loading" shows. A count mismatch or duplicate is a fix round in A3; slowness is a fix round in A6 that virtualizes per column (pattern: `WorkspaceKanbanLaneCardList.tsx`, "What exists" 14); a frequent stale message goes to Rohit as a follow-up decision.
4. C7: for two dartboards each under 1,000 open tasks, with no filter and "Show empty columns" off, every Orca column has a task and every status with a task on dartai's board has a column; record any empty dartai status Orca omits and, with the option on, the extra workspace statuses. A missing column for a status that has tasks is a fix round in A4; the recorded differences are expected (D6.4).

### Rohit's test of release B

1. C1: `parent_id` returns exactly the direct subtasks. A mismatch is a fix round in B1 and B2.
2. C4: blocker markers appear where L6 predicts (every blocked card under outcome 1, on-hold cards under outcome 2). A mismatch is a fix round in B2 and B3.
3. C5: blocker add and remove on a throwaway task leave the other four relationship lists unchanged, and dartai shows the matching "Blocking" on the other task. A changed list is a fix round that makes blockers read-only with "Open in Dart".

## Run sheet

Routes (Rohit, 2026-11-07; used exactly). Each build lane is a Claude Code session in an Orca terminal on its own worktree on Orca Ubu 7of9, started with `claude --model <m> --effort <lvl>`; at most three lanes run at once.

| Task | Model  | Effort |
| ---- | ------ | ------ |
| A1   | Sonnet | medium |
| A2   | Sonnet | medium |
| A3   | Sonnet | high   |
| A4   | Sonnet | medium |
| A5   | Sonnet | high   |
| A6   | Sonnet | medium |
| A7   | Sonnet | medium |
| B1   | Sonnet | medium |
| B2   | Sonnet | high   |
| B3   | Sonnet | medium |
| B4   | Sonnet | high   |
| B5   | Sonnet | medium |
| B6   | Sonnet | high   |
| B7   | Sonnet | medium |

High effort goes to the lanes with the most state and concurrency risk: store, cache and epochs (A3, B2), page state and model hooks (A5, B4), the blocker write path and scoped detail (B6).

| Role                  | Agent  | Model                 | Where                 |
| --------------------- | ------ | --------------------- | --------------------- |
| Orchestrator          | Claude | Opus, medium          | Mac session           |
| Integration           | Claude | Sonnet, medium        | Ubuntu main checkout  |
| Lane reviews          | OMP    | OMP default           | lane worktree, Ubuntu |
| Final review          | AGY    | gemini-3.8-flash-high | integration, Ubuntu   |
| Quick read-only check | OMP    | OMP default           | where the code is     |

1. OMP is the coding agent installed on Orca Ubu 7of9 (18.16.0); AGY is the Antigravity agent (Orca agent id `antigravity`). Each review is a separate read-only pane on the exact commit, re-runs the lane's test command, reports over the Orca bus and never edits. Each release gets its own lane reviews and final review.
2. Fix rounds reuse the lane's Claude session at its effort. A failed round is diagnosed first (brief gap, scope too big, or capability miss); a capability miss raises the lane's Sonnet effort from medium to high with Rohit's yes, never the model.
3. A review that cannot run (OMP or AGY unavailable, sign-in or model error) is reported to the orchestrator as a blocker, not swapped for a Claude reviewer without Rohit's go. These routes win over any default that asks for Opus on data-loss or security reviews. Builders and reviewers never route.
4. Before the first lane review: check OMP on the server (`omp --version` in an Orca terminal there).
5. Before the final review: AGY on Orca Ubu 7of9 was 1.4.7 and not signed in on 2026-11-07 (`agy models` asks for sign-in). Rohit signs it in on the server (interactive `agy` with no arguments), it is updated to a version listing `gemini-3.8-flash-high`, and the orchestrator checks `agy models` there.
6. Before each release's final merge, the orchestrator runs `git merge-tree` against upstream `main` for the shared files (`src/shared/rpc-contract/dart-params.ts`, `src/shared/dart/dart-types.ts`, the capability files, `src/shared/persisted-ui-state-types.ts`, `src/shared/wsl-move/wsl-move-ui-dispositions.ts`, `src/main/ipc/ui.ts`, `src/main/runtime/rpc/methods/client-ui.ts`, preload types, `src/renderer/src/web/preload-api/web-ui-api.ts`, the catalog).

## Approval gates and data handling

Same as phase 2: no push, PR or merge without Rohit's go; no Dart calls by workers, reviewers or the orchestrator; the token is never typed, logged or committed; fixtures and screenshots carry no real names, ids or workspace data; plan files go to `Interstellar-code/orca` only. Live calls happen only in Rohit's own checks: L6 (read-only), L7 and C5 (writes on a throwaway task), and his tests of each release.

## Open items and risks

Open items (unverified; none were guessed):

1. Everything about the Dart API here comes from the OpenAPI schema (2026-11-04) and phase 2's live test; L6, L7 and the C checks settle the rest.
2. Rate limits are unknown (no header ever seen). The budget in D2.12 is the real worst case.
3. The `/config` status order is assumed to be dartai's column order; C7 shows whether it matches (C3 covers card order inside a column).
4. The fork's "Mobile verify" CI failed on `main` on 2026-11-06 (`setTaskListSettled is not a function` in `mobile/src/tasks/use-mobile-tasks-deferred-provider-load.test.ts`), unrelated to Dart; it is fixed separately on `main` before the release A PR and is not a phase 3 failure. Not re-checked on the current `main`.
5. Follow-up after phase 3: `readLinkedDartTasks` could use one `listTasks({ ids })` per 100 ids instead of one `getTask` per linked task, and its comment "Dart has no id-list query" is wrong once B1 adds `ids`. Not changed in phase 3; no lane fixes it.

Risks:

1. Rate limits: up to 15 list reads per refresh, plus 20 task reads under D14 outcome 2. A 429 stops cleanly and keeps the rows on screen (D4.5).
2. Lost blocker links under D15 outcome 2 (whole-list write with no precondition). C5 is the first proof.
3. Frequent "Tasks changed while loading" if writes and refreshes overlap, because the epoch is per host (D4.6). C6 watches it.
4. Client filters see only the first 1,000 open tasks in a larger scope; the count line says so (D2.11).
5. Board files are Dart copies of Jira's pattern (rule 13); keep them small and Dart-typed. Shared-file edits are checked with `git merge-tree` before each final merge (run sheet item 6).
6. A5 is the longest release A lane (14 owned items) and the one serial bottleneck. Its saved-views hook and UI (items 5, 6 and the saved-view part of 13) could become a parallel lane; that needs a route from Rohit, so it is not split here.

## Delivery record (2026-11-12)

1. Built: A1-A7 and B1-B7, merged as PR #12 (`b60c0d4dd13`). An Opus read-only review against this plan (2026-11-12) found every task implemented and every specified user-facing string present; no new P1 or P2 bug. Unplanned addition: A4 adds a "no status" column.
2. Review decisions during integration:
   1. F2 is not a bug: a scope with 61 open tasks, 46 nested under parents, shows 16 top-level cards. Subtasks never show as cards (D13).
   2. F6 fixed: the source chip names the paired server (and a user host label wins over the web client's pairing name) and the signed-in Dart account.
3. Known P3s accepted in PR #12: an on-hold marker can read "Blockers not checked" after visiting an overlapping scope until refresh or Check; partial lookup understates the on-hold blocker count; relationship write notices render twice; an empty partial subtask lookup shows both "No subtasks" and "Showing 0 of N"; an obsolete response after three overtaken reads can overwrite the relationship cache; a later field write replaces the blocker cache patch callback; after a failed first child read, retry waits for the next refresh or Retry. A cleanup batch for the detail items and open item 5's comment follows separately.
4. C checks (Rohit): C1-C7 not yet run; C7 partly (card counts only). Detail sections checked on one task only. C6 is the only evidence on board speed: there is no column virtualization yet, by design.
5. Not yet built for Windows or Linux: Fork Release last ran 2026-11-03, before phase 3.
6. Upstream sync: `git merge-tree` shows conflicts in `src/shared/work-items/task-source-runtime-capabilities.ts` and `src/renderer/src/runtime/workspace-links/runtime-workspace-attachment-capabilities.ts`; hand-merge them.
7. Pre-existing gate failures on `main`, not from phase 3: `src/cli/handlers/dart.test.ts:294`, Mobile Checks (open item 4 was never fixed), `verify:skill-bundle-manifest`, `tests/e2e/cross-version-wire`.

## Changelog

Not instructions; history only.

1. 2026-11-04, outline answers (Rohit): Orca's own saved views; open tasks up to 1,000 plus the 50 latest finished; no polling; status-only drag; blocker markers on on-hold cards; only "Blocked by" editable, written on the host. Mockups updated to match.
2. 2026-11-05, OMP review rounds 1 to 5 and Fable 5.1 review 1: raw-row cursors, one cache entry reached by phase 2's patch and invalidation, a global dedupe rule, per-task relationship states, a scoped relationships hook, the async blocker picker, frozen contracts, per-task test commands. Applied as corrections F1-F13 plus in-place edits. Routes first set (Sonnet lanes, Opus orchestrator).
3. 2026-11-06, re-based on merged phase 2 (`5fe2edc1cb3`) and L1, L2: updates U1-U7 (subtasks only under their parent, columns from the dartboard's statuses, real phase 2 locations, `relationships` in the queue's field list, real API facts, mobile CI note, check C7).
4. 2026-11-07, re-based on `6665c9c8d90` (PR #11); L3 to L5 answered (U8 card order, U9 `On hold` status created in dartai, U10 blocker icon); routes changed to today's run sheet; review rounds 6 and 6b; Fable 5.1 final review applied as corrections R1-R16 (`list::` cache keys, one fake host, `readPastDartWrites`, unknown-status columns, queue call shape) and decision D12 (linked mode list-only, pinned rows on top of the store, account reset), confirmed by Rohit.
5. 2026-11-07, five-stage EGM review (zoom-out, comprehension, critic, intermediate zoom-out, implementation readiness; reports in `docs/plans/egm-review-dart-phase-3/`). Rohit accepted all six escalations with the recommended option: two releases (E1); old hosts list-only like linked mode (E2); flat rendering while searching or filtering (E3); saved views keyed by host (E4); live check L6 before release B (E5); live check L7 before release B (E6). The 33 proposed fixes were applied in this single rewrite, which replaced the layered corrections with one Decisions section. Contested and kept: Rohit's review routes, and `order` as the card-order key (C3 tests it, `dartboard__order` is the fallback).
6. 2026-11-07, review of the rewrite (`docs/plans/egm-review-dart-phase-3/rewrite_review.md`): H1 both scope read actions take the viewer from the store; H2 release B's additions to release A types are optional with named defaults and each first commit passes `pnpm tc`; H3 the explicit-scope alias test restored in A3; M1-M7 and L1-L12 applied (pending-drag race, client-filter cursor test, L6 unlinked-task check, rule 11 across releases, "Move to" label, linked-mode truncation notice, list-layout "Show 50 more" owner, and the low items). Rohit approved: "Blockers not checked" on a card with no links data and "Dart did not return this task's links" in the detail; C2's Cancelled outcome accepted with no fix round; blockers missing, not read-only, on a host without `dart.relationships.v1`. Final check: B2 owns `dart-saved-view-params.ts` for the two release B saved-view fields and B4 the saved-views hook; the two optional types move into B2.0; `useDartTaskRelationships` takes no viewer id; B5's "Blockers not checked" is on-hold cards only under L6 outcome 2.

Task id mapping:

| Old | New                                                             |
| --- | --------------------------------------------------------------- |
| B1  | A1 (order, raw, board capability); B1 (relationships, blockers) |
| B2  | A2                                                              |
| B3  | A3 (scope reads); B2 (relationship reads, blocker write)        |
| B4  | A4 (columns, on hold); B3 (tree, blocker info)                  |
| B5  | A5 (header, saved views); B4 (nesting, chip)                    |
| B6  | A6 (board, drag); B5 (card markers)                             |
| B7  | B5 (nested list)                                                |
| B8  | B6                                                              |
| B9  | A7; B7                                                          |

Old live checks: L1 to L5 answered (see "Live checks"); C4 now checks L6's prediction; C8 (a drop into another dartboard's status) was not added, since the reply decides the column (D5.2).

Rejected alternatives:

1. Paging by `created_at` and sorting on the client (paging key equals display key): unverified whether `ConciseTask` exposes an order field; C3 covers order.
2. Keeping good pages after a 429, and `updated_at_after` delta refresh: no 429 seen yet; trigger is the first live 429 or C6.
3. Parent breadcrumbs on orphan subtask hits: replaced by flat rendering (D13.2).
4. Per-id stale marking: it would change phase 2's epoch code.
5. A debounce on the tab's search box and a minimum read interval: that search applies on Enter and reads are user-triggered (the blocker picker's 300 ms debounce is separate).
6. Size-based eviction and a millisecond render budget: about 1,050 tasks is a few MB, and jsdom does no layout; C6 observes instead.
7. C8 as a build gate: replaced by "the reply decides the column".
8. One shared drag-payload module for Jira, Linear and Dart: rule 13's fork-merge exception.
9. Wording nits (history order, "honest", "feel like dartai"): fixed where this rewrite touched the text.
10. Three releases (saved views separate): saved views have no live-API unknowns, so they ride with the board.
11. Degraded board on old hosts, views per Dart account, an account-wide write subscription, capability probes cached once per target: replaced by D1.4, D9.1, D5.3 and D1.3.
12. 2026-11-12, delivery: L6 and L7 answered (D14.5, D15.9), prerequisite 5 closed, status set to built, and the "Delivery record" section added from PR #12 and an Opus review against this plan.
