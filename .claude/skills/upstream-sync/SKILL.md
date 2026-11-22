---
name: upstream-sync
description: Bring stablyai/orca upstream into the Orca fork (Interstellar-code/orca) without breaking the fork's Dart work, then release it. Lists the upstream releases the fork lacks, asks Rohit which one to sync to, merges on a branch in the checkout of the machine it runs on, resolves conflicts with the customization registry, runs every gate, reviews, merges the PR, hands off to the release skill, then does a live Dart check on the Ubu install. Use when Rohit says "upstream sync", "catch up with upstream", "merge upstream", or types /upstream-sync.
---

# Upstream sync

The orchestrator (the Claude session where this skill was invoked) runs this skill. All of its work
runs on that same machine, the "present system": the merge, the builder, the gates, the push, the
PR and the reviews, in the orchestrator's own repo checkout (`<checkout>` below, the root of the
session's working directory). Rohit set this on 2026-11-22: no hopping to another host for the sync.
Ubu is only the release target that the `release` skill installs on. The orchestrator stops and asks Rohit only when he must choose the release, a conflict cannot be resolved with
confidence, a Dart check fails, or a step would discard work.

## Rules

- Fork only: push to and open PRs on `Interstellar-code/orca`. Never push to, open PRs on or
  comment on `stablyai/orca`.
- Never merge upstream directly on `main`. Work on `sync/upstream-<release>` in `<checkout>` on
  the present system.
- Never drop a customization listed in `customization_registry.json`. Keep upstream's structure
  and re-apply the fork's change on top of it.
- Never `git checkout -- <file>`, `git stash`, `git reset --hard` or `--force` push to undo work.
- A failed tool or step gets up to three real tries, each changing something; then stop and report
  the exact error. Never swap in a workaround without Rohit's go, and label anything a workaround
  produced.
- Gates run one at a time in one checkout. Long steps run in the background; wait on Orca waits,
  `gh run watch` or task notifications, never sleep loops.
- Allowed without asking (Rohit, 2026-11-11 and 2026-11-21): pushing the sync branch, opening the PR,
  merging it once gates and reviews pass, running the release skill.
- Workers never call the real Dart API. The orchestrator may use `stellar-dart` read-only.

## Facts

- Inventory of fork changes: `customization_registry.json` (`customizations[]` with `key_paths`,
  `touches_upstream_files`, `sync_notes`, `known_gaps`; `last_upstream_sync`).
- Helper: `config/fork/upstream-sync.sh`
  - `report [target]`: releases since the last sync (each with its merge target) and the files
    changed on both sides, grouped by customization with its sync notes.
  - `release-target vX.Y.Z`: the upstream-main commit that release was cut from.
  - `record-release`: writes the newest upstream release in `HEAD` to `config/fork/upstream-release`
    and commits (this sets the fork's version base).
  - `record-sync <upstream-commit> [merge-commit]`: updates `last_upstream_sync` and commits.
- Upstream tags each release (`vX.Y.Z`) on a side commit that bumps `package.json` and is never
  merged back to upstream main. The sync merges the release's merge target on upstream main, not the
  tag; release-only fixes on the tag are not included (note that in the report).
- Known hot spots: `src/shared/work-items/task-source-runtime-capabilities.ts`,
  `src/renderer/src/runtime/workspace-links/runtime-workspace-attachment-capabilities.ts`, the
  shared task-provider unions, `rpc-params-catalog.generated.ts` (regenerate, never hand-merge),
  `config/focus-setting-read-baseline.txt` (keep upstream sort order).
- Orca CLI (`orca` in the steps means this binary): on macOS
  `/Applications/Orca.app/Contents/Resources/bin/orca`; on Linux outside an Orca terminal
  `orca-ide` (bare `orca` there is the GNOME screen reader).
- On macOS `pnpm` is not on PATH: put a shim first on PATH, e.g. a scratchpad `bin/pnpm` containing
  `exec corepack pnpm "$@"`.
- `<label>`: the release tag (`vX.Y.Z`), or `main-<short sha>` for an unreleased target. Used in
  the branch name, commit message, task title and PR title.
- The orchestrator commits. Builders never commit: after each builder round the orchestrator checks
  `git status` and commits the round's changes (the merge itself at step 3.4, later fixes as
  `fix(sync): <what>` before re-running the gates). A fix round re-runs the step 4.1 `worker-start`
  command with a new brief holding the failure output or review findings.
