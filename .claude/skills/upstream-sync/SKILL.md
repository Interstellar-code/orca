---
name: upstream-sync
description: Bring stablyai/orca upstream into the Orca fork (Interstellar-code/orca) without breaking the fork's Dart work, then release it. Lists the upstream releases the fork lacks, asks Rohit which one to sync to, merges on a branch on Ubu, resolves conflicts with the customization registry, runs every gate plus a live Dart check, reviews, merges the PR, and hands off to the release skill. Use when Rohit says "upstream sync", "catch up with upstream", "merge upstream", or types /upstream-sync.
---

# Upstream sync

The orchestrator (the Claude session on the Mac where this skill was invoked) runs this skill. It
stops and asks Rohit only when he must choose the release, a conflict cannot be resolved with
confidence, a Dart check fails, or a step would discard work.

## Rules

- Fork only: push to and open PRs on `Interstellar-code/orca`. Never push to, open PRs on or
  comment on `stablyai/orca`.
- Never merge upstream directly on `main`. Work on `sync/upstream-<release>` in the Ubu main
  checkout `/home/rohit/codebase/orca` (integration runs on Ubu; the Mac keeps orchestration,
  review and the final check).
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
  - `record-sync <upstream-commit>`: updates `last_upstream_sync` and commits.
- Upstream tags each release (`vX.Y.Z`) on a side commit that bumps `package.json` and is never
  merged back to upstream main. The sync merges the release's merge target on upstream main, not the
  tag; release-only fixes on the tag are not included (note that in the report).
- Known hot spots: `src/shared/work-items/task-source-runtime-capabilities.ts`,
  `src/renderer/src/runtime/workspace-links/runtime-workspace-attachment-capabilities.ts`, the
  shared task-provider unions, `rpc-params-catalog.generated.ts` (regenerate, never hand-merge),
  `config/focus-setting-read-baseline.txt` (keep upstream sort order).
- Ubu: SSH host `ubuntu-7of9`, Orca environment "Orca Ubu 7of9". Orca CLI on the Mac:
  `/Applications/Orca.app/Contents/Resources/bin/orca`.
- Dart test paths: `src/main/dart`, `src/shared/dart`, `src/renderer/src/components/task-page/dart`,
  `src/cli/handlers/dart.test.ts`.

## Steps

### 1. Preflight

1. Mac checkout on `main`, clean, equal to `origin/main`. No open fork PRs
   (`gh pr list --repo Interstellar-code/orca`); if there are, list them and ask whether to merge
   them first.
2. Ubu reachable and its main checkout clean on `main`; fast-forward it to `origin/main`.
3. The fork is a GitHub fork of stablyai/orca, so every `gh` call names
   `--repo Interstellar-code/orca`; also run `gh repo set-default Interstellar-code/orca` in the Mac
   checkout so a bare `gh` can never pick upstream. Run every `gh` call from the Mac.
4. Load the `orca-cli` skill (terminals on Ubu) before step 4.

### 2. Choose the release (ask Rohit)

1. `config/fork/upstream-sync.sh report` on the Mac.
2. Ask with AskUserQuestion: the newest 3 releases as options (label `vX.Y.Z`, description: date,
   commits past the last sync, files changed on both sides), newest first and marked Recommended.
   "Other" lets him name an older tag or `upstream main` (latest commit, unreleased).
3. Resolve the target: `config/fork/upstream-sync.sh release-target <tag>`, or the current
   `upstream/main` sha. Branch name `<branch>`: `sync/upstream-<tag>`, or
   `sync/upstream-main-<short sha>` for an unreleased target.
4. Re-run `report <target>` and save it to the session scratchpad as `upstream-sync-report.md`. It
   becomes the PR body in step 8 and is committed on the branch in step 5. Tell Rohit in one line:
   release, commit count, conflict surface by customization.

### 3. Merge on a branch (Ubu)

1. In `/home/rohit/codebase/orca`: `git fetch upstream --tags && git switch --no-track -c <branch> origin/main`
   then `git merge --no-ff --no-commit <target>`.
2. Conflicts other than the lockfiles: list them with `git diff --name-only --diff-filter=U` and do
   step 4 first; `package.json` and `mobile/package.json` are resolved there like any other file.
