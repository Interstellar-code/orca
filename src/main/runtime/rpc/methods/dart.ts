import { defineMethod } from '../core'
import {
  AddComment,
  Connect,
  CreateTask,
  DART_METHOD_PERMISSIONS,
  ListComments,
  ListTasks,
  TaskId,
  UpdateTask,
  UpdateTaskDescription
} from '../../../../shared/rpc-contract/dart-params'

// dart.connect carries the API token: no handler here may log or echo params.
export const DART_METHODS = [
  defineMethod({
    name: 'dart.status',
    permission: DART_METHOD_PERMISSIONS['dart.status'],
    params: null,
    handler: async (_params, { runtime }) => runtime.dartStatus()
  }),
  defineMethod({
    name: 'dart.connect',
    permission: DART_METHOD_PERMISSIONS['dart.connect'],
    params: Connect,
    handler: async (params, { runtime }) => runtime.dartConnect(params)
  }),
  defineMethod({
    name: 'dart.disconnect',
    permission: DART_METHOD_PERMISSIONS['dart.disconnect'],
    params: null,
    handler: async (_params, { runtime }) => runtime.dartDisconnect()
  }),
  defineMethod({
    name: 'dart.testConnection',
    permission: DART_METHOD_PERMISSIONS['dart.testConnection'],
    params: null,
    handler: async (_params, { runtime }) => runtime.dartTestConnection()
  }),
  defineMethod({
    name: 'dart.config',
    permission: DART_METHOD_PERMISSIONS['dart.config'],
    params: null,
    handler: async (_params, { runtime }) => runtime.dartConfig()
  }),
  defineMethod({
    name: 'dart.listTasks',
    permission: DART_METHOD_PERMISSIONS['dart.listTasks'],
    params: ListTasks,
    handler: async (params, { runtime }) => runtime.dartListTasks(params)
  }),
  defineMethod({
    name: 'dart.getTask',
    permission: DART_METHOD_PERMISSIONS['dart.getTask'],
    params: TaskId,
    handler: async (params, { runtime }) => runtime.dartGetTask(params)
  }),
  defineMethod({
    name: 'dart.listComments',
    permission: DART_METHOD_PERMISSIONS['dart.listComments'],
    params: ListComments,
    handler: async (params, { runtime }) => runtime.dartListComments(params)
  }),
  defineMethod({
    name: 'dart.createTask',
    permission: DART_METHOD_PERMISSIONS['dart.createTask'],
    params: CreateTask,
    handler: async (params, { runtime }) => runtime.dartCreateTask(params)
  }),
  defineMethod({
    name: 'dart.updateTask',
    permission: DART_METHOD_PERMISSIONS['dart.updateTask'],
    params: UpdateTask,
    handler: async (params, { runtime }) => runtime.dartUpdateTask(params)
  }),
  defineMethod({
    name: 'dart.updateTaskDescription',
    permission: DART_METHOD_PERMISSIONS['dart.updateTaskDescription'],
    params: UpdateTaskDescription,
    handler: async (params, { runtime }) => runtime.dartUpdateTaskDescription(params)
  }),
  defineMethod({
    name: 'dart.addComment',
    permission: DART_METHOD_PERMISSIONS['dart.addComment'],
    params: AddComment,
    handler: async (params, { runtime }) => runtime.dartAddComment(params)
  })
]
