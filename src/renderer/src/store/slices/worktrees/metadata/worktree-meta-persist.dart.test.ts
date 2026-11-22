import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DART_PROVIDER_RUNTIME_CAPABILITY } from '../../../../../../shared/dart/dart-capabilities'
import { normalizeWorkspaceAttachmentUpdate } from '../../../../../../shared/workspace-attachments/workspace-attachments'
import type { WorkspaceAttachment } from '../../../../../../shared/worktree/types'
import { clearRuntimeCompatibilityCache } from '../../../../runtime/rpc/compatibility/runtime-compatibility-cache'
import {
  createCompatibleRuntimeStatusResponse,
  type RuntimeEnvironmentCallRequest
} from '../../../../runtime/rpc/testing/runtime-compatibility-test-fixture'
import { persistWorktreeMeta } from './worktree-meta-persist'

const remote = { kind: 'environment', environmentId: 'env-1' } as const
const dartLink: WorkspaceAttachment = {
  provider: 'dart',
  type: 'issue',
  number: 0,
  identifier: 'aB3dE5gH7jK9',
  dartIdentifier: 'aB3dE5gH7jK9',
  title: 'Search results ignore archived projects',
  url: 'https://app.dartai.com/t/aB3dE5gH7jK9',
  taskSourceContext: {
    kind: 'task-source',
    provider: 'dart',
    projectId: 'project-1',
    hostId: 'runtime:env-1'
  }
}

let writes: Record<string, unknown>[]

function stubHost(advertisesDart: boolean): void {
  const status = createCompatibleRuntimeStatusResponse('runtime-1')
  status.result.capabilities = (status.result.capabilities ?? []).filter(
    (capability) => advertisesDart || capability !== DART_PROVIDER_RUNTIME_CAPABILITY
  )
  const call = vi.fn(async (args: RuntimeEnvironmentCallRequest) => {
    if (args.method === 'status.get') {
      return status
    }
    writes.push(args.params ?? {})
    return { id: 'set', ok: true, result: {}, _meta: { runtimeId: 'runtime-1' } }
  })
  vi.stubGlobal('window', { api: { runtimeEnvironments: { call } } })
}

beforeEach(() => {
  clearRuntimeCompatibilityCache()
  writes = []
})

describe('persistWorktreeMeta with a Dart link', () => {
  it('keeps the Dart identifier and source context in the write the host stores', async () => {
    stubHost(true)
    await persistWorktreeMeta(remote, 'repo::/feature', {
      linkedItemsBase: [],
      linkedItems: [dartLink]
    })
    const kept = expect.objectContaining({
      provider: 'dart',
      identifier: 'aB3dE5gH7jK9',
      dartIdentifier: 'aB3dE5gH7jK9',
      taskSourceContext: expect.objectContaining({
        provider: 'dart',
        projectId: 'project-1',
        hostId: 'runtime:env-1'
      })
    })
    expect(writes).toHaveLength(1)
    expect(writes[0].linkedItems).toEqual([kept])
    expect(normalizeWorkspaceAttachmentUpdate({}, writes[0]).linkedItems).toEqual([kept])
  })

  it('refuses a new Dart link before it reaches a host that predates Dart', async () => {
    stubHost(false)
    await expect(
      persistWorktreeMeta(remote, 'repo::/feature', {
        linkedItemsBase: [],
        linkedItems: [dartLink]
      })
    ).rejects.toThrow('Update the remote Orca server to use Dart.')
    expect(writes).toEqual([])
  })
})
