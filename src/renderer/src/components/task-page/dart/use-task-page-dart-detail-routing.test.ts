// @vitest-environment happy-dom

import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { dartTaskFixture } from '@/store/slices/dart/dart-fake-runtime.test-support'
import type { TaskSourceContext } from '../../../../../shared/task-source-context'
import { useTaskPageDartDetailRouting } from './use-task-page-dart-detail-routing'

function dartContext(env: string): TaskSourceContext {
  return {
    kind: 'task-source',
    provider: 'dart',
    projectId: 'project-1',
    hostId: `runtime:${env}`,
    providerIdentity: { provider: 'dart', userId: 'user-a' }
  }
}

const hostA = dartContext('host-a')
const hostB = dartContext('host-b')

describe('useTaskPageDartDetailRouting openDartDetailPage', () => {
  it('scopes the opened task to the page context when no source context is given', () => {
    const openTaskPage = vi.fn()
    const { result } = renderHook(() =>
      useTaskPageDartDetailRouting({ pageData: {}, dartTaskSourceContext: hostA, openTaskPage })
    )
    const task = dartTaskFixture('task-1')

    result.current.openDartDetailPage(task)

    expect(openTaskPage).toHaveBeenCalledWith(
      { taskSource: 'dart', openDartTask: task, openDartSourceContext: hostA },
      { recordTasksInteraction: false }
    )
  })

  it('keeps the caller host scope for a related task opened from a host-B detail', () => {
    const openTaskPage = vi.fn()
    const task = dartTaskFixture('blocker-1')
    const first = renderHook(() =>
      useTaskPageDartDetailRouting({ pageData: {}, dartTaskSourceContext: hostA, openTaskPage })
    )

    first.result.current.openDartDetailPage(task, hostB)

    expect(openTaskPage).toHaveBeenCalledWith(
      { taskSource: 'dart', openDartTask: task, openDartSourceContext: hostB },
      { recordTasksInteraction: false }
    )
    const [pageData] = openTaskPage.mock.calls[0]
    const second = renderHook(() =>
      useTaskPageDartDetailRouting({ pageData, dartTaskSourceContext: hostA, openTaskPage })
    )
    expect(second.result.current.dartDetailSourceContext).toBe(hostB)
  })

  it('ignores a non-dart source context', () => {
    const openTaskPage = vi.fn()
    const { result } = renderHook(() =>
      useTaskPageDartDetailRouting({ pageData: {}, dartTaskSourceContext: hostA, openTaskPage })
    )

    result.current.openDartDetailPage(dartTaskFixture('task-2'), { ...hostB, provider: 'linear' })

    expect(openTaskPage.mock.calls[0][0].openDartSourceContext).toBe(hostA)
  })
})
