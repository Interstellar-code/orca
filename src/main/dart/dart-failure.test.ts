import { describe, expect, it } from 'vitest'
import { toDartFailure } from './dart-failure'
import { DartApiError } from './dart-request'

const http = (status: number) => new DartApiError(`HTTP ${status}`, 'http', status)

describe('toDartFailure description patch', () => {
  it.each([
    [400, 'dart.descriptionPatchRefused'],
    [404, 'dart.taskNotFound'],
    [401, 'dart.unauthorized'],
    [403, 'dart.unauthorized'],
    [422, 'dart.badRequest'],
    [429, 'dart.rateLimited'],
    [500, 'dart.updateFailed']
  ])('maps HTTP %s to %s', (status, code) => {
    expect(toDartFailure(http(status), 'descriptionPatch', true)).toMatchObject({
      errorCode: code
    })
  })

  it('keeps 400 as a plain bad request for the other writes', () => {
    expect(toDartFailure(http(400), 'update', true).errorCode).toBe('dart.badRequest')
  })
  it('maps only the taskId "No Task found" 400 of a comment to dart.taskNotFound', () => {
    const unknownTask = new DartApiError(
      'Dart request failed (HTTP 400): taskId: No Task found with ID: abc',
      'http',
      400
    )
    expect(toDartFailure(unknownTask, 'comment', true)).toMatchObject({
      errorCode: 'dart.taskNotFound',
      outcome: 'notApplied'
    })
    expect(toDartFailure(unknownTask, 'update', true).errorCode).toBe('dart.badRequest')
    expect(toDartFailure(http(400), 'comment', true).errorCode).toBe('dart.badRequest')
  })
})

describe('toDartFailure write outcome', () => {
  it.each([400, 401, 403, 404, 410, 422, 429])('HTTP %s after sending is notApplied', (status) => {
    expect(toDartFailure(http(status), 'update', true).outcome).toBe('notApplied')
  })

  it.each([408, 500, 502, 503])('HTTP %s after sending is unknown', (status) => {
    expect(toDartFailure(http(status), 'comment', true).outcome).toBe('unknown')
  })

  it.each(['timeout', 'network', 'invalidResponse'] as const)(
    '%s after sending is unknown',
    (kind) => {
      expect(toDartFailure(new DartApiError('x', kind), 'create', true).outcome).toBe('unknown')
    }
  )

  it('treats a non-Dart error after sending as unknown', () => {
    expect(toDartFailure(new Error('boom'), 'descriptionPatch', true).outcome).toBe('unknown')
  })

  it('treats any failure before the request was sent as notApplied, even a network error', () => {
    expect(toDartFailure(new DartApiError('x', 'network'), 'update', false).outcome).toBe(
      'notApplied'
    )
    expect(toDartFailure(new Error('boom'), 'create', false).outcome).toBe('notApplied')
  })

  it('adds no outcome to reads', () => {
    expect(toDartFailure(http(503), 'getTask')).not.toHaveProperty('outcome')
    expect(toDartFailure(new DartApiError('x', 'network'), 'load')).not.toHaveProperty('outcome')
  })
})
