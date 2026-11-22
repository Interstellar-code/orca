import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../../../../shared/orca-profiles/constants'
import {
  createCompatibleRuntimeStatusResponse,
  type RuntimeEnvironmentCallRequest
} from '../../../../runtime/rpc/testing/runtime-compatibility-test-fixture'
import { TEST_REPO } from '../../../repos/repo.test-fixture'
import { makeWorktree } from '../worktree.test-fixture'
import {
  createTestStore,
  resetRemoteRuntimeMocks,
  resetWorktreeSliceModuleMemory,
  runtimeEnvironmentCall,
  runtimeEnvironmentTransportCall
} from '../worktrees-slice-test-harness'

vi.mock('sonner', () => ({
  toast: { warning: vi.fn(), info: vi.fn(), success: vi.fn(), error: vi.fn(), dismiss: vi.fn() }
}))

beforeEach(() => {
  vi.clearAllMocks()
  resetRemoteRuntimeMocks()
  resetWorktreeSliceModuleMemory()
})

describe('Dart links on a paired runtime', () => {
  const linkedWorkItem = {
    provider: 'dart' as const,
    type: 'issue' as const,
    number: 0,
    title: 'Search results ignore archived projects',
    url: 'https://app.dartai.com/t/aB3dE5gH7jK9',
    dartIdentifier: 'aB3dE5gH7jK9'
  }
  const linkedTaskSourceContext = {
    kind: 'task-source' as const,
    provider: 'dart' as const,
    projectId: 'project-1',
    hostId: 'runtime:env-1' as const
  }

  function useRuntimeCapabilities(filter: (capability: string) => boolean): void {
    const status = createCompatibleRuntimeStatusResponse('runtime-dart')
    if (status.ok) {
      status.result.capabilities = [
        ...(status.result.capabilities ?? []),
        'dart.provider.v1'
      ].filter(filter)
    }
    runtimeEnvironmentTransportCall.mockImplementation((args: RuntimeEnvironmentCallRequest) =>
      args.method === 'status.get' ? status : runtimeEnvironmentCall(args)
    )
  }

  async function createDartLinkedWorktree(): Promise<void> {
    const store = createTestStore()
    store.setState({
      settings: { ...getDefaultSettings('/tmp'), activeRuntimeEnvironmentId: 'env-1' },
      repos: [{ ...TEST_REPO, executionHostId: 'runtime:env-1' }],
      worktreesByRepo: { repo1: [] }
    })
    const createWorktree = store.getState().createWorktree
    const args: Parameters<typeof createWorktree> = ['repo1', 'dart-link']
    args[25] = { linkedWorkItem, linkedTaskSourceContext }
    await createWorktree(...args)
  }

  it('sends the Dart item and source context when the host has both capabilities', async () => {
    useRuntimeCapabilities(() => true)
    runtimeEnvironmentCall.mockResolvedValue({
      id: 'rpc-create',
      ok: true,
      result: {
        worktree: makeWorktree({
          id: 'repo1::/path/dart-link',
          repoId: 'repo1',
          path: '/path/dart-link'
        })
      },
      _meta: { runtimeId: 'runtime-remote' }
    })
    await createDartLinkedWorktree()
    expect(runtimeEnvironmentCall).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'worktree.create',
        params: expect.objectContaining({ linkedWorkItem, linkedTaskSourceContext })
      })
    )
  })

  it('shows the Dart update message and sends nothing when only the linked-context capability is present', async () => {
    useRuntimeCapabilities((capability) => capability !== 'dart.provider.v1')
    await expect(createDartLinkedWorktree()).rejects.toThrow(
      'Update the remote Orca server to use Dart.'
    )
    expect(runtimeEnvironmentCall).not.toHaveBeenCalled()
  })

  it('asks for a runtime update when the host lacks the linked-context capability', async () => {
    useRuntimeCapabilities((capability) => capability !== 'worktree.linked-work-item-context.v1')
    await expect(createDartLinkedWorktree()).rejects.toThrow(
      'Update the remote runtime to link Dart'
    )
    expect(runtimeEnvironmentCall).not.toHaveBeenCalled()
  })
})
