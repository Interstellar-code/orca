# Plan outline: Dart phase 3, a dartai-style board

Status: OUTLINE (drafted 2026-11-04). To be detailed task by task after phase 2 is accepted; nothing here is ready for a worker prompt yet. Owner: Rohit. Delivery: fork `Interstellar-code/orca`.
Depends on: `docs/plans/dart-phase-2.md` (writes through every transport, the optimistic mutation queue, the field editors). Base commit when drafted: `62c4752fa0f`.

## Goal

Make the Dart tab feel like dartai: columns by status, dartboards and saved views as first-class places to look, subtasks shown nested, a card dragged between columns changes status, and the page stays fresh without a manual refresh.

Done when (draft, to be tightened):

1. G1 — A list/board switch in the Dart tab; the board shows one Kanban column per status, cards for the tasks.
2. G2 — The user picks a dartboard (and, if feasible, a saved view) as the scope of the list or board.
3. G3 — Subtasks (`parentId`) appear nested in the list and in the task detail, with a count on the parent.
4. G4 — Dragging a card to another column changes its status through phase 2's update path, with rollback and a message on refusal.
5. G5 — The visible list or board refreshes by light polling while the tab is open and visible, without losing scroll, selection or an open edit.
6. G6 — On hold is visible: a custom `On hold` status (if the workspace adds one) is its own column; the board filters by a hold tag (e.g. `on-hold`); cards and the detail show blocker links (`blockerIds` / `blockingIds`), and the detail can add or remove a blocker (P3-9).
7. G7 — All repo gates pass; remote hosts, folder workspaces and mixed versions behave; mobile still hides Dart.

Out of scope: reordering inside a column (`move_task`, `POST /tasks/{id}/move` exists but is not used), multiple assignees, custom properties (phase 4), relationships other than blockers (duplicates, related), attachments, time tracking, delete, Docs, Dart on mobile.

## What phase 3 builds on (read on the base)

1. The existing board pattern in this repo, to reuse rather than reinvent: Linear `src/renderer/src/components/task-page/linear/IssueBoard.tsx`, `IssueBoardColumns.tsx` (HTML drag and drop: `draggable`, `onDragStart`, `onDragOver` handlers `handleLinearBoardCardDragStart` / `handleLinearBoardDragOver`) and `use-task-page-linear-board.ts`; Jira `task-page/jira/task-page-jira-board.tsx` and `task-page-jira-board-view.tsx` (move handling `applyJiraBoardMove`, mutation through `enqueueJiraIssueMutation`); the view-mode choice persisted by `jira-view-mode-storage.ts` / `linear-issue-view-storage.ts`.
2. Dart today: flat list `TaskList.tsx`, filters `Filters.tsx` (mine, status, dartboard, search), list state `use-task-page-dart-state.ts` (100-row cap, `DART_LIST_PAGE_DEFAULT` / `DART_LIST_PAGE_MAX` 250 in `dart-params.ts`), config (statuses, dartboards) in `dartConfig`.
3. Dart public API (OpenAPI schema read 2026-11-04):
   3.1. `GET /tasks/list` already supports `parent_id` (direct subtasks; empty string = tasks with no parent), `view_id`, `view` (case-insensitive substring of a view title, uses the first matching view), `dartboard_id`, `status_id`, `updated_at_after` (inclusive lower bound on last update time, ISO 8601), ordering `o`, and paging (`limit` max 250). All of this is read from the OpenAPI schema (2026-11-04) and unverified against the live API. `status` and other text filters are case-insensitive substring matches, so a column must compare the status title exactly on the client.
   3.2. `GET /dartboards/{id}` and `GET /views/{id}` return only `id`, `htmlUrl`, `title`, `description`. There is no endpoint that lists dartboards or views: dartboards come from `/config` as full-path titles (no ids), views have no list at all.
   3.3. `GET /tasks/{id}` returns `taskRelationships` with `subtaskIds` (the detail can count and fetch subtasks); `parentId` is on every task.
   3.4. `/config` lists statuses as a flat workspace list; whether statuses differ per dartboard is not known.
4. Phase 1 contract lists only whitelisted filters (`DART_TASK_LIST_QUERY_PARAMS`, `dart-params.ts:102-112`): `parent_id`, `view_id`, `dartboard_id`, `o` need adding there (the host drops everything else because Dart silently ignores unknown names).

## Rough tasks (to be detailed later)

