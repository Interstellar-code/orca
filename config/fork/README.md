# Fork rebuild: running the Dart fork as your everyday Orca

`Interstellar-code/orca` is your fork of `stablyai/orca`. It carries the Dart task provider,
which upstream does not have. This directory builds the fork on your Mac and on the remote
server, keeps it level with upstream, and makes sure the packaged updater can never replace
it with a Stably release.

On the Mac the rebuild job never touches `/Applications/Orca.app` or your
`~/Library/LaunchAgents`: it builds and notifies. Only the install command you run yourself
(`install-built-app.sh`) replaces the app, and only after you quit Orca. Server mode is the
one exception: you run it on the server, and it replaces `/opt/Orca` itself, but only when it
can prove no client is connected.

## What the pieces do

| Path                                  | Role                                                                                                                                                 |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rebuild-and-install.sh`              | Fast-forward from `origin/main`, merge `upstream/main`, run the Dart gates, build, push, notify. `--mode mac` (default) or `--mode server`.          |
| `install-built-app.sh`                | The Mac install command the notification points at. Refuses while Orca runs; stages the new app and restores the old one if the swap fails.          |
| `com.interstellar.orca-rebuild.plist` | launchd template that runs the script nightly at 03:30 local.                                                                                        |
| `src/main/updater.*` guard            | A `-local.` build never calls `setFeedURL`/`checkForUpdates`; "Check for Updates" answers "This is a fork build; updates come from the rebuild job". |

## One-time setup

### 1. A dedicated build clone

The script merges into `main` and pushes it, so it must never run in the checkout you edit.
Clone the fork once:

```sh
git clone git@github.com:Interstellar-code/orca.git ~/.orca-fork-build/orca
cd ~/.orca-fork-build/orca
git remote add upstream https://github.com/stablyai/orca.git
git fetch upstream
```

Pass a different path with `--clone` or `ORCA_FORK_CLONE`. The script refuses a checkout with
uncommitted changes, on another branch, or (when pushing) whose `origin` is not your fork.

### 2. The Dart token

The script never reads, prints or writes the Dart token. Nothing here needs it.

### 3. Install the launchd job (your choice, not the script's)

```sh
sed -e "s|__REPO_ROOT__|$HOME/.orca-fork-build/orca|g" -e "s|__USER__|$USER|g" \
  config/fork/com.interstellar.orca-rebuild.plist \
  > ~/Library/LaunchAgents/com.interstellar.orca-rebuild.plist
launchctl bootstrap gui/"$(id -u)" ~/Library/LaunchAgents/com.interstellar.orca-rebuild.plist
```

Run that from a checkout that has `config/fork/` (this one, or the build clone after the first
push). `__REPO_ROOT__` must be the path the script lives at; `__USER__` is your home directory
name for the log path.

**launchd PATH.** launchd starts the job with a minimal environment, so the plist sets
`PATH` to `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`. A nightly run
fails at `pnpm: command not found` (or `node: command not found`) when your `pnpm` and `node`
live anywhere else, for example under `nvm`, `fnm`, `volta`, `corepack`, or `~/.local/bin`.
Find their real directory with `dirname "$(command -v pnpm)"` and `dirname "$(command -v node)"`,
then add it to the plist's `PATH` before bootstrapping:

```sh
sed -e "s|__REPO_ROOT__|$HOME/.orca-fork-build/orca|g" -e "s|__USER__|$USER|g" \
  -e "s|/opt/homebrew/bin|$(dirname "$(command -v pnpm)"):/opt/homebrew/bin|" \
  config/fork/com.interstellar.orca-rebuild.plist \
  > ~/Library/LaunchAgents/com.interstellar.orca-rebuild.plist
