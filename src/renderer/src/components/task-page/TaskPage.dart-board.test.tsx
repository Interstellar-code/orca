// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { DartTask } from '../../../../shared/dart/dart-types'
import { installAppKeyboardRouter } from '@/lib/app-keyboard-router'
import { createCompatibleRuntimeStatusResponse } from '@/runtime/runtime-compatibility-test-fixture'
import { useAppStore } from '@/store'
import {
  dartTaskFixture,
  type FakeDartHost
} from '@/store/slices/dart/dart-fake-runtime.test-support'
import { clearDartProviderVerdictCacheForTests } from '@/web/preload-api/web-dart-api'
import {
  addRemote,
  installDeliveryRuntime,
  NETWORK_TRANSPORTS,
  probedSelectors,
  remoteCapabilities,
  SOURCE,
  TRANSPORTS,
  VIEWER,
  web
} from './dart-delivery-transports.test-support'
import TaskPage from './TaskPage'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock('@/components/PullRequestPage', () => ({ default: () => null }))
vi.mock('@/components/GitHubItemDialog', () => ({ default: () => null }))
vi.mock('./github/List', () => ({ TaskPageGitHubList: () => null }))
vi.mock('./jira/Content', () => ({ TaskPageJiraContent: () => null }))
vi.mock('./linear/Content', () => ({ TaskPageLinearContent: () => null }))

vi.mock('@/web/preload-api/web-runtime-calls', () => ({
  getRemoteRuntimeStatus: async () => ({ capabilities: web.capabilities }),
  callRuntimeEnvelope: async (method: string, params: Parameters<FakeDartHost['handle']>[1]) =>
    web.methodNotFound
      ? { ok: false, error: { code: 'method_not_found', message: `Unknown method ${method}` } }
      : { ok: true, result: await web.host!.handle(method, params) }
}))
vi.mock('@/web/preload-api/web-runtime-session', () => ({
  requireActiveEnvironment: () => ({ id: 'web-env' }),
  assertActiveEnvironment: () => {}
}))

const realWindow = window

// Shared by the "delivery and races" and "hosts and config" sections below.
export { act, cleanup, fireEvent, render, screen, waitFor, within, userEvent }
export { addRemote, NETWORK_TRANSPORTS, probedSelectors, SOURCE, TRANSPORTS, VIEWER, web }
export { dartTaskFixture }
export type { DartTask, FakeDartHost }

beforeEach(() => {
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
  Object.defineProperty(realWindow, 'api', {
    value: new Proxy(api, { get: (target, key) => (key in target ? target[key] : quiet) }),
    configurable: true
  })
  installAppKeyboardRouter()
  useAppStore.setState({ dartScopeMetaCache: {} })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderPage(): void {
  render(
    <TooltipProvider>
      <TaskPage />
    </TooltipProvider>
  )
}

/** Adds `count` open tasks named `<prefix> 1..count` in `status`, ids unique per prefix. */
function seedOpenTasks(host: FakeDartHost, prefix: string, count: number, status: string): void {
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

async function switchToBoard(): Promise<void> {
  const user = userEvent.setup()
  await user.click(await screen.findByRole('radio', { name: 'Board' }))
  await waitFor(() => expect(document.querySelector('[data-dart-board]')).not.toBeNull())
}

function boardColumn(status: string): HTMLElement {
  const column = Array.from(document.querySelectorAll<HTMLElement>('[data-dart-column]')).find(
    (element) => element.getAttribute('aria-label')?.startsWith(`${status}, `)
  )
  if (!column) {
    throw new Error(`No board column for ${status}`)
  }
  return column
}

function columnTitles(status: string): string[] {
  return Array.from(boardColumn(status).querySelectorAll('h3')).map((h) => h.textContent ?? '')
}

export { boardColumn, columnTitles, renderPage, seedOpenTasks, switchToBoard }

// -- delivery and races --------------------------------------------------------------------------

describe('delivery and races', () => {
  it.todo('delivery and races cases')
})

// -- hosts and config ----------------------------------------------------------------------------

describe('hosts and config', () => {
  it.todo('hosts and config cases')
})
