import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Upstream keeps package.json at an old version; the fork labels builds by the upstream release it contains.
export const FORK_UPSTREAM_RELEASE_FILE = 'config/fork/upstream-release'

export function forkBaseVersion(packageVersion, upstreamRelease) {
  const release = upstreamRelease?.trim()
  if (!release) {
    return packageVersion
  }
  if (!/^\d+\.\d+\.\d+$/.test(release)) {
    throw new Error(`${FORK_UPSTREAM_RELEASE_FILE} is not a release version: ${release}`)
  }
  return `${release}-fork`
}

export function readForkBaseVersion(packageVersion, root = process.cwd()) {
  const file = resolve(root, FORK_UPSTREAM_RELEASE_FILE)
  return forkBaseVersion(packageVersion, existsSync(file) ? readFileSync(file, 'utf8') : undefined)
}

export function createLocalBuildVersion(baseVersion, timestamp, commit) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(baseVersion)) {
    throw new Error(`Package version is not valid semver: ${baseVersion}`)
  }
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0) {
    throw new Error('Local build timestamp is invalid.')
  }
  const sanitizedCommit = commit.replace(/[^0-9A-Za-z-]/g, '').slice(0, 12)
  if (!sanitizedCommit) {
    throw new Error('Git commit identity is empty.')
  }
  const suffix = `local.${timestamp}.${sanitizedCommit}`
  return baseVersion.includes('-') ? `${baseVersion}.${suffix}` : `${baseVersion}-${suffix}`
}

export function getLocalBuildIdentity() {
  const packageJson = JSON.parse(readFileSync(resolve('package.json'), 'utf8'))
  const commit = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {
    encoding: 'utf8'
  }).trim()
  return {
    commit,
    version: createLocalBuildVersion(readForkBaseVersion(packageJson.version), Date.now(), commit)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const identity = getLocalBuildIdentity()
  console.log(`[build:mac] local update version ${identity.version}`)
  execFileSync(
    process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    ['exec', 'electron-builder', '--config', 'config/electron-builder.config.cjs', '--mac'],
    {
      env: {
        ...process.env,
        ORCA_BUILD_COMMIT: identity.commit,
        ORCA_LOCAL_BUILD_VERSION: identity.version
      },
      stdio: 'inherit'
    }
  )
}