3. Lockfiles, always, once no other file is conflicted: if `pnpm-lock.yaml` or
   `mobile/pnpm-lock.yaml` is conflicted, take upstream's version
   (`git checkout --theirs -- <lockfile>`, the one allowed checkout). Then run `pnpm install` and
   `pnpm -C mobile install` unfrozen, so the lockfiles match the merged `package.json` files with the
   fork's dependencies re-added, and stage both lockfiles if they changed. Every later install uses
   `--frozen-lockfile`.
4. Commit the merge (`merge: upstream <tag or main sha> (<target>) into the fork`) once `pnpm tc`
   passes, and go to step 5.

### 4. Resolve conflicts (builder on Ubu)

1. Start one builder in an Orca terminal on Ubu in that checkout:
   `claude --model opus --effort high --dangerously-skip-permissions`.
2. Its brief: the conflicted files; for each, the registry entries that own it (id, summary,
   `sync_notes`) from the report; the rules above (keep upstream structure, re-apply the fork change,
   never drop a customization, regenerate generated files, no checkout/stash/reset); it never
   orchestrates, never picks models, never calls the Dart API; it leaves the lockfiles to step 3.3;
   it reports over the Orca bus (`worker_done`) with each file and what
   it kept from each side, and any file it is not confident about. It does not commit.
3. Any file the builder is not confident about: stop and ask Rohit, showing both sides in short.
4. When every non-lockfile conflict is resolved, return to step 3.3.

### 5. Version base and registry

On the sync branch, right after the merge commit, in this order:

1. `config/fork/upstream-sync.sh record-sync <target> HEAD` (commits `last_upstream_sync`; the
   second argument is the merge commit, so pass it while `HEAD` is still the merge).
2. `config/fork/upstream-sync.sh record-release` (commits the new `config/fork/upstream-release`).
3. Copy the report from the Mac scratchpad into the Ubu checkout:
   `scp <scratchpad>/upstream-sync-report.md ubuntu-7of9:/home/rohit/codebase/orca/docs/plans/upstream-sync-<YYYY-MM-DD>.md`,
   then on Ubu `git add -f` it (upstream ignores `docs/**`) and commit.

### 6. Gates (Ubu, one checkout, in order)

1. `pnpm install --frozen-lockfile` and `pnpm -C mobile install --frozen-lockfile`.
2. `pnpm tc`.
3. Dart tests: `pnpm test <Dart test paths> --maxWorkers=2`.
4. `pnpm test --maxWorkers=2` (full suite).
5. `pnpm lint`, then `pnpm check:changed`.
6. A failure: check whether it also fails on the upstream target alone, in a separate worktree
   (`git worktree add --detach ../upstream-target <target>`, then `pnpm install --frozen-lockfile`
   there; remove it with `git worktree remove` afterwards). Fails there too: record it in the sync report as pre-existing, do not fix. Fails only
   on the merge: fix it on the branch (a builder round with the failure output), re-run the gates.
   A Dart failure the builder cannot fix: stop and ask Rohit.

### 7. Registry and live check

1. Every `key_paths` entry of every active customization still exists.
2. Live check on the Ubu web client with a headless Canary subagent: the Tasks page shows Dart tasks,
   the board columns render, a task detail page opens with its relationships section, the source
   chip names the server and Dart account. Read-only: no clicks that write.

### 8. Review and merge

1. On Ubu: `git push -u origin HEAD:<branch>`. Then on the Mac:
   `gh pr create --repo Interstellar-code/orca --base main --head <branch> --title "merge: upstream <tag or main sha> into the fork" --body-file <scratchpad>/upstream-sync-report.md`.
2. Review: a fresh subagent (Claude Sonnet, medium effort) on the conflict resolutions and every
   registry-owned file in the diff. Then a final review (Claude Fable, max effort) on the same.
   Findings go back to the builder; re-run the affected gates.
3. `gh pr merge <number> --repo Interstellar-code/orca --merge`. Then `git pull --ff-only` on the Mac and in the Ubu main checkout.

### 9. Release

Run the `release` skill. It publishes the GitHub Release (Mac, Linux, Windows downloads), installs
on Ubu, and gives Rohit the Mac swap line.

### 10. Report

To Rohit, in the status shape: the release synced, PR link, what conflicted and how each was
resolved, pre-existing failures recorded, release link, installed versions on Mac and Ubu. Then
delete the merged sync branch on the fork, on Ubu and on the Mac.