```

Check it works with `launchctl kickstart -p gui/"$(id -u)"/com.interstellar.orca-rebuild`
and read `~/Library/Logs/orca-fork-rebuild.log`; the run also needs the SSH key that can
`git fetch` the fork, so add one with no passphrase or load it into `ssh-agent` before 03:30.
An old `PATH` in the plist is the usual cause of a nightly job that never builds.

Change the nightly time by editing `Hour`/`Minute` in that plist, then
`launchctl bootout gui/"$(id -u)" ~/Library/LaunchAgents/com.interstellar.orca-rebuild.plist`
and bootstrap it again.

Pause it without deleting it:

```sh
launchctl bootout gui/"$(id -u)" ~/Library/LaunchAgents/com.interstellar.orca-rebuild.plist
```

Resume by bootstrapping the same plist again.

### 4. First install

```sh
~/.orca-fork-build/orca/config/fork/rebuild-and-install.sh --no-push   # builds, does not push
```

Or wait for the nightly run. Either way you get "Fork build ready". Then:

1. Quit Orca (Cmd-Q). The install refuses while Orca is running so live terminals and agents
   are not killed.
2. Run the command from the notification (or by hand):
   `~/.orca-fork-build/orca/config/fork/install-built-app.sh`
3. It copies the new app to `Orca.app.new` first, renames the installed app aside, then
   renames the staged copy into place and relaunches. If any step fails it puts the old app
   back, so a failed install never leaves you without an Orca. The previous app is kept as
   `/Applications/Orca.previous.app`, and an older rollback copy is deleted only after the new
   app is fully in place. The bundle id stays `com.stablyai.orca`, so your profile, settings,
   sessions and pairings are kept.

Check Help > About shows a `-local.<timestamp>.<commit>` version and Settings > Integrations
shows Dart.

## On demand

```sh
~/.orca-fork-build/orca/config/fork/rebuild-and-install.sh            # mac, merges, gates, builds, pushes
~/.orca-fork-build/orca/config/fork/rebuild-and-install.sh --dry-run  # same, but no push and no install
~/.orca-fork-build/orca/config/fork/rebuild-and-install.sh --no-push  # build only
```

Stop paths: a diverged local `main` (the `--ff-only` step), a merge conflict, a failing gate,
or a failing build stops the run, logs `FAIL: <reason>`, sends an "Orca fork rebuild failed"
notification, leaves `main` unmerged (or merged but unpushed) and installs nothing.

The run starts by deleting `dist`, then builds one target for the host architecture:
`dist/mac-arm64/Orca.app` on Apple silicon, `dist/mac/Orca.app` on Intel, and checks the
built binary with `lipo` before it offers to install it. A stale app from an earlier build
can therefore never be installed as this run's build.

The script unsets `CI`/`GITHUB_ACTIONS`/`GITHUB_SHA` before building. `electron-builder`
treats a CI environment as "publish this build" and demands every architecture slice boot
locally, so an inherited CI marker makes a local build try to upload to GitHub and fail.

To prove a stop path on purpose, set `ORCA_FORK_FORCE_FAILURE`:

```sh
ORCA_FORK_FORCE_FAILURE=gate ~/.orca-fork-build/orca/config/fork/rebuild-and-install.sh --dry-run
ORCA_FORK_FORCE_FAILURE=build ~/.orca-fork-build/orca/config/fork/rebuild-and-install.sh --dry-run
```

Pushing the merged `main` happens only after the build succeeds. That is the one standing
approval this job needs; if you would rather push by hand, run with `--no-push` and push
yourself.

### What has been run for real

Drilled in a scratch clone whose `origin`/`upstream` were local repos, so nothing could reach
GitHub, with `/Applications/Orca.app` left untouched (mtime unchanged):

| Drill                                        | Result                                                                                                                                                                                       |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No new upstream commits                      | merge "Already up to date", gates, `pnpm build:mac`, notified `1.4.214-local.<ts>.<commit>`, exit 0                                                                                          |
| New upstream commit                          | merged `4ff97d18bfb3 -> 18509357c84f`, gates, build stamped with the merge commit, notified, exit 0                                                                                          |
| Merge conflict                               | `git merge --abort`, `FAIL: merge conflict`, notified, exit 1, no `MERGE_HEAD` left, nothing built                                                                                           |
| Failing Dart test                            | stopped at `gate: pnpm test src/main/dart` with `FAIL: Dart tests failed`, notified, exit 1, nothing built                                                                                   |
| `ORCA_FORK_FORCE_FAILURE=gate`               | `FAIL: forced gate failure`, notified, exit 1                                                                                                                                                |
| Host-arch install (fake app bundle)          | picks `dist/mac-arm64`, swaps in, keeps the old app as `Orca.previous.app`; a failing `cp` and a failing swap-in each restored the old app                                                   |
| Server swap (stubbed `sudo`/`systemctl`)     | zero clients → stage, stop, swap, restart, keep `.previous`; restart failure → old tree restored; `stop` failure → nothing swapped; no passwordless sudo → stops before touching `/opt/Orca` |
| Server session probe                         | bound port read from `orca-runtime.json`; 2 connections → notify only; `ss` error, `ss` missing, and unknown port → notify only, no restart                                                  |
| Fast-forward then merge (local bare remotes) | `origin/main` taken by `--ff-only`, then `upstream/main` merged; a divergent local `main` stopped the run before any upstream merge                                                          |

Server mode is the exception: it has never been run (see below).

## Logs

`~/Library/Logs/orca-fork-rebuild.log`. The launchd job writes the same path through
`StandardOutPath`/`StandardErrorPath`. Server mode logs to `~/orca-fork-rebuild.log` unless
`ORCA_FORK_LOG` says otherwise.

## Rollback

One step back (the previous install is kept until the next successful install):

```sh
# quit Orca first
rm -rf /Applications/Orca.app
mv /Applications/Orca.previous.app /Applications/Orca.app
open /Applications/Orca.app
```

`Orca.previous.app` always sits beside whatever `ORCA_FORK_APP_PATH` points at, so if you
installed somewhere other than `/Applications`, adjust both paths the same way.

If nothing was installed yet, there is nothing to roll back.

## Going back to upstream Orca

1. Pause the launchd job (above).
2. Download the current stable installer from <https://github.com/stablyai/orca/releases> and
   drag it to `/Applications`, replacing `Orca.app`. Your profile is kept: the bundle id is
   the same. Stably's updater takes over again on the next release, which is exactly what you
   asked for here.
3. Optional cleanup: delete `~/.orca-fork-build`, `~/Library/Logs/orca-fork-rebuild.log`, and
   `~/Library/LaunchAgents/com.interstellar.orca-rebuild.plist`.

Note that upstream Orca has no Dart provider, so Dart tasks, the `orca dart` CLI and the
`orca-dart` skill disappear from the app; nothing else in your profile changes.

## Server mode (UNVERIFIED — needs your go, never run by this lane)

`--mode server` is written for "Orca Ubu 7of9", which runs the packaged Linux app from
`/opt/Orca` under systemd `orca-serve.service`. It has never been run against a real server.
Everything below is unverified except that the script parses and refuses arguments correctly.

Run it on the server itself (SSH in first), from a clone of the fork's `main` at a path of
your choosing, after `main` has been pushed from the Mac:

```sh
cd ~/.orca-fork-build/orca && git pull --ff-only
config/fork/rebuild-and-install.sh --mode server
```

Server mode never pushes: it builds what the Mac already pushed. Pass `--push` only if you
really mean to push from the server.

What it does: fast-forward from `origin/main`, merge `upstream/main`, `pnpm install
--frozen-lockfile`, `pnpm tc`, the Dart tests, the desktop build, and electron-builder
`--linux dir --<host arch>`. Only the unpacked tree is built (`dist/linux-unpacked` on x64,
`dist/linux-arm64-unpacked` on arm64), so the server does not need the deb/rpm packaging
tools. The arch comes from `uname -m` and must match the host; a wrong arch builds a binary
that cannot start there.

Unverified on the server and easy to get wrong:

- **Install layout.** The script treats the unpacked tree as the new `/opt/Orca` and copies
  it with `cp -a`. If the server install is an unpacked AppImage rather than an
  electron-builder `linux-unpacked` tree, the layout differs; confirm with `ls /opt/Orca`
  before trusting it.
- **Version stamp.** Server mode sets `ORCA_LOCAL_BUILD_VERSION` (the same
  `-local.<timestamp>.<commit>` string `build:mac` uses) so the fork guard applies there too.
  The Linux path does not stamp it the way `build-mac-local.mjs` does for macOS; this is the
  one piece of the mode most likely to need a fix after a first run.
- **Active-session detection.** The script reads the port `orca serve` actually bound from
  the profile's `orca-runtime.json` (`$HOME/.config/orca` by default, or
  `$ORCA_USER_DATA_PATH`), not the 6768 default, because serve moves to another port when
  6768 is taken. It counts established connections on that port with `ss`. It **fails
  closed**: when the port cannot be read, when `ss` is missing, or when `ss` errors, it only
  notifies and does not restart. That count is still only a client check — an idle paired
  client or a detached terminal with no socket open is invisible to it.
- **Re-pairing.** Not needed in theory because the profile under the server's user data is
  untouched; unverified.
- **Install and restart.** The swap is staged: `cp -a` to `/opt/Orca.new`, stop the unit,
  rename `/opt/Orca` to `/opt/Orca.previous.new`, rename the stage into place, restart, then
  keep the old tree as `/opt/Orca.previous`. A failed copy, swap or restart restores the old
  tree and starts the unit again. All of it runs as `sudo -n`, so a nightly run fails loudly
  instead of hanging on a password prompt; grant passwordless sudo for the two `systemctl`
  commands and the file moves, or run it by hand.

Because a server run restarts your remote Orca, run it only when you say so, and prefer a
time when nothing is connected.

## Updater guard (why a Stably release cannot land on the fork)

A `pnpm build:mac` build carries version `<package version>-local.<timestamp>.<commit>`.
`isForkBuild()` in `src/main/updater/updater-menu-checks.ts` matches that suffix, and:

- `setupAutoUpdater` returns before `setFeedURL`, so no Stably feed is ever configured — for
  the window, headless serve, or the supervised serve handoff.
- "Check for Updates" (menu, tray, Settings) shows "This is a fork build; updates come from
  the rebuild job" instead of checking.
- The remote-server update path reports the updater as uninitialized, so a paired client
  cannot push a Stably Linux package onto the server either.
- A release build (version without the suffix) takes exactly the old code path.

Covered by `src/main/updater.fork-build-guard.test.ts`.

**Only `pnpm build:mac` and the rebuild script produce a protected fork build.** The guard
keys on the `-local.` version suffix, which those two stamp. `pnpm build:linux` on a Mac, a
`build:unpack` tree, `ORCA_MAC_RELEASE=1`, the CI release workflow, and any plain
`electron-builder` run produce a normal release version and are **not** protected: Stably's
feed would replace them. Server mode stamps the suffix itself for the same reason, so the
Linux package it installs is protected too.

## Out of scope here

A signed, notarized fork release feed, a self-built mobile app, and sending Dart upstream live
in other lanes; see issue #9.
