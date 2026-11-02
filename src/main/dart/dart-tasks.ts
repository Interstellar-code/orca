import type { z } from 'zod'
import type { DartWorkspaceConfig } from '../../shared/dart/dart-types'
import {
  DART_LIST_PAGE_DEFAULT,
  DART_LIST_PAGE_MAX,
  DART_TASK_LIST_QUERY_PARAMS,
  type AddComment,
  type CreateTask,
  type DartFailure,
  type DartMethodContract,
  type ListComments,
  type ListTasks,
  type TaskId,
  type UpdateTask
} from '../../shared/rpc-contract/dart-params'
import { taskProviderFailure } from '../../shared/task-provider-failure'
import { noteRequestFailure, readConfig, readToken } from './client'
import { toDartFailure, type DartOperation } from './dart-failure'
import { DartApiError, dartRequest, type DartQueryValue } from './dart-request'
import { mapDartComment, mapDartTask, readDartPage, unwrapDartItem } from './dart-task-mapping'

type Reply<M extends keyof DartMethodContract> = DartMethodContract[M]['reply']

function pageLimit(limit: number | undefined): number {
  return Math.min(Math.max(1, limit ?? DART_LIST_PAGE_DEFAULT), DART_LIST_PAGE_MAX)
}

const TASK_LIST_QUERY_PARAMS = new Map<string, string>(Object.entries(DART_TASK_LIST_QUERY_PARAMS))

/** Only whitelisted names reach Dart, which silently ignores unknown parameters. */
export function buildTaskListQuery(
  args: z.output<typeof ListTasks>
): Record<string, DartQueryValue> {
  const query: Record<string, DartQueryValue> = {}
  for (const [name, value] of Object.entries(args ?? {})) {
    const param = TASK_LIST_QUERY_PARAMS.get(name)
    if (param && (typeof value === 'boolean' || (typeof value === 'string' && value !== ''))) {
      query[param] = value
    }
  }
  query.limit = pageLimit(args?.limit)
  query.offset = args?.offset ?? 0
  return query
}

async function withToken<T extends object>(
  operation: DartOperation,
  run: (token: string) => Promise<({ ok: true } & T) | DartFailure>
): Promise<({ ok: true } & T) | DartFailure> {
  const token = readToken()
  if ('failure' in token) {
    return token.failure
  }
  try {
    return await run(token.token)
  } catch (error) {
    noteRequestFailure(error)
    return toDartFailure(error, operation)
  }
}

// Unmappable items (no id or title) are dropped, so the total must not count them either.
function countAfterDrops(page: { results: unknown[]; count: number }, kept: number): number {
  return Math.max(kept, page.count - (page.results.length - kept))
}

function invalidResponse(): DartApiError {
  return new DartApiError('Dart returned an unreadable task.', 'invalidResponse')
}

export function listTasks(args: z.output<typeof ListTasks>): Promise<Reply<'dart.listTasks'>> {
  return withToken('load', async (token) => {
    const page = readDartPage(
      await dartRequest<unknown>(token, '/tasks/list', { query: buildTaskListQuery(args) })
    )
    const tasks = page.results.flatMap((raw) => mapDartTask(raw) ?? [])
    return { ok: true, tasks, totalCount: countAfterDrops(page, tasks.length) }
  })
}

export function getTask(args: z.output<typeof TaskId>): Promise<Reply<'dart.getTask'>> {
  return withToken('getTask', async (token) => {
    const task = mapDartTask(
      unwrapDartItem(await dartRequest<unknown>(token, `/tasks/${encodeURIComponent(args.taskId)}`))
    )
    if (!task) {
      throw invalidResponse()
    }
    return { ok: true, task }
  })
}

export function listComments(
  args: z.output<typeof ListComments>
): Promise<Reply<'dart.listComments'>> {
  return withToken('comments', async (token) => {
    const page = readDartPage(
      await dartRequest<unknown>(token, '/comments/list', {
        query: { task_id: args.taskId, limit: pageLimit(args.limit), offset: args.offset ?? 0 }
      })
    )
    const comments = page.results.flatMap((raw) => mapDartComment(raw) ?? [])
    return { ok: true, comments, totalCount: countAfterDrops(page, comments.length) }
  })
}

type NamedFields = {
  dartboard?: string
  type?: string
  status?: string
  priority?: string | null
  assignee?: string | null
  tags?: string[]
}

type NamedFieldCheck = { field: keyof NamedFields; values: string[]; allowed: string[] }

