#!/usr/bin/env bash
# Fork-only rebuild: merges upstream/main into the fork's main, runs the Dart gates,
# builds, and notifies. Never replaces a running app.
set -euo pipefail

MODE=mac
DRY_RUN=0
# Server mode only installs what was already pushed, so it never pushes by default.
PUSH=1
PUSH_SET=0

FORK_REMOTE_URL_MATCH='github.com[:/]Interstellar-code/orca'
UPSTREAM_REMOTE_URL_MATCH='github.com[:/]stablyai/orca'
UPSTREAM_BRANCH=upstream/main
FORK_BRANCH=main
# Lane B's component-test paths land here once that lane reports them.
LANE_B_TESTS=()
DART_TEST_PATHS=(src/main/dart src/shared/dart)

log() { printf '%s %s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')" "$*"; }

notify() {
  local title=$1 body=$2 prefix=''
  [[ $DRY_RUN == 1 ]] && prefix='[dry run] '
  log "NOTIFY: $title — ${prefix}${body}"
  case "$(uname -s)" in
    Darwin)
      # argv keeps quotes, backslashes and $ in the text literal.
      osascript - "$title" "${prefix}${body}" <<'EOF' || log 'WARN: osascript notification failed'
on run argv
  display notification (item 2 of argv) with title (item 1 of argv)
end run
EOF
      ;;
    Linux)
      if command -v notify-send >/dev/null 2>&1; then
        notify-send "$title" "${prefix}${body}"
      else
        log 'WARN: notify-send unavailable; logged only'
      fi
      ;;
  esac
}

fail() {
  log "FAIL: $*"
  notify 'Orca fork rebuild failed' "$*"
  exit 1
}

usage() {
  cat <<'EOF'
Usage: config/fork/rebuild-and-install.sh [options]

  --mode mac|server   mac (default): build the macOS app. server: build the Linux app
                      and install it under /opt/Orca under systemd.
  --clone <path>      Build clone/worktree of the fork (default $ORCA_FORK_CLONE or
                      ~/.orca-fork-build/orca). Never the checkout you edit in.
  --dry-run           Do everything except push and install; prefix notifications.
  --no-push           Skip pushing the merged main to the fork.
  --push              Push even in server mode (default: server never pushes).

Server mode needs passwordless sudo for the /opt/Orca swap and the unit restart; it
runs sudo -n, so a nightly run fails loudly instead of waiting for a password.

Drill switch, to prove a stop path on purpose:
  ORCA_FORK_FORCE_FAILURE=gate|build
EOF
}

# --- platform output dirs -----------------------------------------------------
# electron-builder suffixes its output directory by arch: mac/ is x64, mac-arm64/
# is arm64, linux-unpacked/ is x64, linux-arm64-unpacked/ is arm64.

mac_output() {
  case "$(uname -m)" in
    arm64) MAC_DIR=mac-arm64 MAC_ARCH=arm64 ;;
    x86_64) MAC_DIR=mac MAC_ARCH=x64 ;;
    *) fail "unsupported machine $(uname -m) for a macOS build" ;;
  esac
}

linux_output() {
  case "$(uname -m)" in
    aarch64 | arm64) LINUX_ARCH=arm64 LINUX_DIR=linux-arm64-unpacked ;;
    x86_64 | amd64) LINUX_ARCH=x64 LINUX_DIR=linux-unpacked ;;
    *) fail "unsupported machine $(uname -m) for a Linux build" ;;
  esac
  # The installed tree runs here, so a requested cross-arch build could never start.
  if [[ -n ${ORCA_LINUX_BUILD_ARCH:-} && $ORCA_LINUX_BUILD_ARCH != "$LINUX_ARCH" ]]; then
    fail "ORCA_LINUX_BUILD_ARCH=$ORCA_LINUX_BUILD_ARCH does not match this host ($LINUX_ARCH)"
  fi
}

# --- server install -----------------------------------------------------------
# Reads the port `orca serve` actually bound. It moves off the 6768 default when
# that port is taken, so assuming the default would probe nothing.

