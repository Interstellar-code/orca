#!/usr/bin/env bash
# Installs the .app the rebuild job built. Notify-only by design: the user runs this,
# and it refuses while Orca is open so live terminals and agents are never killed.
set -euo pipefail

CLONE=${ORCA_FORK_CLONE:-$HOME/.orca-fork-build/orca}
TARGET=${ORCA_FORK_APP_PATH:-/Applications/Orca.app}
PREVIOUS="$(dirname "$TARGET")/Orca.previous.app"
# Stage and retire beside the target so every swap is a rename on one filesystem.
STAGE="$TARGET.new"
RETIRED="$PREVIOUS.new"

# electron-builder writes mac/ for the default (x64) arch and mac-arm64/ for arm64.
case "$(uname -m)" in
  arm64) MAC_DIR=mac-arm64 ;;
  x86_64) MAC_DIR=mac ;;
  *)
    echo "Unsupported machine $(uname -m); this installer only handles macOS hosts." >&2
    exit 1
    ;;
esac

app="$CLONE/dist/$MAC_DIR/Orca.app"
[[ -d $app ]] || {
  echo "No Orca.app at $app; run config/fork/rebuild-and-install.sh first." >&2
  exit 1
}
[[ -d $TARGET ]] || {
  echo "No Orca.app at $TARGET to replace." >&2
  exit 1
}

if pgrep -x Orca >/dev/null 2>&1; then
  echo 'Quit Orca first (Cmd-Q), then run this again.' >&2
  exit 1
fi

version=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$app/Contents/Info.plist")

swapped=0
restore() {
  local status=$?
  trap - EXIT
  if [[ $swapped == 1 ]]; then
    echo "Install failed; restoring $TARGET from $RETIRED" >&2
    rm -rf "$TARGET"
    [[ -d $RETIRED ]] && mv "$RETIRED" "$TARGET"
  fi
  rm -rf "$STAGE"
  exit "$status"
}
trap restore EXIT

echo "Installing $version from $app"
rm -rf "$STAGE" "$RETIRED"
cp -R "$app" "$STAGE"
mv "$TARGET" "$RETIRED"
swapped=1
mv "$STAGE" "$TARGET"
# The new app is in place, so a later cleanup failure must not roll it back.
swapped=0
# The older rollback copy goes only after the new app is fully in place.
if ! rm -rf "$PREVIOUS"; then
  echo "Kept the old app at $RETIRED (could not clear $PREVIOUS)." >&2
elif ! mv "$RETIRED" "$PREVIOUS"; then
  echo "Kept the old app at $RETIRED (could not replace $PREVIOUS)." >&2
fi
trap - EXIT

echo "Installed. Roll back by quitting Orca and running:"
echo "  rm -rf \"$TARGET\" && mv \"$PREVIOUS\" \"$TARGET\""
open "$TARGET"
