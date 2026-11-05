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

## Known gap (expected-fail test)

A web-paired host that predates `dart.provider.v1` never gets the update-required state: the web client sends `dart.status` without a capability probe, so the page offers Connect Dart. The test is `it.fails`; it turns red when the gap is fixed, and then becomes a plain `it`.

## Pass 2

Comments (T5) and the New task dialog (T7): delivery of a comment and a created task, lost-reply cases for both, old-host comments, and the new-task dialog screenshot.