function namedFieldChecks(fields: NamedFields, config: DartWorkspaceConfig): NamedFieldCheck[] {
  const one = (value: string | null | undefined): string[] => (value ? [value] : [])
  return [
    { field: 'dartboard', values: one(fields.dartboard), allowed: config.dartboards },
    { field: 'type', values: one(fields.type), allowed: config.types },
    { field: 'status', values: one(fields.status), allowed: config.statuses },
    { field: 'priority', values: one(fields.priority), allowed: config.priorities },
    // Dart also accepts an email, which `/config` cannot confirm.
    {
      field: 'assignee',
      values: one(fields.assignee).filter((value) => !value.includes('@')),
      allowed: config.assignees
    },
    { field: 'tags', values: fields.tags ?? [], allowed: config.tags }
  ]
}

type Canonicalized = { fields: NamedFields } | { unknown: { field: string; value: string } }

function canonicalize(fields: NamedFields, config: DartWorkspaceConfig): Canonicalized {
  const result: NamedFields = { ...fields }
  for (const check of namedFieldChecks(fields, config)) {
    // An empty list means `/config` did not report the field; tags are always checked because
    // an unknown tag title silently creates a new tag.
    if (check.allowed.length === 0 && check.field !== 'tags') {
      continue
    }
    const canonical: string[] = []
    for (const value of check.values) {
      const match = check.allowed.find((entry) => entry.toLowerCase() === value.toLowerCase())
      if (match === undefined) {
        return { unknown: { field: check.field, value } }
      }
      canonical.push(match)
    }
    if (check.field === 'tags') {
      // `tags` replaces the whole set, so an omitted field must stay omitted.
      if (fields.tags !== undefined) {
        result.tags = canonical
      }
    } else if (canonical.length > 0) {
      result[check.field] = canonical[0]
    }
  }
  return { fields: result }
}

/** Dart ignores or auto-creates unknown names, so check them against `/config` (re-read once). */
async function validateNamedFields<T extends NamedFields>(
  token: string,
  fields: T
): Promise<{ fields: T } | { failure: DartFailure }> {
  const { dartboard, type, status, priority, assignee, tags } = fields
  if (!dartboard && !type && !status && !priority && !assignee && tags === undefined) {
    return { fields }
  }
  let checked = canonicalize(fields, await readConfig(token))
  if ('unknown' in checked) {
    checked = canonicalize(fields, await readConfig(token, { refresh: true }))
  }
  if ('unknown' in checked) {
    return {
      failure: taskProviderFailure(
        'dart.badRequest',
        `Unknown Dart ${checked.unknown.field}: ${checked.unknown.value}`
      )
    }
  }
  return { fields: { ...fields, ...checked.fields } }
}

export function createTask(args: z.output<typeof CreateTask>): Promise<Reply<'dart.createTask'>> {
  return withToken('create', async (token) => {
    const validated = await validateNamedFields(token, args)
    if ('failure' in validated) {
      return validated.failure
    }
    const task = mapDartTask(
      unwrapDartItem(
        await dartRequest<unknown>(token, '/tasks', {
          method: 'POST',
          body: { item: validated.fields }
        })
      )
    )
    if (!task) {
      throw invalidResponse()
    }
    return { ok: true, task }
  })
}

export function updateTask(args: z.output<typeof UpdateTask>): Promise<Reply<'dart.updateTask'>> {
  return withToken('update', async (token) => {
    const validated = await validateNamedFields(token, args.updates)
    if ('failure' in validated) {
      return validated.failure
    }
    const task = mapDartTask(
      unwrapDartItem(
        await dartRequest<unknown>(token, `/tasks/${encodeURIComponent(args.taskId)}`, {
          method: 'PUT',
          body: { item: { ...validated.fields, id: args.taskId } }
        })
      )
    )
    if (!task) {
      throw invalidResponse()
    }
    return { ok: true, task }
  })
}

export function addComment(args: z.output<typeof AddComment>): Promise<Reply<'dart.addComment'>> {
  return withToken('comment', async (token) => {
    const comment = mapDartComment(
      unwrapDartItem(
        await dartRequest<unknown>(token, '/comments', {
          method: 'POST',
          body: {
            item: { taskId: args.taskId, text: args.text, parentId: args.parentId }
          }
        })
      )
    )
    if (!comment) {
      throw new DartApiError('Dart returned an unreadable comment.', 'invalidResponse')
    }
    return { ok: true, comment }
  })
}
