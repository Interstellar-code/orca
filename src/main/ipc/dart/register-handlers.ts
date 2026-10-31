import { ipcMain } from 'electron'
import type { z } from 'zod'
import {
  AddComment,
  Connect,
  CreateTask,
  ListComments,
  ListTasks,
  TaskId,
  UpdateTask
} from '../../../shared/rpc-contract/dart-params'
import { taskProviderFailure } from '../../../shared/task-provider-failure'
import { connect, disconnect, getConfig, getStatus, testConnection } from '../../dart/client'
import {
  addComment,
  createTask,
  getTask,
  listComments,
  listTasks,
  updateTask
} from '../../dart/dart-tasks'
import { _resetPreflightCache } from '../../preflight/agent-detection'

type DartBadRequest = ReturnType<typeof taskProviderFailure>

// Reports only zod's issue text, never the raw args: dart:connect carries the API token.
function handleParsed<TSchema extends z.ZodType, TReply>(
  channel: string,
  schema: TSchema,
  run: (args: z.output<TSchema>) => Promise<TReply> | TReply
): void {
  ipcMain.handle(channel, async (_event, args: unknown): Promise<TReply | DartBadRequest> => {
    const parsed = schema.safeParse(args)
    if (!parsed.success) {
      return taskProviderFailure(
        'dart.badRequest',
        parsed.error.issues[0]?.message ?? 'Invalid Dart request.'
      )
    }
    return run(parsed.data)
  })
}

export function registerDartHandlers(): void {
  ipcMain.handle('dart:status', () => getStatus())

  handleParsed('dart:connect', Connect, async (args) => {
    const result = await connect(args)
    if (result.ok) {
      _resetPreflightCache()
    }
    return result
  })

  ipcMain.handle('dart:disconnect', () => {
    const result = disconnect()
    _resetPreflightCache()
    return result
  })

  ipcMain.handle('dart:testConnection', () => testConnection())
  ipcMain.handle('dart:config', () => getConfig())
  handleParsed('dart:listTasks', ListTasks, listTasks)
  handleParsed('dart:getTask', TaskId, getTask)
  handleParsed('dart:listComments', ListComments, listComments)
  handleParsed('dart:createTask', CreateTask, createTask)
  handleParsed('dart:updateTask', UpdateTask, updateTask)
  handleParsed('dart:addComment', AddComment, addComment)
}
