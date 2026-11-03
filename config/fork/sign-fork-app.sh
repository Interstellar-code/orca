#!/usr/bin/env bash
# Signs a fork Orca.app with the one fork identity, so macOS grants such as Local Network
# access survive rebuilds: they bind to the bundle id plus this certificate, not the build.
#   sign-fork-app.sh <Orca.app>          sign, then check
#   sign-fork-app.sh --check <Orca.app>  check only (exit 1 when not validly fork-signed)
set -euo pipefail

# Must be the certificate's common name: the Authority= check below compares names, not hashes.
IDENTITY=${ORCA_FORK_SIGN_IDENTITY:-Orca Fork Signing}
BUNDLE_ID=com.stablyai.orca

check_only=0
if [[ ${1:-} == --check ]]; then
  check_only=1
  shift
fi
app=${1:-}
[[ -n $app && -d $app ]] || {
  echo "Usage: $0 [--check] <path/to/Orca.app>" >&2
  exit 1
}

check() {
  local details
  codesign --verify --deep --strict "$app" || return 1
  details=$(codesign -dvv "$app" 2>&1) || return 1
  grep -qxF "Identifier=$BUNDLE_ID" <<<"$details" || {
    echo "$app is not signed as $BUNDLE_ID" >&2
    return 1
  }
  grep -qxF "Authority=$IDENTITY" <<<"$details" || {
    echo "$app is not signed by '$IDENTITY'" >&2
    return 1
  }
}

if [[ $check_only == 1 ]]; then
  check
  exit
fi

# Fail fast instead of letting codesign report a vague error deep into a nightly run.
grep -qF "\"$IDENTITY\"" <<<"$(security find-identity -p codesigning)" || {
  echo "No '$IDENTITY' signing identity in the keychain; see 'The fork signing identity' in config/fork/README.md" >&2
  exit 1
}

# --deep skips Contents/Resources, so this helper's Accessibility and Screen Recording grants
# would otherwise stay bound to its build hash. Other Resources binaries are hashed by afterPack.
computer_use="$app/Contents/Resources/Orca Computer Use.app"
if [[ -d $computer_use ]]; then
  codesign --force --deep --sign "$IDENTITY" "$computer_use"
fi
# electron-builder rewrites Info.plist and resources after Electron's seal, so an unsigned
# local build carries a seal macOS rejects.
codesign --force --deep --sign "$IDENTITY" "$app"
check
echo "Signed $app with '$IDENTITY'"