- The merge spans thousands of upstream files, so run it with `-c merge.renameLimit=30000`, or git
  skips rename detection and turns upstream's directory moves into needless conflicts.
- Ubu (release target only): SSH host `ubuntu-7of9`, Orca environment "Orca Ubu 7of9", web client
  `http://192.168.0.57:6770`.
- Dart test paths: `src/main/dart`, `src/shared/dart`, `src/renderer/src/components/task-page/dart`,
  `src/cli/handlers/dart.test.ts`.

## Steps

### 1. Preflight

1. `<checkout>` on `main`, clean, equal to `origin/main`. No open fork PRs
   (`gh pr list --repo Interstellar-code/orca`); if there are, list them and ask whether to merge
   them first.
2. Check Ubu is reachable (`ssh -o ConnectTimeout=8 ubuntu-7of9 true`): only the release install
   and the live check (step 9) need it. If it is down, say so and carry on; step 9 then publishes
   the GitHub Release and builds the Mac app, and the Ubu install and live check wait until Ubu is
   back (list them as open in the report).
3. The fork is a GitHub fork of stablyai/orca, so every `gh` call names
   `--repo Interstellar-code/orca`; also run `gh repo set-default Interstellar-code/orca` in
   `<checkout>` so a bare `gh` can never pick upstream.
4. Load the `orchestration` skill (`orca skills get orchestration`) before step 4.

### 2. Choose the release (ask Rohit)

1. `config/fork/upstream-sync.sh report` (takes a few minutes; run it in the background).
2. Ask with AskUserQuestion: the newest 3 releases as options (label `vX.Y.Z`, description: date,
   commits past the last sync, files changed on both sides), newest first and marked Recommended.
   "Other" lets him name an older tag or `upstream main` (latest commit, unreleased).
3. Resolve the target: `config/fork/upstream-sync.sh release-target <tag>`, or the current
   `upstream/main` sha. Branch name `<branch>`: `sync/upstream-<label>`.
4. Re-run `report <target>` and save it to the session scratchpad as `upstream-sync-report.md`. It
   becomes the PR body in step 8 and is committed on the branch in step 5. Tell Rohit in one line:
   release, commit count, conflict surface by customization.

### 3. Merge on a branch

1. In `<checkout>`: `git fetch upstream --tags && git switch --no-track -c <branch> origin/main`
   then `git -c merge.renameLimit=30000 merge --no-ff --no-commit <target> > "$(git rev-parse --absolute-git-dir)/sync-merge.log" 2>&1`
   in the background (it can take over ten minutes). The log sits inside the checkout's git
   directory, so the builder can read it; give the builder its absolute path.
2. Conflicts other than the lockfiles: list them with `git diff --name-only --diff-filter=U` and do
   step 4 first; `package.json` and `mobile/package.json` are resolved there like any other file.
3. Lockfiles, always, once no other file is conflicted: if `pnpm-lock.yaml` or
   `mobile/pnpm-lock.yaml` is conflicted, take upstream's version
   (`git checkout --theirs -- <lockfile>`, the one allowed checkout). Then run `pnpm install` and
   `pnpm -C mobile install` unfrozen, so the lockfiles match the merged `package.json` files with the
   fork's dependencies re-added, and stage both lockfiles if they changed. Every later install uses
   `--frozen-lockfile`.
4. Commit the merge (`merge: upstream <label> (<target>) into the fork`) once `pnpm tc`
   passes, and go to step 5.

### 4. Resolve conflicts (builder)

1. Write the brief to `<scratchpad>/builder-brief.md` and start one builder as an Orca worker in
   `<checkout>`:
   `orca orchestration worker-start --spec-file <scratchpad>/builder-brief.md --task-title "Resolve upstream <label> merge conflicts" --worktree current --agent claude --model opus --effort high --json`.
   End the turn; Orca wakes the orchestrator when the builder reports.
