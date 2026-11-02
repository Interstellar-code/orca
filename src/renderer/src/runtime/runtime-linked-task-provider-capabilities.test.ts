import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DART_PROVIDER_RUNTIME_CAPABILITY } from '../../../shared/dart/dart-capabilities'
import type { WorkspaceAttachment } from '../../../shared/worktree/types'
import { createCompatibleRuntimeStatusResponse } from './runtime-compatibility-test-fixture'
import { clearRuntimeCompatibilityCacheForTests } from './runtime-rpc-client'
import { assertLinkedTaskProviderCapabilities } from './runtime-linked-task-provider-capabilities'

const call = vi.fn()
const remote = { kind: 'environment', environmentId: 'env-1' } as const

function dartItem(id: string): WorkspaceAttachment {
  return {
    provider: 'dart',
    type: 'issue',
    number: 0,
    identifier: id,
    dartIdentifier: id,
    url: `https://app.dartai.com/t/${id}`
  }
}

function hostWithoutDart(): void {
  const status = createCompatibleRuntimeStatusResponse('runtime-old')
  status.result.capabilities = (status.result.capabilities ?? []).filter(
    (capability) => capability !== DART_PROVIDER_RUNTIME_CAPABILITY
  )
  call.mockImplementation(async () => status)
}
beforeEach(() => {
  clearRuntimeCompatibilityCacheForTests()
  call.mockReset()
  vi.stubGlobal('window', { api: { runtimeEnvironments: { call } } })
})

describe('Dart link capability gate for edits to an existing workspace', () => {
  it('blocks a newly added Dart item on a host without the Dart capability', async () => {
    hostWithoutDart()
    await expect(
      assertLinkedTaskProviderCapabilities(remote, {
        linkedItemsBase: [],
        linkedItems: [dartItem('aB3dE5gH7jK9')]
      })
    ).rejects.toThrow('Update the remote Orca server to use Dart.')
  })

  it('does not block edits that only keep an existing Dart item', async () => {
    hostWithoutDart()
    const existing = dartItem('aB3dE5gH7jK9')
    await expect(
      assertLinkedTaskProviderCapabilities(remote, {
        linkedItemsBase: [existing],
        linkedItems: [existing]
      })
    ).resolves.toBeUndefined()
  })

  it('does not block unlinking a Dart item', async () => {
    hostWithoutDart()
    await expect(
      assertLinkedTaskProviderCapabilities(remote, {
        linkedItemsBase: [dartItem('aB3dE5gH7jK9')],
        linkedItems: [],
        linkedTask: null,
        linkedTaskSourceContext: null
      })
    ).resolves.toBeUndefined()
  })

  it('never probes a local target', async () => {
    await assertLinkedTaskProviderCapabilities(
      { kind: 'local' },
      { linkedItems: [dartItem('aB3dE5gH7jK9')] }
    )
    expect(call).not.toHaveBeenCalled()
  })
})
