#!/usr/bin/env bash
# Installs the .app the rebuild job built. Notify-only by design: the user runs this,
# and it refuses while Orca is open so live terminals and agents are never killed.
set -euo pipefail

CLONE=${ORCA_FORK_CLONE:-$HOME/.orca-fork-build/orca}
TARGET=${ORCA_FORK_APP_PATH:-/Applications/Orca.app}

app=$(find "$CLONE/dist" -maxdepth 2 -name 'Orca.app' -print -quit)
[[ -n $app && -d $app ]] || {
  echo "No Orca.app under $CLONE/dist; run config/fork/rebuild-and-install.sh first." >&2
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
echo "Installing $version from $app"
rm -rf /Applications/Orca.previous.app
mv "$TARGET" /Applications/Orca.previous.app
cp -R "$app" "$TARGET"
echo "Installed. Roll back by quitting Orca and running:"
echo "  rm -rf /Applications/Orca.app && mv /Applications/Orca.previous.app /Applications/Orca.app"
open "$TARGET"
