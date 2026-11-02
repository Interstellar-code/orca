import { DART_TASK_ID_PATTERN, parseDartTaskUrl } from '../../shared/dart/dart-issue-url'
import type {
  DartCreateTaskArgs,
  DartListCommentsArgs,
  DartListTasksArgs,
  DartUpdateTaskArgs
} from '../../shared/rpc-contract/dart-params'
import { DART_LIST_PAGE_MAX } from '../../shared/rpc-contract/dart-params'
import { readTextOrFileFlag } from '../command-body-input'
import type { HandlerContext } from '../dispatch'
import {
  getOptionalNonNegativeIntegerFlag,
  getOptionalPositiveIntegerFlag,
  getOptionalStringFlag,
  getRepeatedStringFlag,
  getRequiredStringFlag
} from '../flags'
import { RuntimeClientError } from '../runtime-client'
import { callDart } from './dart-call'

const DART_DESCRIPTION_MAX_CHARACTERS = 100_000

/** Version 1 takes a task id or a task URL; Dart exposes no key lookup. */
export function resolveDartTaskId(input: string): string {
  const trimmed = input.trim()
  const parsed = parseDartTaskUrl(trimmed)
  if (parsed) {
    return parsed.taskId
  }
  if (DART_TASK_ID_PATTERN.test(trimmed)) {
    return trimmed
  }
  throw new RuntimeClientError(
    'invalid_argument',
    'Expected a 12-character Dart task id or a task URL such as https://app.dartai.com/t/<id>.'
  )
}

export function dartTaskId(context: HandlerContext): string {
  return resolveDartTaskId(getRequiredStringFlag(context.flags, 'id'))
}

export function readDartPage(context: HandlerContext): { limit?: number; offset?: number } {
  const limit = getOptionalPositiveIntegerFlag(context.flags, 'limit')
  if (limit !== undefined && limit > DART_LIST_PAGE_MAX) {
    throw new RuntimeClientError(
      'invalid_argument',
      `--limit must be at most ${DART_LIST_PAGE_MAX}; page further with --offset.`
    )
  }
  return { limit, offset: getOptionalNonNegativeIntegerFlag(context.flags, 'offset') }
}

export function buildDartCommentQuery(context: HandlerContext): DartListCommentsArgs {
  return { taskId: dartTaskId(context), ...readDartPage(context) }
}

/** A bare flag is an error, and blank names are absent rather than sent to Dart. */
function dartName(context: HandlerContext, name: string): string | undefined {
  const value = getOptionalStringFlag(context.flags, name)?.trim()
  return value ? value : undefined
}

/** Dart's partial update clears a field when it receives null; `--assignee null` says exactly that. */
function nullableDartName(context: HandlerContext, name: string): string | null | undefined {
  const value = dartName(context, name)
  return value === 'null' ? null : value
}

/** `--mine` resolves the signed-in user id from `dart.status`, the only source of that id. */
async function mineAssigneeId(context: HandlerContext): Promise<string> {
  const { result } = await callDart<{ viewer: { id: string } | null }>(context, 'dart.status')
  if (!result.viewer) {
    throw new RuntimeClientError(
      'dart_not_connected',
      'Dart did not report a signed-in user, so --mine cannot resolve your id. Check the Dart connection in Orca settings.'
    )
  }
  return result.viewer.id
}

// Dart silently ignores unknown query parameters, so the CLI names every filter it sends itself.
export async function buildDartListQuery(context: HandlerContext): Promise<DartListTasksArgs> {
  const mine = context.flags.get('mine') === true
  const assignee = dartName(context, 'assignee')
  if (mine && assignee) {
    throw new RuntimeClientError('invalid_argument', 'Pass either --mine or --assignee, not both.')
  }
  return {
    ...(mine ? { assigneeId: await mineAssigneeId(context) } : {}),
    assignee,
    dartboard: dartName(context, 'dartboard'),
    status: dartName(context, 'status'),
    tag: dartName(context, 'tag'),
    priority: dartName(context, 'priority'),
    title: dartName(context, 'title'),
    description: dartName(context, 'text'),
    ...readDartPage(context)
  }
}

/** `--tag` replaces the whole set; an explicit empty value clears every tag. */
export function readDartTags(context: HandlerContext): string[] | undefined {
  if (!context.flags.has('tag')) {
    return undefined
  }
  // A bare --tag already fails in the flag reader; only an explicit empty value reaches here.
  return [
    ...new Set(getRepeatedStringFlag(context.flags, 'tag').map((name) => name.trim()))
  ].filter((name) => name.length > 0)
}

async function readDartDescription(context: HandlerContext): Promise<string | undefined> {
  const description = await readTextOrFileFlag(context.flags, context.cwd, 'description', false)
  if (description !== undefined && description.length > DART_DESCRIPTION_MAX_CHARACTERS) {
    throw new RuntimeClientError(
      'invalid_argument',
      `Dart description must be at most ${DART_DESCRIPTION_MAX_CHARACTERS} characters.`
    )
  }
  return description
}

export async function buildDartCreateRequest(context: HandlerContext): Promise<DartCreateTaskArgs> {
  return {
    title: getRequiredStringFlag(context.flags, 'title').trim(),
    description: await readDartDescription(context),
    dartboard: dartName(context, 'dartboard'),
    type: dartName(context, 'type'),
    status: dartName(context, 'status'),
    priority: dartName(context, 'priority'),
    assignee: dartName(context, 'assignee'),
    tags: readDartTags(context)
  }
}

export async function buildDartUpdateRequest(context: HandlerContext): Promise<DartUpdateTaskArgs> {
  const updates: DartUpdateTaskArgs['updates'] = {
    title: dartName(context, 'title'),
    description: await readDartDescription(context),
    status: dartName(context, 'status'),
    priority: nullableDartName(context, 'priority'),
    assignee: nullableDartName(context, 'assignee'),
    tags: readDartTags(context)
  }
  if (Object.values(updates).every((value) => value === undefined)) {
    throw new RuntimeClientError(
      'invalid_argument',
      'Pass at least one of --title, --description, --status, --priority, --assignee or --tag.'
    )
  }
  return { taskId: dartTaskId(context), updates }
}
