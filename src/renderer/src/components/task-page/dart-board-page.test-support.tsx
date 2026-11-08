import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { installAppKeyboardRouter } from '@/lib/app-keyboard-router'
import { createCompatibleRuntimeStatusResponse } from '@/runtime/runtime-compatibility-test-fixture'
import { useAppStore } from '@/store'
import {
  dartTaskFixture,
  type FakeDartHost
} from '@/store/slices/dart/dart-fake-runtime.test-support'
import { clearDartProviderVerdictCacheForTests } from '@/web/preload-api/web-dart-api'
import {
  installDeliveryRuntime,
  probedSelectors,
  remoteCapabilities
} from './dart-delivery-transports.test-support'
import TaskPage from './TaskPage'

/** The `beforeEach` of every board end-to-end file. */
export function prepareBoardPageEnvironment(): void {
  localStorage.clear()
  installDeliveryRuntime()
  clearDartProviderVerdictCacheForTests()
  remoteCapabilities.clear()
  probedSelectors.length = 0
  const api = window.api
  const { call } = api.runtimeEnvironments
  Object.assign(api.runtimeEnvironments, {
    call: (args: Parameters<typeof call>[0]) => {
      if (args.method !== 'status.get') {
        return call(args)
      }
      probedSelectors.push(args.selector)
      const reply = createCompatibleRuntimeStatusResponse(args.selector)
      return Promise.resolve({
        ...reply,
        result: { ...reply.result, capabilities: remoteCapabilities.get(args.selector) }
      })
    }
  })
  vi.unstubAllGlobals()
  const quiet = new Proxy({}, { get: () => vi.fn(() => Promise.resolve(null)) })
  Object.defineProperty(window, 'api', {
    value: new Proxy(api, { get: (target, key) => (key in target ? target[key] : quiet) }),
    configurable: true
  })
  installAppKeyboardRouter()
  useAppStore.setState({ dartScopeMetaCache: {} })
}

/** The web transport leaves `ui` on the local fake, so saved views would not reach the web host. */
export async function wireWebSavedViews(transport: { name: string }): Promise<void> {
  if (transport.name !== 'web-paired host') {
    return
  }
  const { createWebDartSavedViewApi } = await import('@/web/preload-api/web-dart-saved-view-api')
  const saved = createWebDartSavedViewApi()
  const local = window.api.ui
  Object.assign(window.api, {
    ui: new Proxy(saved, { get: (target, key) => (key in target ? target[key] : local[key]) })
  })
}

export function renderPage(): void {
  render(
    <TooltipProvider>
      <TaskPage />
    </TooltipProvider>
  )
}

/** Adds `count` open tasks named `<prefix> 1..count` in `status`, ids unique per prefix. */
export function seedOpenTasks(
  host: FakeDartHost,
  prefix: string,
  count: number,
  status: string
): void {
  for (let index = 1; index <= count; index += 1) {
    host.addTask(
      dartTaskFixture(`${prefix}${String(index).padStart(3, '0')}`, {
        title: `${prefix} ${index}`,
        status,
        dartboard: 'Board A'
      })
    )
  }
}

export async function switchToBoard(): Promise<void> {
  const user = userEvent.setup()
  await user.click(await screen.findByRole('radio', { name: 'Board' }))
  await waitFor(() => expect(document.querySelector('[data-dart-board]')).not.toBeNull())
}

export function boardColumn(status: string): HTMLElement {
  const column = Array.from(document.querySelectorAll<HTMLElement>('[data-dart-column]')).find(
    (element) => element.getAttribute('aria-label')?.startsWith(`${status}, `)
  )
  if (!column) {
    throw new Error(`No board column for ${status}`)
  }
  return column
}
