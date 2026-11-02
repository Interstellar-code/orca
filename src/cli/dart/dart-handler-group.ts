import type { HandlerGroup } from '../handler-group-manifest'

export const DART_HANDLER_GROUP: HandlerGroup = {
  name: 'dart',
  keys: [
    'dart status',
    'dart config',
    'dart list',
    'dart get',
    'dart comment list',
    'dart comment add',
    'dart create',
    'dart update'
  ],
  load: async () => (await import('../handlers/dart.js')).DART_HANDLERS
}
