import {
  DART_UNVERIFIED_WRITE_METHODS,
  type DartMethodName,
  type DartResult
} from '../../shared/rpc-contract/dart-params'
import type { HandlerContext } from '../dispatch'
import { printResult } from '../format'
import { RuntimeClientError, type RuntimeRpcSuccess } from '../runtime-client'
import { UNVERIFIED_WRITE_OUTCOME_CODES } from '../unverified-write-outcome-codes'

export type DartCall<T extends object> = {
  response: RuntimeRpcSuccess<DartResult<T>>
  result: { ok: true } & T
}

/** Calls one dart.* method and turns the host's `taskProviderFailure` into a CLI error with its code. */
export async function callDart<T extends object>(
  context: HandlerContext,
  method: DartMethodName,
  params?: unknown
): Promise<DartCall<T>> {
  let response: RuntimeRpcSuccess<DartResult<T>>
  try {
    response = await context.client.call<DartResult<T>>(method, params)
  } catch (error) {
    if (
      DART_UNVERIFIED_WRITE_METHODS.includes(method) &&
      error instanceof RuntimeClientError &&
      UNVERIFIED_WRITE_OUTCOME_CODES.includes(error.code)
    ) {
      throw new RuntimeClientError(
        'dart_write_unverified',
        `${error.message} The Dart change may have been applied. Read the task before retrying.`
      )
    }
    throw error
  }
  if (!response.result.ok) {
    throw new RuntimeClientError(response.result.errorCode, response.result.error)
  }
  return { response, result: response.result }
}

/** JSON keeps the runtime envelope but shows the unwrapped reply, as the Jira handlers do. */
export function printDart<T extends object>(
  context: HandlerContext,
  call: DartCall<T>,
  format: (value: T) => string
): void {
  printResult({ ...call.response, result: call.result }, context.json, format)
}
