# Dart phase 3 review 2

Reviewed current `docs/plans/dart-phase-3.md` (state boundary and selector inputs included), `docs/plans/dart-phase-2.md`, source base `47247967004`, schema, styleguide, and test anti-patterns. No product edits, tests, builds, live API calls, or commits.

## Round 1 fix verification

| ID                               | Status           | Current plan evidence                                                                                                                                                                                         |
| -------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1 aggregate cache integration   | **fixed**        | D4a now requires one ordinary `CacheEntry<DartTaskPage>` in `dartListCache`, `data.tasks` sole source, metadata separate, `open`/`done` selector-derived; B3 accept uses real Phase 2 queue/patcher.          |
| B2 scoped detail plumbing        | **fixed**        | B8 owns `use-dart-task-relationships.ts`, `TaskDetail.tsx`, and `TaskDetailView.tsx`; frozen hook signature and mounts.                                                                                       |
| B3 paging cursor/generation      | **fixed**        | D3 specifies raw-row cursor advancement, global dedupe with newer `updatedAt`, generation reset, stale append suppression, incomplete-read signaling.                                                         |
| M1 old-host finished label       | **fixed**        | D1 labels old-host finished section “50 finished tasks (not necessarily the latest)” and never calls it latest done; fake old-host test required.                                                             |
| M2 refresh partial publication   | **fixed**        | D4/B3 agree failed refresh keeps previous complete read; D4a captures per-host epochs and re-reads once after change.                                                                                         |
| M3 doneOffset under dedupe       | **fixed**        | D3 advances cursor by raw rows, not deduped count; only one Show-more read; generation resets; global cross-part dedupe.                                                                                      |
| M4 unchecked blocker filter      | **fixed**        | D7 keeps unchecked held tasks, labels “not checked”, count line says N unchecked, Check button reads next 20.                                                                                                 |
| M5 saved-view chips              | **fixed**        | D2 and B3.0 `DartBoardFilters` include `onHold` and `blockedOnHold`.                                                                                                                                          |
| M6 synchronous picker reference  | **fixed**        | Reuse map 7/B8 assign `DartBlockerPicker.tsx` with async search, debounce, stale-reply drop, keyboard/Escape, `shouldFilter={false}`.                                                                         |
| M7 keyboard move/nested focus    | **fixed**        | B6 move/rollback focus + aria-live; B7 separate expand button with accessible name, `aria-expanded`/`aria-controls`, collapse focus return.                                                                   |
| M8 delivery tests                | **fixed**        | B9 owns `TaskPage.dart-board.test.tsx` with stateful fake host, real routing, forced reread/remount assertions, deferred races, unknown outcomes, host/account isolation.                                     |
| M9 focused gate commands         | **partly fixed** | B9 now owns `TaskPage.dart-board.test.tsx` and `dart-board-fake-host.test-support.ts` with exact test command; B2/B3 test files now explicitly owned; but see new M12 below for remaining command-level gaps. |
| M10 lossy relationship PUT       | **fixed**        | D8/B1 require raw fresh relationship JSON (not sanitized lists), refuse before PUT on missing/nonobject relationships; accepted no-precondition race unchanged.                                               |
| M11 frozen consumer contracts    | **partly fixed** | B3.0 now field-by-field frozen types; state boundary and selector input signatures added; see new M13 below.                                                                                                  |
| N1 credential permissions        | **fixed**        | What exists 1 now distinguishes workspace vs accounts-admin.                                                                                                                                                  |
| N3 nullability/mobile citation   | **fixed**        | Item 4 now says relationship object nullable, fields optional, arrays non-null; mobile citation line 10.                                                                                                      |
| N5 visual/accessibility criteria | **fixed**        | B9 screenshot review covers focus-visible rings, current-row style, partial/error states, reduced motion, no invented values.                                                                                 |

## New findings

### Blocker

None.

### Major

### M12. B4–B8 shared test command still does not isolate task acceptance

**Reference:** `docs/plans/dart-phase-3.md:178` (test command line); B4-B8 task bodies.

B4 (pure model), B5 (state/header), B6 (board/drag), B7 (nested list), and B8 (detail/relationships) all run the same directory-wide `pnpm test src/renderer/src/components/task-page/dart ...` command. That means B4 can pass without its own tests, B5 can pass without its state tests, and later tasks depend on files earlier tasks did not create. The command does not prove per-task acceptance.

**Fix:** Give each task its own explicit test file list in the command: B4 model test; B5 state/header/hook tests; B6 board/drag tests; B7 nested-list tests; B8 relationships/subtasks/picker tests. Keep the directory-wide sweep only in B9's final run.

### M13. `DartNestedListModel.rows` is a derived selector output but the model is also the owner of expansion state

**Reference:** `docs/plans/dart-phase-3.md:125` (`DartNestedListModel` frozen type), state boundary paragraph (`:130`), B5/B7 ownership.

