import type { DartSavedViewMutation } from '../../../../../shared/dart/dart-saved-views'
import type { RpcParams } from './dart-fake-rpc-params.test-support'

export function toSavedViewMutation(params: RpcParams): DartSavedViewMutation {
  if (params.kind === 'save' && params.view) {
    return { kind: 'save', view: params.view }
  }
  if (params.kind === 'rename' && params.id !== undefined && params.name !== undefined) {
    return { kind: 'rename', id: params.id, name: params.name }
  }
  if (params.kind === 'delete' && params.id !== undefined) {
    return { kind: 'delete', id: params.id }
  }
  if (params.kind === 'select') {
    return { kind: 'select', id: params.id ?? null }
  }
  throw new Error(`fake Dart host cannot read saved view mutation ${params.kind}`)
}
