---
name: release
description: Build and ship the Orca fork's current main. Publishes a GitHub Release on Interstellar-code/orca with Mac, Linux and Windows downloads, builds and installs the Linux server app on Ubu 7of9, and builds the Mac app for Rohit to swap in. Use when Rohit says "release", "build mac and ubu", "make a release", or when upstream-sync reaches its release step. Fork-only; never touches stablyai/orca.
---

# Release the fork's main

Ships whatever is on the fork's `main` now. It never merges upstream (that is the `upstream-sync`
skill) and never changes code. Run from the Mac (`/Users/rohits/Development/orca`): the Mac build and
swap need it; the GitHub Release and Ubu steps work from any host with `gh` and `ssh ubuntu-7of9`.

## Rules

- Fork only: `origin` must be `Interstellar-code/orca`. Never push to or open anything on `stablyai/orca`.
  The fork is a GitHub fork of upstream, so every `gh` call names `--repo Interstellar-code/orca`.
- Allowed without asking (Rohit, 2026-11-21): running `fork-release.yml`, building, installing on
  Ubu (restarts `orca-serve`), deleting the old backups `/Applications/Orca.previous.app` and
  `/opt/Orca.previous` (he keeps none).
- Not allowed for the agent: quitting or replacing Orca on the Mac. Auto mode blocks it; Rohit runs
  the swap with `!` (step 7, always last: quitting Orca can end this session).
- A failed tool or step gets up to three real tries, each changing something; then stop and report
  the exact error. Never work around a failed step silently.
- Long steps run in the background (`run_in_background`); wait with `gh run watch` or the task
  notification, never with sleep loops.

## Facts

- Mac build clone: `~/.orca-fork-build/orca`. If `command -v pnpm` is empty, put a shim first on
  PATH, e.g. a scratchpad `bin/pnpm` containing `exec corepack pnpm "$@"`.
- Ubu: SSH host `ubuntu-7of9` (Orca environment "Orca Ubu 7of9"). Build clone
  `~/.orca-fork-build/orca`, main checkout `/home/rohit/codebase/orca`, install `/opt/Orca`, unit
  `orca-serve`, web client on port 6770.
- Scripts (all in `config/fork/`): `rebuild-and-install.sh` (`--mode mac|server`, `--install-only`;
  it neither merges upstream nor pushes unless given `--upstream` / `--push`), `install-built-app.sh`,
  `swap-mac-app.sh`. The Mac build is `pnpm build:mac dir --<arch>`: only `dist/mac-<arch>/Orca.app`.
- Gates (rebuild script and workflow): `pnpm tc` and `node config/fork/fork-test-suite.mjs --no-related`
  (registry tests plus every Dart test).
- Workflow: `.github/workflows/fork-release.yml`, dispatch only (inputs `merge_upstream`, default
  false, and `force`). It builds
  macOS arm64, Linux x64 and Windows x64 on GitHub-hosted runners (free: the fork is public). The
  Windows installer is unsigned. A self-hosted Windows VM runner is planned, not built.
- Versions: every build is `<upstream release>-fork.local.<timestamp>.<commit>`; the base comes from
  `config/fork/upstream-release`. Builds of one commit share base and commit, not timestamp.

## Steps

1. Preflight (Mac): `git status --short` empty, on `main`, `git fetch origin` and `HEAD` equals
   `origin/main`. No release run already queued or running:
   `gh run list --repo Interstellar-code/orca --workflow fork-release.yml --status in_progress` and
   `--status queued` both empty (otherwise wait for it, or ask Rohit). Note the `main` commit as
   `<sha>`; every later check compares against it. Merge nothing to `main` until step 5 passes. Ubu reachable: `ssh -o ConnectTimeout=8 ubuntu-7of9 true`. If Ubu is down, say so
   and continue with steps 2-3 and 5-7; do step 4 when it is back.
2. GitHub Release, in the background:
   `gh workflow run fork-release.yml --repo Interstellar-code/orca --ref main -f merge_upstream=false -f force=false`,
   then find the run id: `gh run list --repo Interstellar-code/orca --workflow fork-release.yml --event workflow_dispatch --limit 5 --json databaseId,headSha,createdAt`
   and take the newest run whose `headSha` is the `main` commit and that was created after the
   dispatch (a new run takes a few seconds to appear; re-run the list once or twice if it is not
   there yet). Then
   `gh run watch <id> --repo Interstellar-code/orca --compact --exit-status` in the background.
   If a release for this commit already exists the run skips the build; pass `force=true` only if
   Rohit asks for a rebuild.
3. Mac build, in the background, in parallel with step 2:
   `cd ~/.orca-fork-build/orca && PATH=<shim dir>:$PATH config/fork/rebuild-and-install.sh --mode mac`.
   It fast-forwards the clone, runs the gates, builds and signs. If the fast-forward changed the
   script, it re-runs the new copy once and logs "re-running the synced copy"; that is expected. Then check
   `defaults read ~/.orca-fork-build/orca/dist/mac-arm64/Orca.app/Contents/Info.plist CFBundleShortVersionString`
   ends in the `main` commit and `codesign --verify --deep --strict` passes.
4. Ubu build and install, in the background, in parallel:
   `ssh ubuntu-7of9 'cd ~/.orca-fork-build/orca && config/fork/rebuild-and-install.sh --mode server > /tmp/orca-server-build.log 2>&1; echo exit=$?; tail -5 /tmp/orca-server-build.log'`.
   If it built but did not install (clients connected, or an old copy of the script), run the same
   with `--install-only`. Verify on Ubu:
   `strings /opt/Orca/resources/app.asar | grep -m1 -oE "[0-9.]+-fork\.local\.[0-9]+\.[0-9a-f]+"` ends in the
   `main` commit, `systemctl is-active orca-serve` is `active`, and
   `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:6770/web-index.html` is `200`. Then
   `sudo -n rm -rf /opt/Orca.previous`. Also fast-forward the main checkout:
   `cd /home/rohit/codebase/orca && git pull --ff-only origin main`.
5. Release check: find the tag with `gh release list --repo Interstellar-code/orca --limit 5`; it is
   the one ending in the first 12 characters of `<sha>`. Then
   `gh release view <tag> --repo Interstellar-code/orca --json assets` lists the Mac zip, Linux
   tar.gz, Windows setup.exe and SHA256SUMS.
6. Report to Rohit: release link and files, Ubu installed version, the built Mac version, anything
   skipped and why, and the step 7 line under "What's yours". When called from `upstream-sync`,
   finish its step 10 first.
7. Mac install (Rohit, last): give him this exact line to paste, `!` first, nothing before it:
   `! nohup ~/.orca-fork-build/orca/config/fork/swap-mac-app.sh ~/Library/Logs/orca-swap.log >/dev/null 2>&1 &`.
   Orca quits, installs, reopens, and the backup is deleted; this session may end with it. If it
   survives, wait for `INSTALL OK` or `INSTALL FAILED` in that log and check the installed version.
   Fallback if Orca did not quit within 90 s: Cmd-Q, then
   `! ~/.orca-fork-build/orca/config/fork/install-built-app.sh`.