2. Its brief (every path absolute, since the worker is a separate session): the merge log path
   and the conflicted files; for each, the registry entries that own it (id, summary,
   `sync_notes`) from the report; the rules above (keep upstream structure, re-apply the fork change,
   never drop a customization, regenerate generated files, no checkout/stash/reset); it never
   orchestrates, never picks models, never calls the Dart API; it leaves the lockfiles to step 3.3;
   it splits the files across parallel subagents by area; it reports over the Orca bus
   (`worker_done`) with each file and what it kept from each side, and any file it is not
   confident about. It does not commit. Conflict kinds to cover: content, modify/delete (upstream
   deleted a file the fork changed: move the fork change to where upstream moved the logic) and
   file location (fork files added inside a directory upstream renamed: move them and fix imports
   and registrations).
3. Any file the builder is not confident about: stop and ask Rohit, showing both sides in short.
4. When every non-lockfile conflict is resolved, return to step 3.3.

### 5. Version base and registry

On the sync branch, right after the merge commit, in this order:

1. `config/fork/upstream-sync.sh record-sync <target> HEAD` (commits `last_upstream_sync`; the
   second argument is the merge commit, so pass it while `HEAD` is still the merge).
2. `config/fork/upstream-sync.sh record-release` (commits the new `config/fork/upstream-release`).
3. Copy the report into the checkout:
   `cp <scratchpad>/upstream-sync-report.md docs/plans/upstream-sync-<YYYY-MM-DD>.md`, then
   `git add -f` it (upstream ignores `docs/**`) and commit.

### 6. Gates (`<checkout>`, one at a time, in order)

1. `pnpm install --frozen-lockfile` and `pnpm -C mobile install --frozen-lockfile`.
2. `pnpm tc`.
3. Dart tests: `pnpm test <Dart test paths> --maxWorkers=2`.
4. `pnpm test --maxWorkers=2` (full suite).
5. `pnpm lint`, then `pnpm check:changed`.
6. A failure: check whether it also fails on the upstream target alone, in a separate worktree
   (`git worktree add --detach ../upstream-target <target>`, a sibling folder of `<checkout>`; then `pnpm install --frozen-lockfile`
   there; remove it with `git worktree remove` afterwards). Fails there too: record it in the sync report as pre-existing, do not fix. Fails only
   on the merge: fix it on the branch (a builder round with the failure output), re-run the gates.
   A Dart failure the builder cannot fix: stop and ask Rohit.

### 7. Registry check

1. Every `key_paths` entry of every active customization still exists.

### 8. Review and merge

1. `git push -u origin HEAD:<branch>`, then
   `gh pr create --repo Interstellar-code/orca --base main --head <branch> --title "merge: upstream <label> into the fork" --body-file <scratchpad>/upstream-sync-report.md`.
2. Review: a fresh subagent (Claude Sonnet, medium effort) on the conflict resolutions and every
   registry-owned file in the diff. Then a final review (Claude Fable, max effort) on the same.
   Findings go back to the builder (a fix round, see Facts); the orchestrator commits the fixes,
   re-runs the affected gates and pushes.
3. `gh pr merge <number> --repo Interstellar-code/orca --merge`. Then `git switch main && git pull --ff-only` in `<checkout>`.

### 9. Release

1. Run the `release` skill. It publishes the GitHub Release (Mac, Linux, Windows downloads),
   installs on Ubu, and gives Rohit the Mac swap line.
2. Live check, once the release runs on Ubu (Ubu only ever runs the installed release, so this is
   the first point where it serves the merged code): a headless Canary subagent on the Ubu web
   client on port 6770 (see Facts): the Tasks page shows Dart tasks, the board columns render, a
   task detail page opens with its relationships section, the source chip names the server and Dart
   account. Read-only: no clicks that write. A failure is a Dart regression already released: stop,
   show Rohit what failed, and fix it in a follow-up PR on his go.

### 10. Report

To Rohit, in the status shape: the release synced, PR link, what conflicted and how each was
resolved, pre-existing failures recorded, release link, installed versions on Mac and Ubu, the live check
result (or why it is still open). Then
delete the merged sync branch on the fork and in `<checkout>`.