1. P3-1 Contract and host reads: add `parentId`, `viewId`, `dartboardId` (and an ordering value) to `ListTasks` and the whitelist; add `dart.getDartboard` and `dart.getView` RPC reads (title, description, `htmlUrl` through `isTrustedDartHtmlUrl`); capability `dart.board.v1` so older hosts degrade to the list. Reads only: no new write methods.
2. P3-2 Board data model: pure functions that group tasks into columns by exact status title (order from `/config` statuses, plus a column for tasks whose status is not in config), per-column counts, and a "showing first N of M" notice per scope because of the 250-row page cap (decide: page through several pages with a budget, as the old D1 (a) did for dartboards, or cap and say so).
3. P3-3 Board UI: a List / Board switch with the choice remembered (same storage pattern as the Jira and Linear view modes), column component and card component using shadcn primitives and the styleguide, fixtures and screenshots in both themes. Cards show title, assignee, priority, due date, tag count, subtask count; click opens the existing detail sheet.
4. P3-4 Drag between columns: HTML drag and drop as in `IssueBoardColumns.tsx`; drop calls phase 2's `updateDartTask` with the new status through the mutation queue (optimistic move, rollback and message on refusal, rate limit shown, never retried). Keyboard alternative: a "Move to" menu on the card, for accessibility and for touch-less testing. No reorder inside a column.
5. P3-5 Dartboards and saved views: a scope selector (dartboard picker over `/config` titles already exists as a filter; a saved-view entry takes a pasted Dart view URL or id, validated by the host with `getView`, remembered per environment). Tasks for a view come from `listTasks` with `view_id`.
6. P3-6 Subtasks: list option "Show subtasks nested" (one extra `parent_id` read per expanded parent, lazily, or a client-side tree from the loaded page when parents and children are both loaded); detail shows a Subtasks section with status chips (read only; creating a subtask is a new write and is listed under "Later candidates").
7. P3-7 Light polling: refresh the open list or board every N seconds (start with 60 s) only while the Tasks page is visible and the window focused, with a quiet merge that keeps scroll, selection, open pickers and pending edits (pending edits win over incoming server values for their fields, as `mergeJiraIssueHydration` does in `jira-issue-workspace-hydration.ts`); backs off after errors and stops on `dart.rateLimited`; an incremental poll can ask only for tasks changed since the last read with `updated_at_after` (spec only, unverified live; a full re-read stays the fallback, and deletions or moves out of the scope are not visible to an incremental read, so a full read still runs now and then); reuse the existing quiet-refresh ideas in `task-page-github-quiet-refresh-run.tsx` and the Jira/Linear refresh hooks instead of a new timer framework.
8. P3-8 Remote, mixed versions, docs, verification: parity tests, old host fallback to the list, folder workspaces, hidden-renderer screenshots, live read-only checks, live drag check and live blocker add/remove on a throwaway dartboard with the user's go.
9. P3-9 On hold and blockers (added 2026-11-04 at Rohit's request): (a) custom statuses need no code beyond P3-2's "columns from `/config` statuses", but verify a custom `On hold` status appears as a column and a drag into it saves; (b) a tag filter on the board (reusing the phase 2 tag control) with a quick "On hold" chip when an `on-hold` tag exists in `/config`; (c) read `blockerIds` / `blockingIds` from `taskRelationships` (`GET /tasks/{id}`; check live whether list items carry them) and show a "Blocked by N" marker on cards and a Blockers section in the detail; (d) add/remove a blocker is a new write: check in the OpenAPI schema how `taskRelationships` is updated (full-set replace via `PUT /tasks/{id}` or otherwise), add it behind its own capability (e.g. `dart.relationships.v1`), through the phase 2 write queue with rollback. Runs after P3-1 and P3-3, last in phase 3.

## Later candidates (not in phase 3)

1. Add subtask (a new write using `createTask` with `parentId`; needs `parentId` in `CreateTask`).
2. Reorder inside a column (`POST /tasks/{id}/move` with `beforeTaskId` / `afterTaskId`).

## Phase 4 note (not planned yet)

Custom properties (e.g. a custom status property such as `Blocked`), which need a general editor per property type, together with the other deferred items: multiple assignees and reviewers, attachments, time tracking, duplicate/related links, delete, Docs, Dart on mobile.

## Open questions (answer before detailing)

1. How should the user choose a saved view, given the API has no list of views or dartboard ids? The `view` filter takes a view title (substring, first match), which may let the user type a view name instead of pasting an id (unverified live; ambiguous titles pick the first match, so `view_id` stays the safe form). Options: type a view title; paste a view URL; or skip saved views and rely on the dartboard filter plus status columns. Recommended: dartboards from `/config` now; saved views by pasted URL, remembered, if the user actually uses views.
2. Per-column limit: the page cap is 250 and a workspace had 883 tasks (#8, item 7.4). Page up to a budget, or require narrowing by dartboard/mine before showing the board? Recommended: default scope "mine", page up to 4 pages of 250, show "first N of M".
3. Do statuses differ by dartboard? If yes, columns must come from the tasks' own statuses for that board; check live in phase 2's verification note.
4. Polling interval and cost: unknown rate limits (no rate-limit header was ever seen). Recommended: 60 s, paused when hidden, stop on 429.
5. Does `parent_id` work for a nested list on the live API, and do subtasks appear in the normal list too (so nesting must dedupe)? Check live, read-only.
6. Drag across dartboards is not planned (status only). Confirm.
7. Answered from the spec (unverified live): `o` on `/tasks/list` accepts `order`, `dartboard__order`, `updated_at`, `created_at`, `title` and `completed_at`, each also with a leading `-` for descending (the array encoding of several values was not checked). Column order inside a status can use `order` or `-order`; check live that `order` matches what the dartai board shows.

## Rules and gates (carry over from phase 2)

Same worker rules, approval gates (no push or merge without a go; real-Dart writes only on a named throwaway dartboard), token handling, reuse map and `pnpm check:changed` before every push. Mobile hides Dart on purpose (commit `588b79f0984`); phase 3 does no mobile work.
