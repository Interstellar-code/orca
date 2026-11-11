import type { z } from 'zod'
import type {
  AddComment,
  Connect,
  CreateTask,
  ListComments,
  ListTasks,
  TaskId,
  UpdateTask,
  UpdateTaskBlockers,
  UpdateTaskDescription
} from '../../shared/rpc-contract/dart-params'
import { connect, disconnect, getConfig, getStatus, testConnection } from '../dart/client'
import {
  addComment,
  createTask,
  getTask,
  listComments,
  listTasks,
  updateTask,
  updateTaskBlockers,
  updateTaskDescription
} from '../dart/dart-tasks'
import { _resetPreflightCache } from '../preflight/agent-detection'

export class RuntimeDartCommands {
  dartStatus(): ReturnType<typeof getStatus> {
    return getStatus()
  }

  // Same preflight reset as the IPC handlers, so a connect from a paired client refreshes capabilities.
  async dartConnect(args: z.output<typeof Connect>): ReturnType<typeof connect> {
    const result = await connect(args)
    if (result.ok) {
      _resetPreflightCache()
    }
    return result
  }

  dartDisconnect(): ReturnType<typeof disconnect> {
    const result = disconnect()
    _resetPreflightCache()
    return result
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

  dartUpdateTaskDescription(
    args: z.output<typeof UpdateTaskDescription>
  ): ReturnType<typeof updateTaskDescription> {
    return updateTaskDescription(args)
  }

  dartUpdateTaskBlockers(
    args: z.output<typeof UpdateTaskBlockers>
  ): ReturnType<typeof updateTaskBlockers> {
    return updateTaskBlockers(args)
  }

  dartAddComment(args: z.output<typeof AddComment>): ReturnType<typeof addComment> {
    return addComment(args)
  }
}
