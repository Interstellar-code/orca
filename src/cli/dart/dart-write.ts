import type { DartTask } from '../../shared/dart/dart-types'
import type { CommandHandler } from '../dispatch/dispatch'
import { callDart, printDart } from './dart-call'
import { formatDartMutation } from './dart-format'
import { buildDartUpdateRequest } from './dart-request'
import { requireDartRuntime } from './dart-target'

async function update(context: Parameters<CommandHandler>[0]): Promise<void> {
  await requireDartRuntime(context)
  printDart(
    context,
    await callDart<{ task: DartTask }>(
      context,
      'dart.updateTask',
      await buildDartUpdateRequest(context)
    ),
    (reply) => formatDartMutation('Updated', reply.task)
  )
}

export const DART_WRITE_HANDLERS: Record<string, CommandHandler> = {
  'dart update': update
}
