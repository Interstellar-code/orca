import type { getReleaseDownloadUrl } from './releases/updater-release-readiness'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadUpdaterModule, warmUpdaterModule } from './testing/updater-test-module-loader'
import { updaterMainWindow } from './testing/updater-test-main-window'

// Static imports are not initialized when Vitest runs this hoisted mock factory.
const { appMock, autoUpdaterMock, moduleFactories, resetUpdaterMocks } = await vi.hoisted(
  async () => (await import('./testing/updater-test-harness')).createUpdaterMocks()
)

vi.mock('electron', () => moduleFactories.electron())
vi.mock('electron-updater', () => moduleFactories.electronUpdater())
vi.mock('./electron-updater-loader', () => moduleFactories.electronUpdaterLoader())
vi.mock('../ipc/pty/kill-all', () => moduleFactories.ptyKillAll())
vi.mock('./linux-package/linux-update-package-type', () => moduleFactories.linuxUpdatePackageType())
vi.mock('./updater-lifecycle-diagnostics', () => moduleFactories.updaterLifecycleDiagnostics())
vi.mock('./releases/updater-changelog', () => moduleFactories.updaterChangelog())
vi.mock('./nudges/nudge-campaign', () => moduleFactories.updaterNudge())
vi.mock('./update-install-exit-watchdog', () => moduleFactories.updateInstallExitWatchdog())
vi.mock('./releases/updater-prerelease-feed', () => moduleFactories.updaterPrereleaseFeed())
vi.mock('./releases/updater-release-readiness', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getReleaseDownloadUrl: (
    await vi.importMock<{
      getReleaseDownloadUrl: typeof getReleaseDownloadUrl
    }>('./releases/updater-prerelease-feed')
  ).getReleaseDownloadUrl
}))
vi.mock('../local-builds/local-build-switch', () => moduleFactories.localBuildSwitch())
vi.mock('../local-builds/local-build-feed-server', () => moduleFactories.localBuildFeedServer())

warmUpdaterModule()

const FORK_VERSION = '1.4.214-local.1760000000000.abc1234'
const FORK_UPDATE_MESSAGE = 'This is a fork build; updates come from the rebuild job'

describe('fork build updater guard', () => {
  beforeEach(() => {
    resetUpdaterMocks()
  })

  it('never points a fork build at the release feed or checks it', async () => {
    vi.useFakeTimers()
    appMock.getVersion.mockReturnValue(FORK_VERSION)
    const { setupAutoUpdater, checkForUpdates, getUpdateStatus } = await loadUpdaterModule()

    setupAutoUpdater(updaterMainWindow(vi.fn()), { getLastUpdateCheckAt: () => null })
    checkForUpdates()

    await vi.advanceTimersByTimeAsync(0)
    expect(autoUpdaterMock.setFeedURL).not.toHaveBeenCalled()
    expect(autoUpdaterMock.checkForUpdates).not.toHaveBeenCalled()
    expect(getUpdateStatus()).toEqual({
      state: 'error',
      message: FORK_UPDATE_MESSAGE,
      userInitiated: true,
      retryable: false
    })
  })

  it('answers a menu check on a fork build without contacting the feed', async () => {
    vi.useFakeTimers()
    appMock.getVersion.mockReturnValue(FORK_VERSION)
    const send = vi.fn()
    const { setupAutoUpdater, checkForUpdatesFromMenu } = await loadUpdaterModule()

    setupAutoUpdater(updaterMainWindow(send), { getLastUpdateCheckAt: () => Date.now() })
    checkForUpdatesFromMenu()

    await vi.advanceTimersByTimeAsync(0)
    expect(send).toHaveBeenLastCalledWith('updater:status', {
      state: 'error',
      message: FORK_UPDATE_MESSAGE,
      userInitiated: true,
      retryable: false
    })
    expect(autoUpdaterMock.setFeedURL).not.toHaveBeenCalled()
    expect(autoUpdaterMock.checkForUpdates).not.toHaveBeenCalled()
  })

  it('guards the headless serve update path too', async () => {
    vi.useFakeTimers()
    appMock.getVersion.mockReturnValue(FORK_VERSION)
    const send = vi.fn()
    const { setupAutoUpdater, getRemoteServerUpdateSupport, checkForRemoteServerUpdate } =
      await loadUpdaterModule()

    setupAutoUpdater(updaterMainWindow(send), {
      getLastUpdateCheckAt: () => null,
      installMode: 'supervised-headless-serve'
    })

    await vi.advanceTimersByTimeAsync(0)
    expect(autoUpdaterMock.setFeedURL).not.toHaveBeenCalled()
    expect(autoUpdaterMock.checkForUpdates).not.toHaveBeenCalled()
    // Without an initialized updater the paired client cannot push a Stably package onto the server.
    expect(getRemoteServerUpdateSupport().automatic).toBe(false)
    expect(() => checkForRemoteServerUpdate('runtime-1')).toThrow('remote_update_manual_required')
  })

  it('refuses the local-build picker on a fork build', async () => {
    vi.useFakeTimers()
    appMock.getVersion.mockReturnValue(FORK_VERSION)
    const send = vi.fn()
    const { setupAutoUpdater, checkForUpdatesFromMenu } = await loadUpdaterModule()

    setupAutoUpdater(updaterMainWindow(send), { getLastUpdateCheckAt: () => Date.now() })
    checkForUpdatesFromMenu({ localBuild: true })

    await vi.advanceTimersByTimeAsync(0)
    expect(send).toHaveBeenLastCalledWith('updater:status', {
      state: 'error',
      message: FORK_UPDATE_MESSAGE,
      userInitiated: true,
      retryable: false
    })
    expect(autoUpdaterMock.setFeedURL).not.toHaveBeenCalled()
    expect(autoUpdaterMock.checkForUpdates).not.toHaveBeenCalled()
  })

  it('leaves a release build on the Stably feed', async () => {
    appMock.getVersion.mockReturnValue('1.4.214')
    autoUpdaterMock.checkForUpdates.mockResolvedValue(undefined)
    const { setupAutoUpdater } = await loadUpdaterModule()

    setupAutoUpdater(updaterMainWindow(vi.fn()))
    await vi.waitFor(() => expect(autoUpdaterMock.checkForUpdates).toHaveBeenCalledTimes(1))

    expect(autoUpdaterMock.setFeedURL).toHaveBeenCalledWith({
      provider: 'generic',
      url: 'https://github.com/stablyai/orca/releases/latest/download'
    })
  })
})
