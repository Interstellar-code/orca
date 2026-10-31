# Fork rebuild: running the Dart fork as your everyday Orca

`Interstellar-code/orca` is your fork of `stablyai/orca`. It carries the Dart task provider,
which upstream does not have. This directory builds the fork on your Mac and on the remote
server, keeps it level with upstream, and makes sure the packaged updater can never replace
it with a Stably release.

Nothing here touches `/Applications/Orca.app`, your `~/Library/LaunchAgents`, or the server.
You install the launchd job and run the install command yourself.

## What the pieces do

| Path                                  | Role                                                                                                                                                 |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rebuild-and-install.sh`              | Merge `upstream/main` into the fork's `main`, run the Dart gates, build, push, notify. `--mode mac` (default) or `--mode server`.                    |
| `install-built-app.sh`                | The Mac install command the notification points at. Quits-safe: refuses while Orca runs.                                                             |
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
3. It moves `/Applications/Orca.app` to `/Applications/Orca.previous.app`, copies the new
   app in, and relaunches. The bundle id stays `com.stablyai.orca`, so your profile, settings,
   sessions and pairings are kept.

Check Help > About shows a `-local.<timestamp>.<commit>` version and Settings > Integrations
shows Dart.

## On demand

```sh
~/.orca-fork-build/orca/config/fork/rebuild-and-install.sh            # mac, merges, gates, builds, pushes
~/.orca-fork-build/orca/config/fork/rebuild-and-install.sh --dry-run  # same, but no push and no install
~/.orca-fork-build/orca/config/fork/rebuild-and-install.sh --no-push  # build only
```

Stop paths: a merge conflict, a failing gate, or a failing build stops the run, logs
`FAIL: <reason>`, sends an "Orca fork rebuild failed" notification, leaves `main` unmerged
(or merged but unpushed) and installs nothing.

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
config/fork/rebuild-and-install.sh --mode server --no-push
```

What it does: fetch, merge `upstream/main`, `pnpm install --frozen-lockfile`, `pnpm tc`, the
Dart tests, `pnpm build:linux` (electron-builder `--linux` with the repo config, i.e.
AppImage + deb + rpm), then it treats `dist/linux-unpacked` as the new install tree.

Unverified on the server and easy to get wrong:

- **Build target.** The script assumes `pnpm build:linux` writes `dist/linux-unpacked` and
  that copying that tree over `/opt/Orca` reproduces the current install. If the server
  install is an unpacked AppImage rather than `linux-unpacked`, this is wrong; confirm the
  layout with `ls /opt/Orca` before trusting it.
- **Version stamp.** Server mode sets `ORCA_LOCAL_BUILD_VERSION` (the same
  `-local.<timestamp>.<commit>` string `build:mac` uses) so the fork guard applies there too.
  The Linux path does not stamp it the way `build-mac-local.mjs` does for macOS; this is the
  one piece of the mode most likely to need a fix after a first run.
- **Active-session detection.** The script counts established TCP connections on port 6768
  (`ss ... sport = :6768`) and, when any exist, notifies instead of restarting. That is a
  heuristic: an idle paired client with no open socket is invisible to it.
- **Re-pairing.** Not needed in theory because the profile under the server's user data is
  untouched; unverified.
- **Restart.** `systemctl restart orca-serve.service` runs under `sudo`; the user needs
  passwordless sudo for that unit, or the run stops at that command.

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

## Out of scope here

A signed, notarized fork release feed, a self-built mobile app, and sending Dart upstream live
in other lanes; see issue #9.
