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

## Open decisions

- Apple Developer ID ($99/yr): would give true auto-update and no Gatekeeper warning. Not decided.
