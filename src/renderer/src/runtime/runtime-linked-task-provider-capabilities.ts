import { DART_PROVIDER_RUNTIME_CAPABILITY } from '../../../shared/dart/dart-capabilities'
import { WORKTREE_LINKED_WORK_ITEM_CONTEXT_RUNTIME_CAPABILITY } from '../../../shared/protocol-version'
import type { RuntimeClientTarget } from '../../../shared/runtime-client-target'
import type { TaskSourceContext } from '../../../shared/task-source-context'
import type { WorkspaceAttachment, WorkspaceLinkedItem } from '../../../shared/worktree/types'
import { getWorkspaceAttachmentKey } from '../../../shared/workspace-attachment-normalization'
import { translate } from '@/i18n/i18n'
import { dartUpdateRequiredMessage } from './runtime-dart-client'
import { assertRuntimeEnvironmentCapability } from './runtime-rpc-client'

type LinkedTaskRequest = {
  linkedTask?: Pick<WorkspaceLinkedItem, 'provider'> | null
  linkedTaskSourceContext?: Pick<TaskSourceContext, 'provider'> | null
  linkedItems?: readonly WorkspaceAttachment[]
  /** Items already stored on the host; only newly added links need the provider capability. */
  linkedItemsBase?: readonly WorkspaceAttachment[]
}

function linksDart(request: LinkedTaskRequest): boolean {
  if (
    request.linkedTask?.provider === 'dart' ||
    request.linkedTaskSourceContext?.provider === 'dart'
  ) {
    return true
  }
  const known = new Set((request.linkedItemsBase ?? []).map(getWorkspaceAttachmentKey))
  return (request.linkedItems ?? []).some(
    (item) => item.provider === 'dart' && !known.has(getWorkspaceAttachmentKey(item))
  )
}

function linksJira(request: LinkedTaskRequest): boolean {
  return (
    request.linkedTask?.provider === 'jira' || request.linkedTaskSourceContext?.provider === 'jira'
  )
}

/**
 * Jira and Dart links ride the durable linked-work-item context; an older host would drop them silently.
 * Dart also needs its own provider capability so a host that predates Dart never receives Dart context.
 */
export async function assertLinkedTaskProviderCapabilities(
  target: RuntimeClientTarget,
  request: LinkedTaskRequest
): Promise<void> {
  if (target.kind !== 'environment') {
    return
  }
  const dart = linksDart(request)
  if (linksJira(request) || dart) {
    await assertRuntimeEnvironmentCapability(
      target.environmentId,
      WORKTREE_LINKED_WORK_ITEM_CONTEXT_RUNTIME_CAPABILITY,
      dart
        ? translate(
            'auto.runtime.runtime.linked.task.provider.capabilities.linkDart',
            'Update the remote runtime to link Dart'
          )
        : 'Update the remote runtime to link Jira'
    )
  }
  if (dart) {
    await assertRuntimeEnvironmentCapability(
      target.environmentId,
      DART_PROVIDER_RUNTIME_CAPABILITY,
      dartUpdateRequiredMessage()
    )
  }
}
