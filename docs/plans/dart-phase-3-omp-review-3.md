## Addendum after coordinator edits (round 3 re-read)

The coordinator rewrote the seven named contradictions after the initial draft. Re-reviewing current lines changes the disposition:

- **C3 parentId empty-string:** fixed. B1 now tests only non-empty `parentId`; the current correction section says empty roots are client-derived.
- **C4 old-host paging:** partly fixed. D1 now says old hosts page open tasks to 1,000 with existing keys, but B3 acceptance still says an old host gets one page (`docs/plans/dart-phase-3.md:187`). Rewrite that acceptance to four 250-row requests; retain no `parentId`/`ids`/`order`/relationship reads.
- **C6 saved account transport:** partly fixed. B2 params now omit `dartUserId` (`:155`), but B5 still says `owner key = host id plus Dart user id; no read or write until the user id is known` (`:205`). Renderer ownership must be host-target/status driven; host derives the account.
- **C9 null relationship wire states:** partly fixed. D8/F10 and B1 acceptance define raw null as `{}`/`{ blockerIds }`, but B1 step 3 still says “no `taskRelationships` object” always fails (`:138`). Split absent field, present null, present object, and invalid non-object explicitly.
- **C8 age semantics:** partly fixed. D4 still says age uses cache-entry `fetchedAt` (`:76`), while F8 says only `DartScopeMeta.fetchedAt` (`:109`) is authoritative. Rewrite D4 and define 60-second cache TTL versus 120-second visibility refresh.
- **C10 blocker search:** fixed; current B8 uses `searchDartTasks` with all-dartboards default and a board-only toggle (`:243`). Remove C10 from open findings.
- **C11 B9 commands:** partly fixed. Per-task commands are now split (`:255`), but B9 still combines renderer/jsdom and main parity in one command (`:253`), contrary to F12. Split those commands and add queue/selector/render integration coverage to B3/B5 commands.
- **M12 round-2 per-task command split:** partly held, not wholly open; exact B2-B8 commands now exist. Remaining issue is only C11's B9 environment split and missing explicit queue/selector coverage.
- **M13 nested pure/UI split:** fixed in the current B3.0 wording (`:175`).
- **M14 DartOpenTask:** fixed; B8 now explicitly uses `DartOpenTask` and detail scope (`:241`).
- **N6/N7/N8:** fixed; exact B2 test path, fixture IDs, and rendered B5 mount test are present.

## Corrected open findings

The review's stale C10 finding and broad M12 wording are removed. Remaining **major** findings are C1/F1 task-keyed notice/queue contract, C2 store-versus-hook queue wording if any stale phrase remains, C4 old-host acceptance, C5 relationship scope/cache type, C6 B5 saved-view owner key, C7 global finished control, C8 age/TTL wording, C9 null wire-state wording, and C11 B9 environment/test coverage. Remaining **minor** findings are N1 F13 serial order, N2 fake-host test-environment location, and N3 server/client filter projection not frozen as separate types. Verdict remains **not ready** until worker-facing task sections are internally consistent.
