import type { z } from 'zod'
import type {
  AddComment,
  Connect,
  CreateTask,
  ListComments,
  ListTasks,
  TaskId,
  UpdateTask
} from '../../shared/rpc-contract/dart-params'
import { connect, disconnect, getConfig, getStatus, testConnection } from '../dart/client'
import {
  addComment,
  createTask,
  getTask,
  listComments,
  listTasks,
  updateTask
} from '../dart/dart-tasks'

export class RuntimeDartCommands {
  dartStatus(): ReturnType<typeof getStatus> {
    return getStatus()
  }

  dartConnect(args: z.output<typeof Connect>): ReturnType<typeof connect> {
    return connect(args)
  }

  dartDisconnect(): ReturnType<typeof disconnect> {
    return disconnect()
  }

  dartTestConnection(): ReturnType<typeof testConnection> {
    return testConnection()
  }

  dartConfig(): ReturnType<typeof getConfig> {
    return getConfig()
  }

  dartListTasks(args: z.output<typeof ListTasks>): ReturnType<typeof listTasks> {
    return listTasks(args)
  }

  dartGetTask(args: z.output<typeof TaskId>): ReturnType<typeof getTask> {
    return getTask(args)
  }

  dartListComments(args: z.output<typeof ListComments>): ReturnType<typeof listComments> {
    return listComments(args)
  }

  dartCreateTask(args: z.output<typeof CreateTask>): ReturnType<typeof createTask> {
    return createTask(args)
  }

  dartUpdateTask(args: z.output<typeof UpdateTask>): ReturnType<typeof updateTask> {
    return updateTask(args)
  }

  dartAddComment(args: z.output<typeof AddComment>): ReturnType<typeof addComment> {
    return addComment(args)
  }
}
