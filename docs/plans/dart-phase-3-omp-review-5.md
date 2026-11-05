# Dart phase 3 — OMP review 5

Reviewed only commit `dd485764990`'s changes to `docs/plans/dart-phase-3.md` against round 4 and the affected plan contracts. No Dart API calls, builds or tests were run.

## Round 4 findings

- **B1 — fixed:** B1 adds optional raw page counts; D3 and B3 specify current- and old-host cursors, and B3.0's metadata represents the incomplete fallback.
- **M1 — not fixed:** capability-file ownership is assigned to B1 and catalog integration is specified, but the new B2 dependency conflicts with parallel execution; see M1 below.
- **M2 — fixed:** B1 owns shared `DartHostFeatures`; B3.0 composes saved-view support separately.
- **M3 — fixed:** repeated epoch changes discard both stale reads and retain displayed state.
- **M4 — fixed:** the frozen search API carries the board-only option and B8 tests mode changes.
- **M5 — not fixed:** separate child entries and tree inputs are defined, but the new list hierarchy contradicts F5; see M2 below.
- **M6 — fixed:** client filters preserve the finished-page cursor and generation.
- **M7 — fixed:** B1 specifies non-empty parent IDs and all capability constants; B8 takes one scope.
- **N1 — fixed:** the affected decision, mockup and hunk summaries were aligned.
- **N2 — fixed:** B3 names the queue export and runs both queue and account tests.
- **N3 — fixed:** the design reference maps B4 and B5 to the relevant screens.

## Major findings

### M1. B2 cannot import B1's new capability on its parallel branch

**Plan:** lines 104, 127, 138, 155. B1 and B2 start in parallel from the same base, but B2's web API uses the `dart.savedViews.v1` capability constant that B1 alone creates. B2 cannot import that new export or pass its own `pnpm tc` before B1's change reaches its branch.

**Rewrite:** Keep B1 and B2 parallel, but require B2 to merge B1's completed capability commit into its branch before importing the constant and running its gates; explicitly identify this as a dependency before B2 completes. Alternatively serialize B2 after B1 and update the run order.

### M2. Grandchildren are simultaneously required and forbidden in the list

**Plan:** lines 79, 106, 200, 236. The changed D6 and B4/B7 acceptance require a grandchild at depth 1 under its top-level ancestor. F5, which the plan says wins and which B4/B7 must apply, says that grandchild appears in detail only, not in the list. A worker following F5 cannot pass the new B4/B7 tests.

**Rewrite:** In F5 replace “a grandchild shows under its own parent only when that parent is expanded in the detail, not in the list” with “a loaded grandchild appears at depth 1 under its top-level ancestor in the list, with no expand button; the detail displays the hierarchy.”

## Verdict

**ready after fixes** — 0 blockers, 2 majors.
