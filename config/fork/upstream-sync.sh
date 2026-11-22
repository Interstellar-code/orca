#!/usr/bin/env bash
# Fork-only helpers for the upstream-sync skill (.claude/skills/upstream-sync/SKILL.md).
#   report [upstream-ref]          what upstream changed since the last sync, and which registry
#                                  customizations those changes touch (markdown on stdout)
#   release-target <vX.Y.Z>        the upstream-main commit that release was cut from (what to merge)
#   record-release [upstream-ref]  write the newest upstream vX.Y.Z the branch contains to
#                                  config/fork/upstream-release and commit it
#   record-sync <upstream-commit> [merge-commit]
#                                  set customization_registry.json last_upstream_sync to today,
#                                  that upstream commit and the merge commit (default HEAD), and commit
set -euo pipefail

REGISTRY=customization_registry.json
RELEASE_FILE=config/fork/upstream-release

cd "$(git rev-parse --show-toplevel)"

die() {
  printf 'upstream-sync: %s\n' "$*" >&2
  exit 1
}

last_sync_commit() {
  node -e "console.log(JSON.parse(require('fs').readFileSync('$REGISTRY','utf8')).last_upstream_sync.upstream_commit)"
}

report() {
  local upstream=${1:-upstream/main} base head
  git fetch --quiet upstream main || die 'git fetch upstream failed'
  base=$(last_sync_commit)
  git cat-file -e "$base^{commit}" 2>/dev/null || die "last synced upstream commit $base is not in this clone"
  head=$(git rev-parse --short=11 "$upstream")

  local upstream_files fork_files overlap
  upstream_files=$(git -c diff.renameLimit=0 diff --name-only --no-renames "$base" "$upstream")
  fork_files=$(git -c diff.renameLimit=0 diff --name-only --no-renames "$(git merge-base HEAD "$upstream")" HEAD)
  overlap=$(comm -12 <(sort -u <<<"$upstream_files") <(sort -u <<<"$fork_files"))
  # Overlap names are the pre-merge ones; renames (oldest first, per commit) map them to current names.
  local renames
  renames=$(
    git log -M --diff-filter=R --name-status --format= --reverse "$base..$upstream"
    git log -M --diff-filter=R --name-status --format= --reverse "$(git merge-base HEAD "$upstream")..HEAD"
  )

  printf '# Upstream sync report %s\n\n' "$(date +%Y-%m-%d)"
  printf -- '- Last sync: upstream `%s`\n' "$base"
  printf -- '- Upstream now: `%s`, %s new commits\n' "$head" "$(git rev-list --count "$base..$upstream")"
  printf -- '- Fork commits not in upstream: %s\n' "$(git rev-list --count "$upstream..HEAD")"
  printf -- '- Files changed upstream: %s; changed on both sides: %s\n\n' \
    "$(grep -c . <<<"$upstream_files" || true)" "$(grep -c . <<<"$overlap" || true)"

  printf '## Upstream releases since the last sync\n\n'
  git fetch --quiet upstream 'refs/tags/v*:refs/tags/v*' 2>/dev/null || true
  printf 'Upstream tags each release on a side commit; the merge target is where that release left upstream main.\n\n'
  local tag point found=0
  while read -r tag; do
    [[ $tag =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || continue
    point=$(git merge-base "$tag" upstream/main 2>/dev/null) || continue
    git merge-base --is-ancestor "$point" "$base" && break
    # A target older than upstream main lists only the releases it contains.
    git merge-base --is-ancestor "$point" "$upstream" || continue
    printf -- '- %s (%s): merge target `%s`, %s commits past the last sync\n' "$tag" \
      "$(git log -1 --format=%cs "$tag")" "$(git rev-parse --short=11 "$point")" "$(git rev-list --count "$base..$point")"
    found=1
  done < <(git tag -l 'v*' --sort=-v:refname)
  [[ $found == 1 ]] || printf -- '- none\n'

  printf '\n## Customizations touched (likely conflicts)\n\n'
  OVERLAP="$overlap" node -e "
const reg = JSON.parse(require('fs').readFileSync('$REGISTRY', 'utf8'))
const next = new Map()
for (const line of require('fs').readFileSync(0, 'utf8').split('\n')) {
  const [status, from, to] = line.split('\t')
  if (status && status.startsWith('R') && to) next.set(from, to)
}
const current = (f) => {
  const seen = new Set()
  while (next.has(f) && !seen.has(f)) { seen.add(f); f = next.get(f) }
  return f
}
// Each entry keeps its old name (what the registry lists) and its current one (what the tests use).
const files = (process.env.OVERLAP || '').split('\n').filter(Boolean).map((old) => ({ old, now: current(old) }))
const label = (f) => f.now + (f.now === f.old ? '' : ' (renamed from ' + f.old + ')')
const owned = new Set()
for (const c of reg.customizations) {
  const paths = [...(c.key_paths || []), ...(c.touches_upstream_files || [])]
  const matches = (name) => paths.some((p) => (p.endsWith('/') ? name.startsWith(p) : name === p))
  const hits = files.filter((f) => matches(f.old) || matches(f.now))
  if (!hits.length) continue
  hits.forEach((f) => owned.add(f))
  console.log('### ' + c.id + ' (' + hits.length + ' files)\n')
  hits.forEach((f) => console.log('- ' + label(f)))
  if (c.sync_notes) console.log('\nSync notes: ' + c.sync_notes)
  console.log('')
}
const rest = files.filter((f) => !owned.has(f))
console.log('### Not in the registry (' + rest.length + ' files)\n')
rest.forEach((f) => console.log('- ' + label(f)))
if (!rest.length) console.log('- none')
" <<<"$renames"
}

# Upstream cuts releases off main, so the newest release whose main point the branch holds names the fork's base.
record_release() {
  local upstream=${1:-upstream/main} tag point release=''
  git fetch --quiet upstream 'refs/tags/v*:refs/tags/v*' 2>/dev/null || printf 'WARN: could not fetch upstream tags\n' >&2
  while read -r tag; do
    [[ $tag =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || continue
    point=$(git merge-base "$tag" "$upstream" 2>/dev/null) || continue
    if git merge-base --is-ancestor "$point" HEAD; then
      release=${tag#v}
      break
    fi
  done < <(git tag -l 'v*' --sort=-v:refname)
  if [[ -z $release ]]; then
    printf 'WARN: no upstream release found in HEAD; keeping the recorded upstream release\n' >&2
    return 0
  fi
  if [[ $(cat "$RELEASE_FILE" 2>/dev/null) == "$release" ]]; then
    printf 'fork base unchanged: upstream release %s\n' "$release"
    return 0
  fi
  printf '%s\n' "$release" >"$RELEASE_FILE"
  git add "$RELEASE_FILE"
  git commit --quiet -m "build(fork): record upstream release $release as the fork base"
  printf 'fork base is now upstream release %s\n' "$release"
}

# Prints the upstream-main commit a release tag was cut from: the commit the sync merges.
release_target() {
  local tag=${1:?usage: release-target <vX.Y.Z>} upstream=${2:-upstream/main}
  git fetch --quiet upstream "refs/tags/$tag:refs/tags/$tag" 2>/dev/null || true
  git rev-parse --verify --quiet "$tag^{commit}" >/dev/null || die "unknown upstream tag $tag"
  git rev-parse --short=11 "$(git merge-base "$tag" "$upstream")"
}

record_sync() {
  local upstream_commit=${1:?usage: record-sync <upstream-commit> [merge-commit]}
  upstream_commit=$(git rev-parse --short=11 "$upstream_commit^{commit}") || die "unknown commit $1"
  local merge
  # Branch-local: the PR's own merge commit on main is a different sha.
  merge=$(git rev-parse --short=11 "${2:-HEAD}^{commit}") || die "unknown commit $2"
  node -e "
const fs = require('fs')
const text = fs.readFileSync('$REGISTRY', 'utf8')
const value = { date: new Date().toISOString().slice(0, 10), upstream_commit: '$upstream_commit', fork_merge_commit: '$merge' }
// Replace only this block so the formatter's layout of the rest of the file is kept.
const block = JSON.stringify(value, null, 2).replace(/\n/g, '\n  ')
const next = text.replace(/\"last_upstream_sync\": \{[^}]*\}/, '\"last_upstream_sync\": ' + block)
if (next === text || JSON.parse(next).last_upstream_sync.upstream_commit !== value.upstream_commit) {
  throw new Error('could not update last_upstream_sync in $REGISTRY')
}
fs.writeFileSync('$REGISTRY', next)
"
  git add "$REGISTRY"
  git commit --quiet -m "chore(fork): record upstream sync to $upstream_commit"
  printf 'last_upstream_sync: upstream %s, fork merge %s\n' "$upstream_commit" "$merge"
}

case ${1:-} in
  report) shift; report "$@" ;;
  record-release) shift; record_release "$@" ;;
  release-target) shift; release_target "$@" ;;
  record-sync) shift; record_sync "$@" ;;
  *) die 'usage: upstream-sync.sh report|release-target|record-release|record-sync' ;;
esac
