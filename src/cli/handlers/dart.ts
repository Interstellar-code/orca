import type {
  DartComment,
  DartCommentPage,
  DartConnectionStatus,
  DartTask,
  DartTaskPage,
  DartWorkspaceConfig
} from '../../shared/dart/dart-types'
import { readTextOrFileFlag } from '../command-body-input'
import type { CommandHandler } from '../dispatch'
import { RuntimeClientError } from '../runtime-client'
import { callDart, printDart } from '../dart/dart-call'
import {
  formatDartCommentAdded,
  formatDartCommentList,
  formatDartConfig,
  formatDartMutation,
  formatDartStatus,
  formatDartTask,
  formatDartTaskList
} from '../dart/dart-format'
import {
  buildDartCommentQuery,
  buildDartCreateRequest,
  buildDartListQuery,
  dartTaskId
} from '../dart/dart-request'
import { requireDartRuntime } from '../dart/dart-target'
import { DART_WRITE_HANDLERS } from './dart-write'

export const DART_HANDLERS: Record<string, CommandHandler> = {
  ...DART_WRITE_HANDLERS,
  'dart status': async (context) => {
    await requireDartRuntime(context)
    printDart(
      context,
      await callDart<DartConnectionStatus>(context, 'dart.status'),
      formatDartStatus
    )
  },
  'dart config': async (context) => {
    await requireDartRuntime(context)
    printDart(
      context,
      await callDart<{ config: DartWorkspaceConfig }>(context, 'dart.config'),
      (reply) => formatDartConfig(reply.config)
    )
  },
  'dart list': async (context) => {
    await requireDartRuntime(context)
    printDart(
      context,
      await callDart<DartTaskPage>(context, 'dart.listTasks', await buildDartListQuery(context)),
      formatDartTaskList
    )
  },
  'dart get': async (context) => {
    await requireDartRuntime(context)
    printDart(
      context,
      await callDart<{ task: DartTask }>(context, 'dart.getTask', {
        taskId: dartTaskId(context)
      }),
      (reply) => formatDartTask(reply.task)
    )
  },
  'dart comment list': async (context) => {
    await requireDartRuntime(context)
    printDart(
      context,
      await callDart<DartCommentPage>(context, 'dart.listComments', buildDartCommentQuery(context)),
      formatDartCommentList
    )
  },
  'dart comment add': async (context) => {
    await requireDartRuntime(context)
    const text = await readTextOrFileFlag(context.flags, context.cwd, 'body', true)
    if (!text?.trim()) {
      throw new RuntimeClientError('invalid_argument', 'Comment body cannot be blank.')
    }
    printDart(
      context,
      await callDart<{ comment: DartComment }>(context, 'dart.addComment', {
        taskId: dartTaskId(context),
        text
      }),
      (reply) => formatDartCommentAdded(reply.comment)
    )
  },
  'dart create': async (context) => {
    await requireDartRuntime(context)
    printDart(
      context,
      await callDart<{ task: DartTask }>(
        context,
        'dart.createTask',
        await buildDartCreateRequest(context)
      ),
      (reply) => formatDartMutation('Created', reply.task)
    )
  }
}
