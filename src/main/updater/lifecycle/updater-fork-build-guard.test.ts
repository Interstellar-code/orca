import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UpdaterSetup } from './updater-setup'
import type { BrowserWindow } from 'electron'

function updaterMainWindow(
  send: (channel: string, ...args: unknown[]) => void = vi.fn()
): BrowserWindow {
  return {
    isDestroyed: () => false,
    webContents: { isDestroyed: () => false, send }
  } as unknown as BrowserWindow
}

const { autoUpdater, getVersion } = await vi.hoisted(async () => {
  const { EventEmitter } = await import('node:events')
  return {
    autoUpdater: Object.assign(new EventEmitter(), {
      setFeedURL: vi.fn(),
      checkForUpdates: vi.fn<() => Promise<unknown>>(async () => undefined),
      downloadUpdate: vi.fn(async () => []),
      quitAndInstall: vi.fn()
    }),
    getVersion: vi.fn<() => string>()
  }
})

vi.mock('electron', () => ({
  app: Object.assign(new EventEmitter(), { isPackaged: true, getVersion }),
  autoUpdater: new EventEmitter(),
  powerMonitor: new EventEmitter()
}))
vi.mock('../electron-updater-loader', () => ({ loadElectronAutoUpdater: () => autoUpdater }))
vi.mock('../mac-install/macos-shipit-scheduling', () => ({ configureMacShipItScheduling: vi.fn() }))
vi.mock('../mac-install/shipit-leftover-recovery', () => ({
  prepareThisProcessShipItStaging: () => null
}))
vi.mock('../linux-package/linux-update-package-type', () => ({
  getLinuxPackageType: () => 'non-root',
  getLinuxRootPackageType: () => null,
  isExternallyManagedLinuxInstall: () => false
}))
vi.mock('../nudges/nudge-campaign', () => ({ fetchNudge: async () => null }))
vi.mock('../releases/updater-changelog', () => ({ fetchChangelog: async () => null }))
vi.mock('../updater-lifecycle-diagnostics', () => ({ recordUpdaterLifecycle: vi.fn() }))

const FORK_VERSION = '1.4.214-local.1760000000000.abc1234'
const FORK_BUILD_STATUS = {
  state: 'error',
  message: 'This is a fork build; updates come from the rebuild job',
  userInitiated: true,
  retryable: false
}

describe('fork build updater guard', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    autoUpdater.removeAllListeners()
    autoUpdater.setFeedURL.mockClear()
    autoUpdater.checkForUpdates.mockClear()
    getVersion.mockReturnValue(FORK_VERSION)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('never points a fork build at the release feed or checks it', async () => {
    const updater = new UpdaterSetup()
    updater.setupAutoUpdater(updaterMainWindow(vi.fn()), { getLastUpdateCheckAt: () => null })
    updater.checkForUpdates()

    await vi.advanceTimersByTimeAsync(0)
    expect(autoUpdater.setFeedURL).not.toHaveBeenCalled()
    expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled()
    expect(updater.getUpdateStatus()).toEqual(FORK_BUILD_STATUS)
  })

  it.each([undefined, { localBuild: true }])(
    'answers a menu check on a fork build without contacting a feed (%o)',
    async (options) => {
      const send = vi.fn()
      const updater = new UpdaterSetup()
      updater.setupAutoUpdater(updaterMainWindow(send), { getLastUpdateCheckAt: () => Date.now() })
      updater.checkForUpdatesFromMenu(options)

      await vi.advanceTimersByTimeAsync(0)
      expect(send).toHaveBeenLastCalledWith('updater:status', FORK_BUILD_STATUS)
      expect(autoUpdater.setFeedURL).not.toHaveBeenCalled()
      expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled()
    }
  )

  it('guards the headless serve update path too', async () => {
    const updater = new UpdaterSetup()
    updater.setupAutoUpdater(updaterMainWindow(vi.fn()), {
      getLastUpdateCheckAt: () => null,
      installMode: 'supervised-headless-serve'
    })

    await vi.advanceTimersByTimeAsync(0)
    expect(autoUpdater.setFeedURL).not.toHaveBeenCalled()
    expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled()
    expect(updater.getRemoteServerUpdateSupport().automatic).toBe(false)
    expect(() => updater.checkForRemoteServerUpdate('runtime-1')).toThrow(
      'remote_update_manual_required'
    )
  })

  it('leaves a release build on the Stably feed', async () => {
    getVersion.mockReturnValue('1.4.214')
    const updater = new UpdaterSetup()
    updater.setupAutoUpdater(updaterMainWindow(vi.fn()), { getLastUpdateCheckAt: () => null })

    expect(autoUpdater.setFeedURL).toHaveBeenCalledWith({
      provider: 'generic',
      url: 'https://github.com/stablyai/orca/releases/latest/download'
    })
  })
})
