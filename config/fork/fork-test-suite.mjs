#!/usr/bin/env node
// Fork-only test selection for upstream syncs (see .claude/skills/upstream-sync/SKILL.md, step 6).
// Runs the tests that cover the fork's own code and where it touches upstream, not the full suite.
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, globSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve(import.meta.dirname, '../..')
const REGISTRY = 'customization_registry.json'
const DART_FOLDERS = [
  'src/main/dart',
  'src/shared/dart',
  'src/renderer/src/components/task-page/dart',
  'src/cli/dart'
]
const MOBILE_DART_PATH = /^mobile\/(?:[^/]+\/)*dart[^/]*(?:\/.*)?$/
const TEST_FILE = /\.test\.[cm]?[jt]sx?$/
const CODE_FILE = /\.[cm]?[jt]sx?$/
const MOBILE_TEST_FILE = /^mobile\/(?:src|scripts)\/.+\.test\.tsx?$/
const SOURCE_NAMES = ['registry', 'dart', 'related']
const USAGE = `Usage: node config/fork/fork-test-suite.mjs [options] [-- <extra vitest args>]
  --list                       print the selected files grouped by source, run nothing
  --no-registry                skip the tests named in active customizations' key_paths
  --no-dart                    skip the Dart test files and folders
  --no-related                 skip tests related to the fork's source files
  --also-related <file...>     more source files whose related tests are added
  --also-related-from <path>   the same, read from a file: one path per line, or an
                               upstream-sync report (path bullets are picked out)
  --related-depth <n|all>      import hops from a source file to its tests (default 2; the
                               full transitive closure through shared types is ~2/3 of the repo)
  --max-workers <n>            vitest workers (default 2)`

function parseArgs(argv) {
  const options = {
    list: false,
    skip: new Set(),
    alsoRelated: [],
    alsoRelatedFrom: [],
    maxWorkers: '2',
    relatedDepth: 2,
    passthrough: []
  }
  const takeValues = (index) => {
    const values = []
    while (index + 1 < argv.length && !argv[index + 1].startsWith('-')) {
      values.push(argv[(index += 1)])
    }
    return { values, index }
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--') {
      options.passthrough = argv.slice(index + 1)
      break
    } else if (arg === '--list') {
      options.list = true
    } else if (arg.startsWith('--no-') && SOURCE_NAMES.includes(arg.slice(5))) {
      options.skip.add(arg.slice(5))
    } else if (arg === '--also-related' || arg === '--also-related-from') {
      const taken = takeValues(index)
      index = taken.index
      const target = arg === '--also-related' ? options.alsoRelated : options.alsoRelatedFrom
      if (!taken.values.length) {
        fail(`${arg} needs at least one value`)
      }
      target.push(...taken.values)
    } else if (arg === '--related-depth') {
      const value = argv[(index += 1)] ?? fail('--related-depth needs a value')
      options.relatedDepth = value === 'all' ? Infinity : Number(value)
      if (!(options.relatedDepth >= 1)) {
        fail('--related-depth must be a positive number or "all"')
      }
    } else if (arg === '--max-workers') {
      options.maxWorkers = argv[(index += 1)] ?? fail('--max-workers needs a value')
    } else if (arg === '--help' || arg === '-h') {
      console.log(USAGE)
      process.exit(0)
    } else {
      fail(`unknown option ${arg}\n${USAGE}`)
    }
  }
  return options
}

function fail(message) {
  console.error(`fork-test-suite: ${message}`)
  process.exit(2)
}

function gitFiles() {
  const out = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    {
      cwd: root,
      maxBuffer: 256 * 1024 * 1024
    }
  )
  return out.toString('utf8').split('\0').filter(Boolean)
}

function readList(file) {
  // A sync report has other bullet text; only single-token path bullets and bare paths count.
  return readFileSync(file, 'utf8')
    .split('\n')
    .map((line) =>
      line
        .trim()
        .replace(/^[-*]\s+/, '')
        .replaceAll('`', '')
    )
    .filter((line) => /^[\w@.+/-]+$/.test(line) && line.includes('/'))
}

function isDirectory(path) {
  try {
    return statSync(join(root, path)).isDirectory()
  } catch {
    return false
  }
}

const options = parseArgs(process.argv.slice(2))
const tracked = gitFiles()
const registry = JSON.parse(readFileSync(join(root, REGISTRY), 'utf8'))
const active = registry.customizations.filter((customization) => customization.status !== 'retired')
const missing = []