serve_port() {
  if [[ -n ${ORCA_FORK_SERVE_PORT:-} ]]; then
    printf '%s' "$ORCA_FORK_SERVE_PORT"
    return 0
  fi
  local metadata=${ORCA_FORK_RUNTIME_METADATA:-${ORCA_USER_DATA_PATH:-${XDG_CONFIG_HOME:-$HOME/.config}/orca}/orca-runtime.json}
  [[ -r $metadata ]] || return 0
  node -e '
const fs = require("node:fs")
const meta = JSON.parse(fs.readFileSync(process.argv[1], "utf8"))
const ws = (meta.transports || []).find((t) => t && t.kind === "websocket")
const port = ws ? new URL(ws.endpoint).port : ""
process.stdout.write(/^[0-9]+$/.test(port) ? port : "")
' "$metadata" 2>/dev/null || true
}

# Prints the client count and returns 0 only when the probe proved the count.
# Reasons go to stderr so the caller can capture just the number.
connected_clients() {
  local port=$1
  if [[ -z $port ]]; then
    log 'the serve port is unknown; cannot prove no client is connected' >&2
    return 1
  fi
  if ! command -v ss >/dev/null 2>&1; then
    log 'ss is unavailable; cannot prove no client is connected' >&2
    return 1
  fi
  local listing line count=0
  listing=$(ss -Htn state established "( sport = :$port )" 2>/dev/null) || return 1
  while IFS= read -r line; do
    [[ -n ${line//[[:space:]]/} ]] && count=$((count + 1))
  done <<<"$listing"
  printf '%s' "$count"
}

# Replaces the install tree with $source in two renames, restoring the old tree if
# the copy, the swap or the service restart fails. sudo -n keeps a nightly run from
# blocking on a password prompt. The rollback state is file-scope because an EXIT
# trap cannot see function locals.
INSTALL_DIR=''
SYSTEMD_UNIT=''
SWAP_STAGE=''
SWAP_RETIRED=''
SWAP_PREVIOUS=''
SWAPPED=0
STOPPED=0

restore_server_install() {
  local status=$?
  trap - EXIT
  if [[ $SWAPPED == 1 ]]; then
    log 'install failed; restoring the previous install tree'
    sudo -n rm -rf "$INSTALL_DIR" || true
    if sudo -n mv "$SWAP_RETIRED" "$INSTALL_DIR"; then
      sudo -n systemctl restart "$SYSTEMD_UNIT" ||
        log "WARN: restored $INSTALL_DIR but $SYSTEMD_UNIT did not restart"
      SWAPPED=0
    else
      log "WARN: restore failed; $INSTALL_DIR is missing (copy back $SWAP_RETIRED by hand)"
    fi
  elif [[ $STOPPED == 1 ]]; then
    sudo -n systemctl start "$SYSTEMD_UNIT" ||
      log "WARN: $SYSTEMD_UNIT is stopped and did not start again"
  fi
  sudo -n rm -rf "$SWAP_STAGE" || true
  exit "$status"
}

swap_server_install() {
  local source=$1 version=$2 commit=$3 port=$4
  INSTALL_DIR=${ORCA_FORK_LINUX_INSTALL_DIR:-/opt/Orca}
  SYSTEMD_UNIT=${ORCA_FORK_SYSTEMD_UNIT:-orca-serve.service}
  # Stage and retire beside the target so every swap is a rename on one filesystem.
  SWAP_STAGE="$INSTALL_DIR.new"
  SWAP_RETIRED="$INSTALL_DIR.previous.new"
  SWAP_PREVIOUS="$INSTALL_DIR.previous"
  SWAPPED=0
  STOPPED=0

  sudo -n true 2>/dev/null ||
    fail "passwordless sudo is not available, so $INSTALL_DIR cannot be replaced unattended"
  trap restore_server_install EXIT

  log "installing $version into $INSTALL_DIR"
  # An earlier failed cleanup may have left the only rollback copy here.
  if sudo -n test -e "$SWAP_RETIRED"; then
    local leftover="$SWAP_RETIRED.$(date +%Y%m%d%H%M%S).$$"
    sudo -n mv "$SWAP_RETIRED" "$leftover" ||
      fail "could not preserve the old install at $SWAP_RETIRED"
    log "WARN: preserved an earlier install at $leftover; inspect or restore it"
  fi
  sudo -n rm -rf "$SWAP_STAGE" || fail 'could not clear the staging path'
  sudo -n cp -a "$source" "$SWAP_STAGE" || fail 'copy into the staging path failed'
  sudo -n systemctl stop "$SYSTEMD_UNIT" || fail "systemctl stop $SYSTEMD_UNIT failed"
  STOPPED=1
  sudo -n mv "$INSTALL_DIR" "$SWAP_RETIRED" || fail 'could not retire the running install'
  SWAPPED=1
  sudo -n mv "$SWAP_STAGE" "$INSTALL_DIR" || fail 'could not move the new install into place'
  sudo -n systemctl restart "$SYSTEMD_UNIT" || fail "systemctl restart $SYSTEMD_UNIT failed"

  # Type=simple reports success as soon as the process spawns, so prove the new build
  # stays up and serves its port before retiring the rollback tree. A crash loop can
  # answer the port for a few seconds, so the second check runs after a settle delay.
  local attempts=20 ready=0 attempt
  for ((attempt = 1; attempt <= attempts; attempt++)); do
    if sudo -n systemctl is-active --quiet "$SYSTEMD_UNIT"; then
      if [[ -z $port || -n $(ss -Hltn "sport = :$port" 2>/dev/null || true) ]]; then
        ready=1
        break
      fi
    fi
    sleep 0.5
  done
  [[ $ready == 1 ]] ||
    fail "$SYSTEMD_UNIT did not stay active${port:+ and listen on port $port} within 10s"
  sleep 5
  sudo -n systemctl is-active --quiet "$SYSTEMD_UNIT" ||
    fail "$SYSTEMD_UNIT stopped within 5s of restarting, so the new build cannot start"
  [[ -z $port || -n $(ss -Hltn "sport = :$port" 2>/dev/null || true) ]] ||
    fail "$SYSTEMD_UNIT stopped listening on port $port within 5s of restarting"
  # The older rollback copy goes only after the new install is running.
  if ! sudo -n rm -rf "$SWAP_PREVIOUS"; then
    log "WARN: could not clear $SWAP_PREVIOUS; kept the old install at $SWAP_RETIRED"
  elif ! sudo -n mv "$SWAP_RETIRED" "$SWAP_PREVIOUS"; then
    log "WARN: could not keep $SWAP_PREVIOUS for rollback; old install remains at $SWAP_RETIRED"
  fi
  SWAPPED=0
  STOPPED=0
  trap - EXIT
  notify 'Orca server updated' "Orca $version from $commit; $SYSTEMD_UNIT restarted"
}

install_server_build() {
  local version=$1 commit=$2
  local install_dir=${ORCA_FORK_LINUX_INSTALL_DIR:-/opt/Orca}
  local unit=${ORCA_FORK_SYSTEMD_UNIT:-orca-serve.service}
  local port count proven=0
  linux_output

  port=$(serve_port)
  # Fail closed: restart only when a probe proves no client is connected. A detached
  # terminal with no client attached is invisible here, so this is a client check.
  count=$(connected_clients "$port") && proven=1

  if [[ $DRY_RUN == 1 ]]; then
    notify 'Fork build ready (server)' \
      "Orca $version from $commit is built; dry run: not installed under $install_dir"
  elif [[ $proven != 1 ]]; then
    notify 'Fork build ready (server)' \
      "Orca $version from $commit is built; the active-session check could not confirm port ${port:-unknown}, so $unit was not restarted"
  elif [[ $count -gt 0 ]]; then
    notify 'Fork build ready (server)' \
      "Orca $version from $commit is built; $count client connection(s) on port $port, so $unit was not restarted"
  else
    swap_server_install "dist/$LINUX_DIR" "$version" "$commit" "$port"
  fi
}

# --- build --------------------------------------------------------------------
# Each builder leaves the version string in built_version.

built_version=''

build_mac() {
  mac_output
  pnpm build:mac || fail 'pnpm build:mac failed'
  local app="dist/$MAC_DIR/Orca.app"
  [[ -d $app ]] || fail "build produced no $app"
  local archs
  archs=$(lipo -archs "$app/Contents/MacOS/Orca") || fail 'could not read the built app architecture'
  [[ " $archs " == *" $MAC_ARCH "* ]] || fail "built app is '$archs', not $MAC_ARCH"
  built_version=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$app/Contents/Info.plist") ||
    fail 'could not read the built app version'
}

build_linux() {
  local commit=$1
  linux_output
  built_version=$(ORCA_BUILD_COMMIT=$commit node --input-type=module -e "
import { createLocalBuildVersion } from '$PWD/config/scripts/build-mac-local.mjs'
import { readFileSync } from 'node:fs'
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
console.log(createLocalBuildVersion(pkg.version, Date.now(), process.env.ORCA_BUILD_COMMIT))
") || fail 'could not compute the local build version'
  export ORCA_BUILD_COMMIT=$commit ORCA_LOCAL_BUILD_VERSION=$built_version
  log "local build version $built_version"
  # Only the unpacked tree is installed; deb/rpm need packaging tools this host may lack.
  pnpm run build:desktop || fail 'pnpm run build:desktop failed'
  pnpm run ensure:electron-runtime || fail 'pnpm run ensure:electron-runtime failed'
  pnpm exec electron-builder --config config/electron-builder.config.cjs --linux dir "--$LINUX_ARCH" ||
    fail 'electron-builder --linux dir failed'
  [[ -d "dist/$LINUX_DIR" ]] || fail "build produced no dist/$LINUX_DIR"
}

# Takes the pushed fork main, then upstream's. Both halves must succeed: the server
# installs what the Mac pushed, and a divergent local main is a human problem.
sync_main() {
  log 'fetching origin and upstream'
  git fetch --prune origin || fail 'git fetch origin failed'
  git fetch --prune upstream || fail 'git fetch upstream failed'

  log "fast-forwarding $FORK_BRANCH from origin/$FORK_BRANCH"
  git merge --ff-only "origin/$FORK_BRANCH" ||
    fail "local $FORK_BRANCH and origin/$FORK_BRANCH diverged; reconcile them by hand"

  local before after
  before=$(git rev-parse HEAD)
  log "merging $UPSTREAM_BRANCH into $FORK_BRANCH"
  if ! git merge --no-ff --no-edit "$UPSTREAM_BRANCH"; then
    git merge --abort || true
    fail "merge conflict with $UPSTREAM_BRANCH; nothing built or installed"
  fi

  after=$(git rev-parse HEAD)
  if [[ $after == "$before" ]]; then
    log 'no new upstream commits; rebuilding the current main'
  else
    log "merged: $before -> $after"
  fi
}

main() {
  local clone=${ORCA_FORK_CLONE:-$HOME/.orca-fork-build/orca}
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --mode) MODE=${2:?}; shift 2 ;;
      --clone) clone=${2:?}; shift 2 ;;
      --dry-run) DRY_RUN=1; PUSH=0; shift ;;
      --no-push) PUSH=0; shift ;;
      --push) PUSH=1; PUSH_SET=1; shift ;;
      -h | --help) usage; return 0 ;;
      *) fail "unknown argument: $1" ;;
    esac
  done

  case "$MODE" in
    mac) LOG_FILE=${ORCA_FORK_LOG:-$HOME/Library/Logs/orca-fork-rebuild.log} ;;
    server)
      LOG_FILE=${ORCA_FORK_LOG:-$HOME/orca-fork-rebuild.log}
      # The server builds what the Mac already pushed; it never pushes on its own.
      [[ $PUSH_SET == 1 || $DRY_RUN == 1 ]] || PUSH=0
      ;;
    *) fail "unknown --mode: $MODE" ;;
  esac
  mkdir -p "$(dirname "$LOG_FILE")"
  exec > >(tee -a "$LOG_FILE") 2>&1

  log "orca fork rebuild: mode=$MODE dry_run=$DRY_RUN push=$PUSH clone=$clone log=$LOG_FILE"

  # electron-builder treats CI as publish-on-build and demands every slice boot here; this job is a local build.
  unset CI GITHUB_ACTIONS GITHUB_SHA

  [[ -d "$clone/.git" || -f "$clone/.git" ]] ||
    fail "no git clone at $clone (create one with: git clone git@github.com:Interstellar-code/orca.git $clone)"
  cd "$clone"

  local current_branch
  current_branch=$(git rev-parse --abbrev-ref HEAD)
  [[ $current_branch == "$FORK_BRANCH" ]] || fail "clone is on '$current_branch', expected '$FORK_BRANCH'"
  [[ -z "$(git status --porcelain --untracked-files=no)" ]] ||
    fail 'clone has uncommitted changes; commit or discard them first'

  # A push must only ever reach the fork. Without one, remotes are read-only, so drills may use local repos.
  if [[ $PUSH == 1 ]]; then
    local origin_url upstream_url
    origin_url=$(git remote get-url origin 2>/dev/null || true)
    [[ $origin_url =~ $FORK_REMOTE_URL_MATCH ]] ||
      fail "origin is '$origin_url', not the Interstellar-code/orca fork"
    upstream_url=$(git remote get-url upstream 2>/dev/null || true)
    [[ $upstream_url =~ $UPSTREAM_REMOTE_URL_MATCH ]] ||
      fail "upstream is '$upstream_url', not stablyai/orca"
  else
    log 'push disabled: origin/upstream URL check skipped (nothing can be pushed)'
  fi

  sync_main

  log 'installing dependencies (frozen lockfile)'
  # macOS packaging needs both slices' native variants (as `install:release` does); the server builds one Linux arch.
  if [[ $MODE == mac ]]; then
    pnpm install --frozen-lockfile --cpu=current,x64,arm64 ||
      fail 'pnpm install --frozen-lockfile --cpu=current,x64,arm64 failed'
  else
    pnpm install --frozen-lockfile --cpu=current || fail 'pnpm install --frozen-lockfile failed'
  fi
  # The desktop build bundles the mobile web app from mobile/, which has its own lockfile.
  pnpm -C mobile install --frozen-lockfile || fail 'pnpm -C mobile install --frozen-lockfile failed'

  log 'gate: pnpm tc'
  pnpm tc || fail 'typecheck failed'

  local dart_paths=()
  local path
  for path in "${DART_TEST_PATHS[@]}"; do
    [[ -d $path ]] && dart_paths+=("$path")
  done
  if [[ ${#dart_paths[@]} -eq 0 ]]; then
    log "no Dart tests found: none of ${DART_TEST_PATHS[*]} exist yet"
  else
    log "gate: pnpm test ${dart_paths[*]}"
    pnpm test "${dart_paths[@]}" || fail 'Dart tests failed'
  fi

  if [[ ${#LANE_B_TESTS[@]} -eq 0 ]]; then
    log 'Lane B component tests not configured yet; that gate is skipped'
  else
    log "gate: pnpm test ${LANE_B_TESTS[*]}"
    pnpm test "${LANE_B_TESTS[@]}" || fail 'Lane B component tests failed'
  fi

  log "building ($MODE)"
  if [[ ${ORCA_FORK_FORCE_FAILURE:-} == gate ]]; then
    log 'drill: forcing a gate failure'
    fail 'forced gate failure (ORCA_FORK_FORCE_FAILURE=gate)'
  fi
  if [[ ${ORCA_FORK_FORCE_FAILURE:-} == build ]]; then
    log 'drill: forcing a build failure'
    fail 'forced build failure (ORCA_FORK_FORCE_FAILURE=build)'
  fi
  # A stale artifact must never be installed as this run's build.
  rm -rf dist

  local commit version
  commit=$(git rev-parse --short=12 HEAD)
  if [[ $MODE == mac ]]; then
    build_mac
  else
    build_linux "$commit"
  fi
  version=$built_version
  log "built Orca $version from $commit"

  if [[ $PUSH == 1 ]]; then
    log "pushing $FORK_BRANCH to origin"
    git push origin "$FORK_BRANCH" || fail 'git push origin main failed (build kept, nothing installed)'
  else
    log 'push skipped'
  fi

  if [[ $MODE == mac ]]; then
    notify 'Fork build ready' \
      "Orca $version from $commit is built. Quit Orca, then run: $clone/config/fork/install-built-app.sh"
  else
    install_server_build "$version" "$commit"
  fi

  log 'done'
}

if [[ ${BASH_SOURCE[0]} == "$0" ]]; then
  main "$@"
fi
