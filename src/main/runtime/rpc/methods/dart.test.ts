import '../unused-default-rpc-methods.test-fixture'
import { describe, expect, it, vi } from 'vitest'
import {
  DART_LIST_PAGE_MAX,
  DART_METHOD_NAMES,
  DART_METHOD_PERMISSIONS
} from '../../../../shared/rpc-contract/dart-params'
import type { OrcaRuntimeService } from '../../orca-runtime'
import { RpcDispatcher } from '../dispatcher'
import { DART_METHODS } from './dart'

function fixture() {
  const runtime = {
    getRuntimeId: () => 'test-runtime',
    dartConnect: vi.fn(),
    dartListTasks: vi.fn(),
    dartGetTask: vi.fn()
  }
  const dispatcher = new RpcDispatcher({
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the dispatcher reaches only the stubbed runtime methods these cases exercise.
    runtime: runtime as unknown as OrcaRuntimeService,
    methods: DART_METHODS
  })
  const dispatch = (method: string, params: unknown) =>
    dispatcher.dispatch({ id: 'req-1', authToken: 'tok', method, params })
  return { runtime, dispatch }
}

describe('dart RPC methods', () => {
  it('registers every contract method with its contract permission', () => {
    expect(
      Object.fromEntries(DART_METHODS.map((method) => [method.name, method.permission]))
    ).toEqual(
      Object.fromEntries(DART_METHOD_NAMES.map((name) => [name, DART_METHOD_PERMISSIONS[name]]))
    )
  })

  it.each([
    ['dart.listTasks', { q: 'search' }],
    ['dart.listTasks', { limit: DART_LIST_PAGE_MAX + 1 }],
    ['dart.getTask', { taskId: 'not-a-dart-id' }]
  ])('rejects invalid %s params %j', async (method, params) => {
    const { runtime, dispatch } = fixture()
    await expect(dispatch(method, params)).resolves.toMatchObject({
      ok: false,
      error: { code: 'invalid_argument' }
    })
    expect(runtime.dartListTasks).not.toHaveBeenCalled()
    expect(runtime.dartGetTask).not.toHaveBeenCalled()
  })

  it('keeps the token out of dart.connect validation errors', async () => {
    const { runtime, dispatch } = fixture()
    const token = 'dsa_secret_token_value'
    const response = await dispatch('dart.connect', { apiToken: [token] })
    expect(response).toMatchObject({ ok: false, error: { code: 'invalid_argument' } })
    expect(JSON.stringify(response)).not.toContain(token)
    expect(runtime.dartConnect).not.toHaveBeenCalled()
  })
})