function filesUnder(entry) {
  if (!existsSync(join(root, entry))) {
    return null
  }
  if (!isDirectory(entry)) {
    return [entry]
  }
  const prefix = entry.endsWith('/') ? entry : `${entry}/`
  return tracked.filter((file) => file.startsWith(prefix))
}

// Registry entries split into the fork's own tests and its non-test source files.
const registryTests = new Set()
const forkSources = new Set()
for (const customization of active) {
  const entries = [
    ...(customization.key_paths ?? []),
    ...(customization.touches_upstream_files ?? [])
  ]
  for (const entry of entries) {
    const files = filesUnder(entry)
    if (!files) {
      missing.push(`${customization.id}: ${entry}`)
      continue
    }
    for (const file of files) {
      if (TEST_FILE.test(file)) {
        // Only key_paths are fork-owned tests; a touched upstream test is not.
        if ((customization.key_paths ?? []).includes(entry)) {
          registryTests.add(file)
        }
      } else if (CODE_FILE.test(file)) {
        forkSources.add(file)
      }
    }
  }
}

const alsoRelated = new Set()
for (const entry of [
  ...options.alsoRelated,
  ...options.alsoRelatedFrom.flatMap((path) => {
    if (!existsSync(path)) {
      fail(`--also-related-from file not found: ${path}`)
    }
    return readList(path)
  })
]) {
  const file = entry.replace(/^\.\//, '')
  if (!existsSync(join(root, file)) || isDirectory(file)) {
    console.warn(`warn: --also-related path is not a file here, skipped: ${file}`)
  } else if (CODE_FILE.test(file) && !TEST_FILE.test(file)) {
    alsoRelated.add(file)
  } else if (TEST_FILE.test(file)) {
    registryTests.add(file)
  }
}

const { discoverUnitFiles } = await import(
  pathToFileURL(join(root, 'config/scripts/ci/unit-selection/dependency-graph/ci-unit-files.mjs'))
)
const unitFiles = new Set(discoverUnitFiles(root))
const mobileTests = new Set(tracked.filter((file) => MOBILE_TEST_FILE.test(file)))
const notRunnable = []
const keep = (files, source) =>
  [...files].filter((file) => {
    if (unitFiles.has(file) || mobileTests.has(file)) {
      return true
    }
    if (source !== 'related') {
      notRunnable.push(`${file} (${source})`)
    }
    return false
  })

const selection = {}
if (!options.skip.has('registry')) {
  selection.registry = new Set(keep(registryTests, 'registry'))
}
if (!options.skip.has('dart')) {
  for (const folder of DART_FOLDERS) {
    if (!isDirectory(folder)) {
      missing.push(`dart folder: ${folder}`)
    }
  }
  const dartTests = tracked.filter(
    (file) =>
      TEST_FILE.test(file) &&
      (/\.dart\.test\./.test(file) ||
        DART_FOLDERS.some((folder) => file.startsWith(`${folder}/`)) ||
        MOBILE_DART_PATH.test(file))
  )
  selection.dart = new Set(keep(dartTests, 'dart'))
}
if (!options.skip.has('related')) {
  const related = await relatedTests([...forkSources, ...alsoRelated])
  selection.related = new Set(
    keep(
      [...related].filter((file) => TEST_FILE.test(file)),
      'related'
    )
  )
}

// Breadth-first over importers, so a hub file's reach stops after options.relatedDepth hops.
function withinDepth(seeds, reverse) {
  const seen = new Set(seeds)
  let frontier = [...seen]
  for (let hop = 0; hop < options.relatedDepth && frontier.length; hop += 1) {
    const next = []
    for (const file of frontier) {
      for (const importer of reverse.get(file) ?? []) {
        if (!seen.has(importer)) {
          seen.add(importer)
          next.push(importer)
        }
      }
    }
    frontier = next
  }
  return seen
}

// Reuses the CI unit-selection dependency graph (the same one that selects tests for draft PRs).
async function relatedTests(seeds) {
  const graphModule = await import(
    pathToFileURL(
      join(root, 'config/scripts/ci/unit-selection/dependency-graph/ci-unit-dependency-graph.mjs')
    )
  )
  const found = new Set()
  const desktopSeeds = seeds.filter((file) => !file.startsWith('mobile/'))
  if (desktopSeeds.length) {
    const graph = graphModule.collectUnitDependencyGraph(root)
    const seedsInGraph = desktopSeeds.filter((file) => graph.files.has(file))
    withinDepth(seedsInGraph, graph.reverse).forEach((file) => found.add(file))
  }
  const mobileSeeds = seeds.filter((file) => file.startsWith('mobile/'))
  if (mobileSeeds.length) {
    const sources = new Map(
      globSync(
        ['mobile/src/**/*.{ts,tsx,mts,cts,mjs,js,jsx,cjs}', 'mobile/scripts/**/*.{ts,mjs}'],
        {
          cwd: root,
          exclude: ['**/node_modules/**']
        }
      ).map((file) => {
        const path = file.replaceAll('\\', '/')
        return [path, readFileSync(join(root, path), 'utf8')]
      })
    )
    const graph = graphModule.buildUnitDependencyGraph(sources)
    withinDepth(
      mobileSeeds.filter((seed) => sources.has(seed)),
      graph.reverse
    ).forEach((file) => found.add(file))
  }
  return found
}

function report() {
  const seen = new Set()
  console.log('Fork test suite selection')
  for (const name of SOURCE_NAMES) {
    if (!selection[name]) {
      console.log(`\n${name}: skipped`)
      continue
    }
    const files = [...selection[name]].sort()
    const added = files.filter((file) => !seen.has(file))
    files.forEach((file) => seen.add(file))
    console.log(`\n${name}: ${files.length} files (${added.length} not in an earlier source)`)
    if (options.list) {
      files.forEach((file) => console.log(`  ${file}`))
    }
  }
  console.log(`\ntotal: ${seen.size} unique files`)
  if (notRunnable.length) {
    const skipped = [...new Set(notRunnable)]
    console.log(`not part of the unit run, left out (${skipped.length}):`)
    skipped.forEach((file) => console.log(`  ${file}`))
  }
  return [...seen]
}

function npmScriptSegments(script) {
  const segments = script.split(/\s+&&\s+/).map((segment) => segment.trim().split(/\s+/))
  if (segments.some((tokens) => tokens[0] !== 'node')) {
    fail(`package.json "test" script has an unsupported shape: ${script}`)
  }
  return segments.map((tokens) => tokens.slice(1))
}

function runDesktop(files) {
  const script = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts.test
  const segments = npmScriptSegments(script)
  // Same prerequisites and runner as `pnpm test`, so projects and environments match.
  for (const [index, args] of segments.entries()) {
    const last = index === segments.length - 1
    const result = spawnSync(
      process.execPath,
      [
        ...args,
        ...(last ? [`--maxWorkers=${options.maxWorkers}`, ...options.passthrough, ...files] : [])
      ],
      { cwd: root, stdio: 'inherit' }
    )
    if (result.status !== 0) {
      return result.status ?? 1
    }
  }
  return 0
}

function runMobile(files) {
  const mobileVitest = join(root, 'mobile/node_modules/vitest/vitest.mjs')
  if (!existsSync(mobileVitest)) {
    console.error(
      'fork-test-suite: mobile dependencies are missing; run `pnpm -C mobile install --frozen-lockfile`'
    )
    return 1
  }
  return (
    spawnSync(
      process.execPath,
      [
        mobileVitest,
        'run',
        '--config',
        'vitest.config.ts',
        `--maxWorkers=${options.maxWorkers}`,
        ...options.passthrough,
        ...files.map((file) => file.slice('mobile/'.length))
      ],
      { cwd: join(root, 'mobile'), stdio: 'inherit' }
    ).status ?? 1
  )
}

const selected = report()
let exitCode = 0
if (!options.list) {
  const desktop = selected.filter((file) => !mobileTests.has(file)).sort()
  const mobile = selected.filter((file) => mobileTests.has(file)).sort()
  if (desktop.length) {
    console.log(
      `\nRunning ${desktop.length} desktop test files with --maxWorkers=${options.maxWorkers}`
    )
    exitCode = runDesktop(desktop) || exitCode
  }
  if (mobile.length) {
    console.log(
      `\nRunning ${mobile.length} mobile test files with --maxWorkers=${options.maxWorkers}`
    )
    exitCode = runMobile(mobile) || exitCode
  }
  if (!selected.length) {
    console.log('Nothing selected to run.')
  }
}
if (missing.length) {
  console.error(`\nfork-test-suite: ${missing.length} registry paths are missing (stale registry):`)
  missing.forEach((entry) => console.error(`  ${entry}`))
  exitCode ||= 1
}
process.exitCode = exitCode
