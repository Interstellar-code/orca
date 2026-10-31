import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestStore } from './store-test-helpers'
import type { FolderWorkspace } from '../../../../shared/folder-workspace-types'
import {
  createCompatibleRuntimeStatusResponse,
  type RuntimeEnvironmentCallRequest
} from '../../runtime/runtime-compatibility-test-fixture'
import { clearRuntimeCompatibilityCacheForTests } from '../../runtime/runtime-rpc-client'

const projectGroup = { id: 'group-1' }
const folderWorkspacesCreate = vi.fn()
const runtimeEnvironmentCall = vi.fn()
const runtimeEnvironmentTransportCall = vi.fn()

beforeEach(() => {
  clearRuntimeCompatibilityCacheForTests()
  folderWorkspacesCreate.mockReset()
  runtimeEnvironmentCall.mockReset()
  runtimeEnvironmentTransportCall.mockReset()
  vi.stubGlobal('window', {
    api: {
      folderWorkspaces: { create: folderWorkspacesCreate },
      runtimeEnvironments: { call: runtimeEnvironmentTransportCall }
    }
  })
})

describe('Dart folder links on a paired runtime', () => {
  const linkedTask: FolderWorkspace['linkedTask'] = {
    provider: 'dart',
    type: 'issue',
    number: 0,
    title: 'Search results ignore archived projects',
    url: 'https://app.dartai.com/t/aB3dE5gH7jK9',
    dartIdentifier: 'aB3dE5gH7jK9'
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

  function createDartFolder(): Promise<FolderWorkspace | null> {
    return createTestStore()
      .getState()
      .createFolderWorkspace(
        { projectGroupId: projectGroup.id, name: 'Dart folder', linkedTask },
        { runtimeEnvironmentId: 'env-1' }
      )
  }

  it('sends the Dart link when the host has both capabilities', async () => {
    useRuntimeCapabilities(() => true)
    runtimeEnvironmentCall.mockResolvedValue({
      id: 'rpc-create-folder',
      ok: true,
      result: {
        folderWorkspace: {
          id: 'folder-workspace-1',
          projectGroupId: projectGroup.id,
          name: 'Dart folder',
          folderPath: '/workspace/platform',
          linkedTask,
          comment: '',
          isArchived: false,
          isUnread: false,
          isPinned: false,
          sortOrder: 1,
          lastActivityAt: 0,
          createdAt: 1,
          updatedAt: 1
        }
      },
      _meta: { runtimeId: 'runtime-remote' }
    })
    await createDartFolder()
    expect(runtimeEnvironmentCall).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'folderWorkspace.create',
        params: expect.objectContaining({ linkedTask })
      })
    )
  })

  it('shows the Dart update message and sends nothing when only the linked-context capability is present', async () => {
    useRuntimeCapabilities((capability) => capability !== 'dart.provider.v1')
    await expect(createDartFolder()).rejects.toThrow('Update the remote Orca server to use Dart.')
    expect(runtimeEnvironmentCall).not.toHaveBeenCalled()
    expect(folderWorkspacesCreate).not.toHaveBeenCalled()
  })

  it('asks for a runtime update when the host lacks the linked-context capability', async () => {
    useRuntimeCapabilities((capability) => capability !== 'worktree.linked-work-item-context.v1')
    await expect(createDartFolder()).rejects.toThrow('Update the remote runtime to link Dart')
    expect(runtimeEnvironmentCall).not.toHaveBeenCalled()
  })
})
