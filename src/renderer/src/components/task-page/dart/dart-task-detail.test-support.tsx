import { cleanup, render } from '@testing-library/react'
import { vi } from 'vitest'
import type { DartTask } from '../../../../../shared/dart/dart-types'
import type { TaskSourceContext } from '../../../../../shared/task-source-context'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAppStore } from '@/store'
import {
  dartTaskFixture,
  installFakeDartRuntime,
  type FakeDartHost
} from '@/store/slices/dart/dart-fake-runtime.test-support'
import { getDartReadScope } from '@/store/slices/dart/dart-read-coordination'
import { TaskPageDartTaskDetail } from './TaskDetail'

export const dartDetailViewer = { id: 'user-a', name: 'Alex Example' }

const realWindow = window
let runtime: ReturnType<typeof installFakeDartRuntime>
let nextHost = 0

export function dartDetailSourceContext(env: string): TaskSourceContext {
  return {
    kind: 'task-source',
    provider: 'dart',
    projectId: 'project-1',
    hostId: `runtime:${env}`,
    providerIdentity: { provider: 'dart', userId: dartDetailViewer.id }
  }
}

/** The shared fake answers neither comments nor config. */
function answerCommentsAndConfig(host: FakeDartHost, boardName: string): void {
  const handle = host.handle.bind(host)
  host.handle = async (method, params) => {
    if (method === 'dart.config') {
      host.requests.push({ method, params })
      return {
        ok: true,
        config: {
          dartboards: [boardName],
          statuses: ['To-do', 'Done'],
          types: [],
          tags: [],
          priorities: [],
          sizes: [],
          assignees: []
        }
      }
    }
    if (method === 'dart.listComments') {
      host.requests.push({ method, params })
      return { ok: true, comments: [], totalCount: 0 }
    }
    return handle(method, params)
  }
}

/** Call from `beforeEach` in a file that renders the real task detail. */
export function setUpRenderedDartDetail(): ReturnType<typeof installFakeDartRuntime> {
  runtime = installFakeDartRuntime()
  // The fake stubs a bare `window`, which React DOM cannot render into, so its API moves onto the real one.
  const api = window.api
  vi.stubGlobal('window', realWindow)
  Object.assign(realWindow, { api })
  return runtime
}

/** Call from `afterEach`. */
export function tearDownRenderedDartDetail(): void {
  cleanup()
  vi.unstubAllGlobals()
}

/** Renders the real `TaskPageDartTaskDetail` on a fake host; the page itself sits on `pageEnv`, the detail on `detailEnv`. */
export function openRenderedDartDetail(options: { detailEnv?: string; onClose?: () => void } = {}) {
  nextHost += 1
  const pageEnv = `page-host-${nextHost}`
  const detailEnv = options.detailEnv ?? pageEnv
  const host = runtime.host(detailEnv)
  answerCommentsAndConfig(host, `Board of ${detailEnv}`)
  const addTask = (suffix: string): DartTask => {
    const task = dartTaskFixture(`taskSheet${String(nextHost).padStart(3, '0')}${suffix}`, {
      description: 'Original description'
    })
    host.addTask(task)
    return task
  }
  const task = addTask('')
  const settings = { ...useAppStore.getState().settings!, activeRuntimeEnvironmentId: pageEnv }
  useAppStore.setState({
    settings,
    dartStatus: { connected: true, viewer: dartDetailViewer },
    dartStatusChecked: true,
    dartStatusContextKey: getDartReadScope(settings).contextKey
  })
  const onClose = options.onClose ?? vi.fn()
  const tree = (shown: DartTask | null): React.JSX.Element => (
    <TooltipProvider>
      <TaskPageDartTaskDetail
        task={shown}
        sourceContext={dartDetailSourceContext(detailEnv)}
        workspaces={[]}
        onUse={vi.fn()}
        onClose={onClose}
        onOpenWorkspace={vi.fn()}
      />
    </TooltipProvider>
  )
  const view = render(tree(task))
  return {
    runtime,
    pageEnv,
    detailEnv,
    host,
    task,
    onClose,
    addTask,
    showTask: (shown: DartTask | null): void => view.rerender(tree(shown))
  }
}
