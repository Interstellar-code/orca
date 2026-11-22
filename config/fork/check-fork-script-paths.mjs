#!/usr/bin/env node
// Fails when a fork script, workflow or skill names a repo path or pnpm script that no longer exists
// (an upstream move would otherwise break them silently; no test runs these files).
import { existsSync, globSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const SCANNED = [
  '.github/workflows/fork-*.yml',
  'config/fork/*.sh',
  'config/fork/*.mjs',
  '.claude/skills/*/SKILL.md'
]
// A path starts at a word boundary, so URLs, absolute paths, `$VAR/` and `../` prefixes never match.
const REPO_PATH =
  /(?<![\w./~$@:%{}-])(?:config|src|mobile|scripts|resources|\.github)\/[\w@.+/-]*(?:[\w@+/-]|\.\w)/g
const PNPM_SCRIPT =
  /\bpnpm((?:\s+(?:-C\s+\S+|--[\w-]+(?:=\S+)?))*)\s+(?:run\s+)?([A-Za-z][\w:.-]*)(?=[\s`'")]|$)/g
const PNPM_COMMANDS = new Set([
  'add',
  'approve-builds',
  'audit',
  'bin',
  'cache',
  'config',
  'create',
  'dedupe',
  'dlx',
  'env',
  'exec',
  'fetch',
  'help',
  'i',
  'import',
  'init',
  'install',
  'link',
  'list',
  'ls',
  'outdated',
  'pack',
  'patch',
  'prune',
  'publish',
  'rebuild',
  'remove',
  'rm',
  'root',
  'run',
  'setup',
  'store',
  'unlink',
  'up',
  'update',
  'why'
])

function scriptNames(dir) {
  const file = join(root, dir, 'package.json')
  return existsSync(file)
    ? new Set(Object.keys(JSON.parse(readFileSync(file, 'utf8')).scripts))
    : null
}

const rootScripts = scriptNames('.')
const mobileScripts = scriptNames('mobile')
const problems = []

const self = 'config/fork/check-fork-script-paths.mjs'
for (const file of SCANNED.flatMap((pattern) => globSync(pattern, { cwd: root })).sort()) {
  if (file === self) {
    continue
  }
  const lines = readFileSync(join(root, file), 'utf8').split('\n')
  const isMarkdown = file.endsWith('.md')
  let inFence = false
  lines.forEach((line, index) => {
    if (isMarkdown && /^\s*```/.test(line)) {
      inFence = !inFence
    }
    // Markdown prose says "pnpm and node"; only code spans and fences name real commands.
    const code =
      isMarkdown && !inFence ? [...line.matchAll(/`([^`]*)`/g)].map((m) => m[1]).join('\n') : line
    const at = `${file}:${index + 1}`
    // `$PWD/config/...` and `./config/...` name repo paths; other prefixes (URLs, $HOME) do not.
    const scan = line.replace(
      /(?:\$\{?(?:PWD|ROOT|REPO_ROOT|root)\}?|\$\(pwd\)|(?<![\w.])\.)\//g,
      ' '
    )
    for (const found of scan.matchAll(REPO_PATH)) {
      // A glob or placeholder right after the match means the path is not literal.
      if (/[*<>{$[?]/.test(scan[found.index + found[0].length] ?? '')) {
        continue
      }
      const path = found[0]
      if (!existsSync(join(root, path))) {
        problems.push(`${at}: missing path ${path}`)
      }
    }
    const isComment = !isMarkdown && /^\s*(?:#|\/\/)/.test(line)
    for (const [, flags, name] of isComment ? [] : code.matchAll(PNPM_SCRIPT)) {
      if (PNPM_COMMANDS.has(name) || /(^|\s)--filter\b/.test(flags)) {
        continue
      }
      const mobile = /-C\s+mobile\b/.test(flags)
      if (!(mobile ? mobileScripts : rootScripts)?.has(name)) {
        problems.push(`${at}: missing pnpm script ${mobile ? 'mobile ' : ''}${name}`)
      }
    }
  })
}

if (problems.length) {
  console.error(`check-fork-script-paths: ${problems.length} stale reference(s):`)
  problems.forEach((problem) => console.error(`  ${problem}`))
  process.exit(1)
}
console.log('check-fork-script-paths: every path and pnpm script named by the fork files exists')
