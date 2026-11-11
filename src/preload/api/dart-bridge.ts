import { ipcRenderer } from 'electron'
import type { DartApi } from '../api-types'

export const dartApi: DartApi = {
  status: () => ipcRenderer.invoke('dart:status'),
  connect: (args) => ipcRenderer.invoke('dart:connect', args),
  disconnect: () => ipcRenderer.invoke('dart:disconnect'),
  testConnection: () => ipcRenderer.invoke('dart:testConnection'),
  config: () => ipcRenderer.invoke('dart:config'),
  listTasks: (args) => ipcRenderer.invoke('dart:listTasks', args),
  getTask: (args) => ipcRenderer.invoke('dart:getTask', args),
  listComments: (args) => ipcRenderer.invoke('dart:listComments', args),
  createTask: (args) => ipcRenderer.invoke('dart:createTask', args),
  updateTask: (args) => ipcRenderer.invoke('dart:updateTask', args),
  updateTaskDescription: (args) => ipcRenderer.invoke('dart:updateTaskDescription', args),
  updateTaskBlockers: (args) => ipcRenderer.invoke('dart:updateTaskBlockers', args),
  supportsWritesV2: async () => true,
  supportedDartFeatures: async () => ({ board: true, relationships: true }),
  addComment: (args) => ipcRenderer.invoke('dart:addComment', args)
}
