#!/usr/bin/env bash
# Fork-only rebuild: merges upstream/main into the fork's main, runs the Dart gates,
# builds, and notifies. Never replaces a running app.
set -euo pipefail

MODE=mac
DRY_RUN=0
PUSH=1

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
      osascript -e "display notification \"${prefix}${body//\"/\\\"}\" with title \"${title//\"/\\\"}\"" ||
        log 'WARN: osascript notification failed'
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
EOF
}

CLONE=${ORCA_FORK_CLONE:-$HOME/.orca-fork-build/orca}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode) MODE=${2:?}; shift 2 ;;
    --clone) CLONE=${2:?}; shift 2 ;;
    --dry-run) DRY_RUN=1; PUSH=0; shift ;;
    --no-push) PUSH=0; shift ;;
    -h|--help) usage; exit 0 ;;
    *) fail "unknown argument: $1" ;;
  esac
done

case "$MODE" in
  mac) LOG_FILE=${ORCA_FORK_LOG:-$HOME/Library/Logs/orca-fork-rebuild.log} ;;
  server) LOG_FILE=${ORCA_FORK_LOG:-$HOME/orca-fork-rebuild.log} ;;
  *) fail "unknown --mode: $MODE" ;;
esac
mkdir -p "$(dirname "$LOG_FILE")"
exec > >(tee -a "$LOG_FILE") 2>&1

log "orca fork rebuild: mode=$MODE dry_run=$DRY_RUN push=$PUSH clone=$CLONE log=$LOG_FILE"

[[ -d "$CLONE/.git" || -f "$CLONE/.git" ]] ||
  fail "no git clone at $CLONE (create one with: git clone git@github.com:Interstellar-code/orca.git $CLONE)"
cd "$CLONE"

current_branch=$(git rev-parse --abbrev-ref HEAD)
[[ $current_branch == "$FORK_BRANCH" ]] || fail "clone is on '$current_branch', expected '$FORK_BRANCH'"
[[ -z "$(git status --porcelain --untracked-files=no)" ]] ||
  fail 'clone has uncommitted changes; commit or discard them first'

# A push must only ever reach the fork. Without one, remotes are read-only, so drills may use local repos.
if [[ $PUSH == 1 ]]; then
  origin_url=$(git remote get-url origin 2>/dev/null || true)
  [[ $origin_url =~ $FORK_REMOTE_URL_MATCH ]] ||
    fail "origin is '$origin_url', not the Interstellar-code/orca fork"
  upstream_url=$(git remote get-url upstream 2>/dev/null || true)
  [[ $upstream_url =~ $UPSTREAM_REMOTE_URL_MATCH ]] ||
    fail "upstream is '$upstream_url', not stablyai/orca"
else
  log 'push disabled: origin/upstream URL check skipped (nothing can be pushed)'
fi

log 'fetching origin and upstream'
git fetch --prune origin || fail 'git fetch origin failed'
git fetch --prune upstream || fail 'git fetch upstream failed'

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

log 'installing dependencies (frozen lockfile)'
# electron-builder packages x64 and arm64 slices, so the frozen install must carry both native variants (as `install:release` does).
pnpm install --frozen-lockfile --cpu=current,x64,arm64 ||
  fail 'pnpm install --frozen-lockfile --cpu=current,x64,arm64 failed'
# The desktop build bundles the mobile web app from mobile/, which has its own lockfile.
pnpm -C mobile install --frozen-lockfile || fail 'pnpm -C mobile install --frozen-lockfile failed'

log 'gate: pnpm tc'
pnpm tc || fail 'typecheck failed'

dart_paths=()
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
if [[ $MODE == mac ]]; then
  pnpm build:mac || fail 'pnpm build:mac failed'
  app=$(find dist -maxdepth 2 -name 'Orca.app' -print -quit)
  [[ -n $app && -d $app ]] || fail 'build produced no Orca.app'
  version=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$app/Contents/Info.plist") ||
    fail 'could not read the built app version'
else
  ORCA_BUILD_COMMIT=$(git rev-parse --short=12 HEAD)
  ORCA_LOCAL_BUILD_VERSION=$(ORCA_BUILD_COMMIT=$ORCA_BUILD_COMMIT node --input-type=module -e "
import { createLocalBuildVersion } from '$PWD/config/scripts/build-mac-local.mjs'
import { readFileSync } from 'node:fs'
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
console.log(createLocalBuildVersion(pkg.version, Date.now(), process.env.ORCA_BUILD_COMMIT))
") || fail 'could not compute the local build version'
  export ORCA_BUILD_COMMIT ORCA_LOCAL_BUILD_VERSION
  log "local build version $ORCA_LOCAL_BUILD_VERSION"
  pnpm build:linux || fail 'pnpm build:linux failed'
  [[ -d dist/linux-unpacked ]] || fail 'build produced no dist/linux-unpacked'
  version=$ORCA_LOCAL_BUILD_VERSION
fi
commit=$(git rev-parse --short=12 HEAD)
log "built Orca $version from $commit"

if [[ $PUSH == 1 ]]; then
  log "pushing $FORK_BRANCH to origin"
  git push origin "$FORK_BRANCH" || fail 'git push origin main failed (build kept, nothing installed)'
else
  log 'push skipped'
fi

if [[ $MODE == mac ]]; then
  notify 'Fork build ready' \
    "Orca $version from $commit is built. Install: quit Orca, then run config/fork/install-built-app.sh"
else
  INSTALL_DIR=${ORCA_FORK_LINUX_INSTALL_DIR:-/opt/Orca}
  SYSTEMD_UNIT=${ORCA_FORK_SYSTEMD_UNIT:-orca-serve.service}
  SERVE_PORT=${ORCA_FORK_SERVE_PORT:-6768}
  active=0
  if command -v ss >/dev/null 2>&1; then
    active=$(ss -Htn state established "( sport = :$SERVE_PORT )" 2>/dev/null | wc -l | tr -d ' ')
  fi
  if [[ $DRY_RUN == 1 ]]; then
    notify 'Fork build ready (server)' \
      "Orca $version from $commit is built; dry run: not installed under $INSTALL_DIR"
  elif [[ ${active:-0} -gt 0 ]]; then
    notify 'Fork build ready (server)' \
      "Orca $version from $commit is built; $active client connection(s) on port $SERVE_PORT, so $SYSTEMD_UNIT was not restarted"
  else
    log "installing $version into $INSTALL_DIR"
    sudo rm -rf "$INSTALL_DIR.previous"
    sudo mv "$INSTALL_DIR" "$INSTALL_DIR.previous"
    sudo cp -a dist/linux-unpacked "$INSTALL_DIR" || fail 'copy into the install directory failed'
    sudo systemctl restart "$SYSTEMD_UNIT" || fail "systemctl restart $SYSTEMD_UNIT failed"
    notify 'Orca server updated' "Orca $version from $commit; $SYSTEMD_UNIT restarted"
  fi
fi

log 'done'
