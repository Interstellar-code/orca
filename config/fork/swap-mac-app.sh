#!/bin/bash
# Fork-only: quit Orca, install the built app, reopen it, and drop the backup (Rohit keeps none).
# Run detached from a terminal Orca does not own, e.g. Claude Code's `!` prompt:
#   nohup config/fork/swap-mac-app.sh <log> >/dev/null 2>&1 &
LOG=${1:?usage: swap-mac-app.sh <log-file>}
CLONE=${ORCA_FORK_CLONE:-$HOME/.orca-fork-build/orca}
exec >>"$LOG" 2>&1
echo "$(date) quitting Orca"
sleep 5
osascript -e 'tell application "Orca" to quit'
for _ in $(seq 1 90); do pgrep -x Orca >/dev/null || break; sleep 1; done
if pgrep -x Orca >/dev/null; then
  echo "$(date) Orca still running after 90s; aborting, nothing replaced"
  exit 1
fi
echo "$(date) Orca quit; installing"
if "$CLONE/config/fork/install-built-app.sh"; then
  rm -rf /Applications/Orca.previous.app
  echo "$(date) INSTALL OK $(defaults read /Applications/Orca.app/Contents/Info.plist CFBundleShortVersionString)"
else
  echo "$(date) INSTALL FAILED; reopening the previous app"
fi
open /Applications/Orca.app
