// @vitest-environment happy-dom
import React, { createRef, type ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import type { DartTask } from '../../../../shared/dart/dart-types'
import type { Repo } from '../../../../shared/repo-types'
import type { WorkspaceAttachment } from '../../../../shared/worktree/types'
import type { DartClientResult } from '@/runtime/runtime-dart-client'
import { WorkspaceAttachmentComposer } from './WorkspaceAttachmentComposer'

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children?: ReactNode }) => <>{children}</>,
  TooltipContent: () => null,
  TooltipTrigger: ({ children }: { children?: ReactNode }) => <>{children}</>
}))

const initialState = useAppStore.getInitialState()
const repo: Repo = {
  id: 'repo',
  path: '/repo',
  displayName: 'orca',
  badgeColor: '',
  addedAt: 1,
  executionHostId: 'ssh:dev',
  gitRemoteIdentity: {
    canonicalKey: 'github.com/acme/orca',
    remoteName: 'origin',
    remoteUrl: 'https://github.com/acme/orca.git'
  }
}
const taskId = 'aB3dE5gH7jK9'
const taskUrl = `https://app.dartai.com/t/${taskId}-search-results-ignore-archived`
const task: DartTask = {
  id: taskId,
  title: 'Search results ignore archived projects',
  htmlUrl: taskUrl,
  status: 'Doing',
  tags: []
}
const onAdd = vi.fn<(item: WorkspaceAttachment) => boolean>(() => true)
const fetchDartTask = vi.fn<(...args: unknown[]) => Promise<DartClientResult<{ task: DartTask }>>>()

function composer(value: string, items: WorkspaceAttachment[] = []): React.JSX.Element {
  return (
    <WorkspaceAttachmentComposer
      items={items}
      repo={repo}
      disabled={false}
      initialKind="github-issue"
      initialInput={value}
      inputRef={createRef()}
      onAdd={onAdd}
      onSave={vi.fn()}
      getScopeError={() => null}
      error={null}
      onQueryChange={vi.fn()}
    />
  )
}
function input(): HTMLElement {
  return screen.getByRole('combobox', { name: 'Search references' })
}

describe('pasting a Dart task link into the attach box', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAppStore.setState(initialState, true)
    useAppStore.setState({
      fetchWorkItems: vi.fn(async () => []),
      getCachedWorkItems: vi.fn(() => []),
      refreshPreflightStatus: vi.fn(async () => {}),
      checkLinearConnection: vi.fn(async () => {}),
      linearStatusChecked: true,
      fetchDartTask
    })
    Element.prototype.scrollIntoView = vi.fn()
  })
  afterEach(cleanup)

  it('offers an enabled direct row with the task title and attaches it with the workspace host', async () => {
    fetchDartTask.mockResolvedValue({ ok: true, task })
    render(composer(taskUrl))
    const row = await screen.findByRole('option', { name: /^Add Search results ignore archived/ })
    expect(row.getAttribute('data-disabled')).not.toBe('true')
    expect(fetchDartTask).toHaveBeenCalledWith(
      taskId,
      expect.objectContaining({
        sourceContext: expect.objectContaining({ provider: 'dart', hostId: 'ssh:dev' })
      })
    )
    fireEvent.keyDown(input(), { key: 'Enter' })
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'dart',
        type: 'issue',
        number: 0,
        identifier: taskId,
        dartIdentifier: taskId,
        title: task.title,
        url: taskUrl,
        taskSourceContext: expect.objectContaining({ provider: 'dart', hostId: 'ssh:dev' })
      })
    )
  })

  it('offers nothing to attach while the task is still loading', () => {
    fetchDartTask.mockReturnValue(new Promise(() => {}))
    render(composer(taskUrl))
    expect(screen.queryByRole('option', { name: /^Add / })).toBeNull()
    expect(screen.getByRole('status').textContent).toContain('Loading Dart task')
    fireEvent.keyDown(input(), { key: 'Enter' })
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('shows the Dart failure copy and retries the same link', async () => {
    fetchDartTask.mockResolvedValueOnce({
      ok: false,
      error: 'raw failure',
      errorCode: 'dart.notConnected'
    })
    render(composer(taskUrl))
    await screen.findByText('Not connected to Dart.')
    expect(screen.queryByRole('option', { name: /^Add / })).toBeNull()
    fetchDartTask.mockResolvedValueOnce({ ok: true, task })
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(screen.getByRole('option', { name: /^Add Search results/ })))
    expect(input()).toHaveProperty('value', taskUrl)
  })

  it('shows the update-server message for a remote host without Dart support', async () => {
    fetchDartTask.mockResolvedValue({
      ok: false,
      error: 'Update the remote Orca server to use Dart.'
    })
    render(composer(taskUrl))
    await screen.findByText('Update the remote Orca server to use Dart.')
    expect(screen.queryByRole('option', { name: /^Add / })).toBeNull()
  })

  it('rejects a Dart link that is not a task link without reading anything', async () => {
    render(composer('https://app.dartai.com/d/aB3dE5gH7jK9-board'))
    await screen.findByText('Enter a valid Dart task URL.')
    expect(screen.queryByRole('option', { name: /^Add / })).toBeNull()
    expect(fetchDartTask).not.toHaveBeenCalled()
  })

  it('marks an already linked task instead of offering it again', async () => {
    fetchDartTask.mockResolvedValue({ ok: true, task })
    const linked: WorkspaceAttachment = {
      provider: 'dart',
      type: 'issue',
      number: 0,
      identifier: taskId,
      dartIdentifier: taskId,
      url: `https://app.dartai.com/t/${taskId}`
    }
    render(composer(taskUrl, [linked]))
    const row = await screen.findByRole('option', { name: /^Add Search results/ })
    expect(row.getAttribute('data-disabled')).toBe('true')
    expect(row.textContent).toContain('Linked')
    fireEvent.keyDown(input(), { key: 'Enter' })
    expect(onAdd).not.toHaveBeenCalled()
  })
})
