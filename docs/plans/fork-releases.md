# Fork releases and updates

Status: draft, not started. Owner: Rohit. Each task below is written so it can be pasted as a worker prompt.

## Goal

Replace the lost Stably auto-update with fork-owned updates: GitHub Actions merges upstream,
checks and builds; the Mac installs with one click; Ubu updates itself; and every fork build keeps
one stable code signature so macOS permissions survive rebuilds.

## Background (2026-11-03)

- Fork builds are ad-hoc signed. `pnpm build:mac` left `/Applications/Orca.app` with an invalid
  bundle signature (`codesign --verify` failed: "code has no resources but signature indicates they
  must be present"). macOS then denied the app Local Network access (`EHOSTUNREACH`, no packet
  sent), so every Mac-app call to Ubu failed with `remote_runtime_unavailable`. The saved Local
  Network rule still named Stably's identity `6CX3WHS9HZ.com.stablyai.orca`.
- Hot fix applied by hand: `codesign --force --deep --sign - --identifier com.stablyai.orca
  /Applications/Orca.app`, relaunch. An ad-hoc signature changes with every build, so this must be
  repeated after each install until task 1 lands.
- Stably's release workflows (`release-cut.yml`, `release-mac-build.yml`, `daily-mac-build.yml`)
  run only in `stablyai/orca`, use paid runners and Stably's Apple certificate; they are not reusable as is.
- The fork is public, so GitHub-hosted runners are free.
- Linux builds need Docker for the Wayland clipboard helper (now installed on Ubu).

## Tasks

### 1. Stable signing identity for every fork build (option 2)

- Create one self-signed code-signing certificate on the Mac (keychain, never committed).
- `config/fork/rebuild-and-install.sh` and `install-built-app.sh`: sign the built app with that
  identity (`codesign --force --deep --sign "<identity>" --identifier com.stablyai.orca`), then
  `codesign --verify --deep --strict`; refuse to install on failure.
- Accept: after two consecutive rebuild + installs, the Mac app still reaches Ubu with no new Local
  Network prompt (test: `orca orchestration worker-list --include-remote` shows no
  `host_unavailable`).
- Add an entry to `customization_registry.json` and update `config/fork/README.md` (also fix its
  stale updater paths, see the `fork-updater-guard` registry entry).

### 2. GitHub Actions: merge, check, build and publish fork releases

- New fork-only workflow (guarded `if: github.repository == 'Interstellar-code/orca'`): merge
  `upstream/main`, `pnpm tc`, Dart tests, build macOS arm64 and Linux x64 with the `-local.` fork
  version suffix, publish a GitHub Release with the artifacts.
- Signing in CI depends on task 1's identity (export as a secret) or an Apple Developer ID.
- On merge conflict or failed check: no release, open an issue.

### 3. Mac: notify and one-click install from fork releases

- Small launchd job checks the latest fork release, downloads it, verifies the signature, and
  notifies; install reuses `install-built-app.sh`.

### 4. Ubu: self-update from fork releases

- systemd timer downloads the Linux release and swaps `/opt/Orca` only when no client is connected
  (reuse the server swap in `rebuild-and-install.sh`).

### 5. Version fork builds from the upstream release they contain (decided 2026-11-04)

- Upstream keeps `package.json` on main frozen at `1.4.214`; each release (e.g. `v1.4.248`) is a tag
  on a side commit that bumps the version and is never merged back. So fork builds show `1.4.214`
  even when current, which misleads.
- Fix: at build time, find the newest upstream `vX.Y.Z` tag whose upstream-main base is an ancestor
  of the build commit, and stamp that version (e.g. `1.4.247-fork.<stamp>.<sha>`) into the build
  instead of the stale `package.json` value. Applies to `fork-release.yml` and local builds.
- Release-only fixes on upstream tags (7 on `v1.4.248`) never reach upstream main; decide whether
  the nightly merge should also pick them up.

## Open decisions

- Apple Developer ID ($99/yr): would give true auto-update and no Gatekeeper warning. Not decided.