The state boundary says B5's hooks call selectors with `useMemo` on every store change and add only UI state. But `DartNestedListModel` carries `rows` (selector output), `expanded` (UI state), `children()` (async read state), and `toggle()` (UI mutation). The contract mixes pure projection, UI state, and async read orchestration in one object. A worker cannot tell whether `rows` is computed inside the hook or outside, or whether `children()` is a synchronous selector or an async call.

**Fix:** Either split the nested list into a pure selector (`buildDartTaskTree(tasks, children)`) plus a thin UI hook (`expanded`, `toggle`, `children`), or explicitly state in B3.0 that `DartNestedListModel` is a hook-returned composite where `rows`/`children()` are memoized selector results and `expanded`/`toggle` are UI state. The current wording is ambiguous enough that two workers could implement incompatible shapes.

### M14. `onOpenTask` in B8's frozen mount signature still says “existing open-task callback”

**Reference:** `docs/plans/dart-phase-3.md:168` (B8 files/mount); `:128` (navigation type).

The navigation paragraph now defines `DartOpenTask = (task, sourceContext?)` and says B5 owns the `openDartDetailPage` change. But B8's mount text still says `onOpenTask={...}` is “the detail's existing open-task callback”. The current `TaskDetail.tsx` has no such prop; the existing routing hook's `openDartDetailPage` is a different signature (no second argument). A worker reading B8's mount instruction cannot tell whether to add a new prop, reuse an existing one, or thread it through.

**Fix:** Replace “the detail's existing open-task callback” with an explicit statement: B5 adds an `onOpenTask: DartOpenTask` prop to `TaskDetail.tsx` (via `TaskDetailView.tsx`), B8 receives and calls it with the detail's `sourceContext`. Name the exact prop type and mount path in B8's frozen contract.

### Minor

### N6. B2 command still selects the whole `src/renderer/src/web/preload-api` directory

**Reference:** `docs/plans/dart-phase-3.md:178`.

The B2 command includes `src/renderer/src/web/preload-api` (directory), which runs unrelated preload tests. The B2-owned test file is now explicitly named, but the command still includes the directory selector. This is noisy but not a correctness blocker.

**Fix:** Replace the directory selector with the exact owned file `src/renderer/src/web/preload-api/web-dart-saved-view-api.test.ts`.

### N7. B9's screenshot command names only one fixture ID

**Reference:** `docs/plans/dart-phase-3.md:179` (B9 screenshot line).

`pnpm fixtures:shot task-page/dart/DartBoard:wide --theme both` plus “each fixture id named in B5 to B8” is vague. B5 owns `Filters.fixture.tsx`, B7 owns `TaskList.fixture.tsx:nested`, B8 owns `TaskDetailRelationships`/`TaskDetailSubtasks` fixtures, B6 owns `DartBoard.fixture.tsx` with multiple exports. The plan should list the exact fixture IDs rather than referring to them by task.

**Fix:** List exact fixture IDs: `task-page/dart/DartBoard:wide`, `:dragging`, `:empty-columns`, `:unknown-outcome`, `:old-host`, `task-page/dart/TaskList:nested`, and the B5/B8 fixture IDs. Add `ORCA_BACKGROUND_LAUNCH=1` to the command if required by the CDP environment.

### N8. B5 placeholder mounts are type-checked but not behavior-tested

**Reference:** `docs/plans/dart-phase-3.md:130,148`.

B5 creates `DartBoard.tsx` and `TaskList.tsx` placeholders with correct props and mounts them so `pnpm tc` catches missing fields. But there is no requirement for a rendered test that the placeholder actually renders (even minimally) and that B6/B7 can replace it without changing the mount props. A compile-only check can pass with a placeholder that renders nothing.

**Fix:** Add a B5 rendered test that mounts the placeholder with a minimal valid model and asserts it appears in the DOM (even if empty), so B6/B7 inherit a working mount point. Alternatively, require B5 to ship the placeholder with a minimal visible shell (e.g., a div with a data-testid) rather than returning null.

## Suggestions

### S4. Consolidate the state boundary paragraph into B3.0's frozen contract

The state boundary paragraph is currently prose after the type list. Move it (or a condensed version) into a comment block at the top of `dart-board-contracts.ts` so workers read it before writing code.

### S5. Add a one-line “phase 2 must be merged before B3.0 freezes” gate

The plan says B3.0 must re-read phase 2's merged code, but this is only mentioned once. Add it to the “Rules for every worker” block so every phase 3 worker sees it.

## Verdict

**ready after fixes** — M12, M13, M14 (majors) and N6, N7, N8 (minors) are narrow, concrete corrections. All blockers from round 1 are resolved. The plan's architecture, data safety, capability gating, and test coverage are now sound; the remaining issues are pasteability polish.

Counts: 0 blocker, 3 major, 3 minor, 2 suggestion.
