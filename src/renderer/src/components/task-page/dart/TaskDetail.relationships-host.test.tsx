// @vitest-environment happy-dom

import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { relationshipsFixture } from '@/store/slices/dart/dart-fake-relationships.test-support'
import { dartTaskFixture } from '@/store/slices/dart/dart-fake-runtime.test-support'
import {
  openRenderedDartDetail,
  setUpRenderedDartDetail,
  tearDownRenderedDartDetail
} from './dart-task-detail.test-support'

beforeEach(() => void setUpRenderedDartDetail())
afterEach(tearDownRenderedDartDetail)

describe('Dart detail relationships on its owner host', () => {
  it('reads links and writes blockers on host B while another server is active', async () => {
    const user = userEvent.setup()
    const detail = openRenderedDartDetail({ detailEnv: 'owner-host-b' })
    const { host: hostB, runtime, pageEnv } = detail
    const active = runtime.host(pageEnv)
    hostB.relationships = true
    const blocker = dartTaskFixture('blockerHostB1', { title: 'Blocker on host B' })
    hostB.addTask(blocker)
    const opened = { ...detail.task, relationships: relationshipsFixture() }
    hostB.addTask(opened)
    detail.showTask(opened)

    await user.click(await screen.findByRole('button', { name: /add blocker/i }))
    await user.type(await screen.findByPlaceholderText('Search tasks'), 'Blocker')
    await user.click(await screen.findByRole('option', { name: /Blocker on host B/ }))

    await waitFor(() => expect(hostB.count('dart.updateTaskBlockers')).toBe(1))
    expect(hostB.count('dart.getTask')).toBeGreaterThan(0)
    expect(active.requests).toEqual([])
  })
})
