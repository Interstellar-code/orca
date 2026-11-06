# Dart phase 2, T8: cross-task coverage (pass 1)

Cross-task tests that only make sense once T1 to T6 are merged. They run on fakes; nothing calls Dart.

## Where

| Test file                                                               | Covers                                                                                                                         |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `src/renderer/src/components/task-page/TaskPage.dart.delivery.test.tsx` | The real Tasks page and detail over a fake host, on the remote RPC and a web-paired host                                       |
| `src/renderer/src/components/task-page/dart/TaskDetail.escape.test.tsx` | Escape across pickers, tag popover, title and description editor in the merged sheet, with no stand-in for the sheet's handler |
| `src/main/dart/dart-transport-parity.test.ts`                           | Description patch body, refusal text and rate limit identical over IPC and RPC                                                 |

## What the delivery tests assert

- A status edit reaches the fake host once with the canonical body, and the detail and list row show it.
- An accepted write with a lost reply shows the unknown-outcome notice; Check again shows what the host holds; the write is never resent.
- A host without `dart.writes.v2`: status, priority, assignee, dartboard, tags and title save; size and dates are text; the description is read-only with `Copy` and `Open in Dart`; the host never sees `size`, `startAt`, `dueAt` or a description patch.
- A remote host without `dart.provider.v1` shows the update-required state and receives no Dart request.
- A detail with its own source context sends config, comments, reads, the capability probe and edits to that scope. Another host or account with the same task id is untouched; a same-host, same-account detail updates the list row.
- A list read that began before a write and lands after it does not undo the write; a field changed in Dart while another field's write is pending is kept.
- A plain folder workspace linked to a Dart task shows on the row, opens the task and saves edits.

## Web client without dart.provider.v1

A web-paired host that predates `dart.provider.v1` shows the update-required state and receives no Dart request (the web client probes the capability first; the positive verdict is cached 60 s per host, so tests clear it).

## Pass 2

Comments (T5) and the New task dialog (T7). Fakes only; nothing calls Dart.

| Test file                                     | Covers                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TaskPage.dart.delivery.test.tsx`             | Comment add and reply (right parent, threaded render), create task (one create, opens in detail, listed), both over remote RPC and web-paired host; lost reply for a comment ("Not sure it posted", Check again shows it once, one post) and for create (Check again lists the one task, no second create); a detail scoped to another host posts add and reply to that host only |
| `TaskPage.dart.comments-old-host.test.tsx`    | Host with `dart.provider.v1` but no `dart.writes.v2` posts comments and replies normally; host without `dart.provider.v1` shows update-required and receives no `dart.*` request (both transports)                                                                                                                                                                                |
| `src/main/dart/dart-transport-parity.test.ts` | Comment body (`parentId` only on a reply) and comment rate-limit reply identical over IPC and RPC, no retry                                                                                                                                                                                                                                                                       |

Not covered: create from a scoped detail (create always uses the page scope, per T7).

Screenshots (fixtures, light and dark, `.cache/fixtures/t8-pass2/`): New task dialog empty (`TaskCreateDialog:empty`), duplicate-match warning (`:mayHaveCreated`), "Create anyway" (`:createAnyway`), comments "Not sure it posted" (`TaskDetailComments:unknownOutcome`) and duplicate (`:duplicate`).
