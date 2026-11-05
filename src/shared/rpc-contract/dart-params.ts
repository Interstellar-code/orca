/**
 * Dart (dartai.com) RPC contract, shared by the host (Lane A), renderer (Lane B), CLI (Lane C) and
 * mobile (Lane D).
 *
 * Transport: the host calls `https://app.dartai.com/api/v0/public` with `Authorization: Bearer
 * <token>`. The token never leaves the host after `dart.connect`, and no layer may log, trace or
 * echo `dart.connect` params, including in error paths.
 *
 * Failures: every method resolves to `DartResult<T>`; a failure is `taskProviderFailure('dart.*')`
 * from shared/task-provider-failure.ts, never a free-text-only error.
 *
 * "Mine" has one source: `dart.status` and `dart.connect` return the signed-in user from `GET /me`
 * (`{isLoggedIn, user: {id, name, email}}`); callers pass that `viewer.id` as `listTasks.assigneeId`.
 *
 * Rules from the live API (Phase 0 2026-10-26 and Lane P 2026-10-31, read-only):
 * 1. Never send `no_defaults` (`no_defaults=false` applies hidden workspace default filters: 883
 *    tasks became 0). Always send explicit filters instead.
 * 2. Dart silently ignores unknown query parameters (a typo, `q` or `search` returns every task), so
 *    the host sends only the names in `DART_TASK_LIST_QUERY_PARAMS` and `ListTasks` rejects unknown
 *    keys.
 * 3. Paging is `limit`/`offset`: default 100, maximum 250 (larger values are silently capped);
 *    totals come from `count`; an offset past the end returns an empty page. Server order is opaque
 *    (not by created or updated time).
 * 4. `dartboard` takes the full-path title exactly as `dart.config` returns it (case-insensitive;
 *    short last-segment names are ambiguous). `title` and `description` are case-insensitive
 *    substring searches; there is no generic text query.
 * 5. Error bodies are not always JSON. 401: JSON `{detail}` -> `dart.unauthorized`. Unknown
 *    well-formed task id: 404 JSON `{errors: [string]}`; malformed id: 404 text/html with an empty
 *    body; both -> `dart.taskNotFound`. Comments for an unknown task: 400 JSON bare `[string]`.
 *    Other 400s are JSON field errors -> `dart.badRequest`. 429 -> `dart.rateLimited` (no limit or
 *    rate-limit header seen yet). 5xx and network errors -> the operation's failure code
 *    (`dart.loadFailed`, `dart.createFailed`, `dart.updateFailed`, `dart.commentFailed`).
 * 6. List items carry no description; `GET /tasks/{id}` wraps the task as `{item}` and adds the
 *    markdown description, attachments and relationships.
 * 7. Every `htmlUrl` from Dart (tasks `/t/<id>-<slug>`, comments `/c/<id>`) passes
 *    `isTrustedDartHtmlUrl` (https, host exactly `app.dartai.com`) before it is stored in a link or
 *    opened; a failing item drops the URL rather than the task.
 *
 * Writes (`createTask`, `updateTask`, `addComment`) are UNVERIFIED against the live API (shapes are
 * from the spec only). `POST /tasks {item: {title, ...}}`; `PUT /tasks/{id} {item: {id, ...}}` is a
 * partial update (omitted fields keep their values, `id` equals the path id); `POST /comments
 * {item: {taskId, text, parentId?}}`. Writes take names, not ids: dartboard (full-path title),
 * status, type, assignee (name or email; null clears), priority. `tags` replaces the whole set
 * (`[]` clears) and UNKNOWN TAG TITLES CREATE NEW TAGS, so callers validate tag names against
 * `dart.config` tags before sending.
 *
 * Description edits go only through `dart.updateTaskDescription` (`POST /tasks/{id}/update-description
 * {updates}`): a targeted patch that Dart refuses when `oldText` or `anchorText` no longer matches
 * uniquely. `occurrence` is never sent. A 400 maps to `dart.descriptionPatchRefused` with a fixed
 * message (Dart may echo task text); it is not proof of an external edit. Every failed write carries
 * `outcome`: `notApplied` or `unknown` (see `DartFailure`).
 */
import { z } from 'zod'
import { DART_TASK_ID_PATTERN } from '../dart/dart-issue-url'
import type {
  DartComment,
  DartCommentPage,
  DartConnectionStatus,
  DartTask,
  DartTaskPage,
  DartUser,
  DartWorkspaceConfig
} from '../dart/dart-types'
import {
  DART_COMMENT_MAX_LENGTH,
  DART_REQUEST_TEXT_MAX_BYTES,
  DART_TITLE_MAX_LENGTH,
  checkDartRequestText,
  type DartTextField
} from '../dart/dart-text-limits'
import type { TaskProviderErrorCode } from '../task-provider-failure'
import { OptionalPlainString, OptionalString, requiredString } from './rpc-param-primitives'

export const DART_LIST_PAGE_DEFAULT = 100
export const DART_LIST_PAGE_MAX = 250

export const DART_METHOD_NAMES = [
  'dart.status',
  'dart.connect',
  'dart.disconnect',
  'dart.testConnection',
  'dart.config',
  'dart.listTasks',
  'dart.getTask',
  'dart.listComments',
  'dart.createTask',
  'dart.updateTask',
  'dart.updateTaskDescription',
  'dart.addComment'
] as const

export type DartMethodName = (typeof DART_METHOD_NAMES)[number]

// Credential changes need accounts-admin so a paired phone with workspace access cannot swap the token.
export const DART_METHOD_PERMISSIONS = {
  'dart.status': 'workspace',
  'dart.connect': 'accounts-admin',
  'dart.disconnect': 'accounts-admin',
  'dart.testConnection': 'accounts-admin',
  'dart.config': 'workspace',
  'dart.listTasks': 'workspace',
  'dart.getTask': 'workspace',
  'dart.listComments': 'workspace',
  'dart.createTask': 'workspace',
  'dart.updateTask': 'workspace',
  'dart.updateTaskDescription': 'workspace',
  'dart.addComment': 'workspace'
} as const satisfies Record<DartMethodName, 'workspace' | 'accounts-admin'>

export const DART_UNVERIFIED_WRITE_METHODS: readonly DartMethodName[] = [
  'dart.createTask',
  'dart.updateTask',
  'dart.updateTaskDescription',
  'dart.addComment'
]

/** Contract filter name -> Dart query parameter. The host sends nothing outside this map. */
export const DART_TASK_LIST_QUERY_PARAMS = {
  assigneeId: 'assignee_id',
  assignee: 'assignee',
  dartboard: 'dartboard',
  status: 'status',
  tag: 'tag',
  priority: 'priority',
  isCompleted: 'is_completed',
  title: 'title',
  description: 'description'
} as const

const DartTaskId = z
  .string()
  .trim()
  .regex(DART_TASK_ID_PATTERN, 'Expected a 12-character Dart task id')

const PageLimit = z.number().int().min(1).max(DART_LIST_PAGE_MAX).optional()
const PageOffset = z.number().int().min(0).optional()

/**
 * `dart.connect`: never log these params. Token help (Lane B localizes it): "In Dart, open Settings >
 * Account (your profile icon at the top left, then Account), scroll down and copy your Authorization
 * token. It starts with dsa_." API access needs a Dart Premium plan or above; expiry is undocumented.
 */
export const Connect = z.object({
  apiToken: requiredString('API token is required')
})

export const ListTasks = z
  .object({
    assigneeId: OptionalString,
    /** Name or email. */
    assignee: OptionalString,
    /** Full-path title from `dart.config`. */
    dartboard: OptionalString,
    status: OptionalString,
    tag: OptionalString,
    priority: OptionalString,
    isCompleted: z.boolean().optional(),
    title: OptionalString,
    description: OptionalString,
    limit: PageLimit,
    offset: PageOffset
  })
  .strict()
  .optional()

export const TaskId = z.object({
  taskId: DartTaskId
})

export const ListComments = z.object({
  taskId: DartTaskId,
  limit: PageLimit,
  offset: PageOffset
})

// Text caps are Orca's own (Dart's schema has none); the byte cap keeps a remote request under the host frame limit.
function textWithin(field: DartTextField, message: string) {
  return z.union([
    z.string().refine((text) => checkDartRequestText(field, text).ok, message),
    z.undefined()
  ])
}

const TitleWithinLimit = textWithin(
  'title',
  `Title is longer than ${DART_TITLE_MAX_LENGTH} characters`
)
const DescriptionWithinLimit = textWithin(
  'description',
  `Description is larger than ${DART_REQUEST_TEXT_MAX_BYTES} bytes`
)

// A datetime with offset (older hosts) or a date-only value (`dart.writes.v2`).
const DartIsoDate = z
  .union([z.string().datetime({ offset: true }), z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()])
  .optional()

const DartSize = z.union([z.string(), z.number().int(), z.null()]).optional()

export const CreateTask = z.object({
  title: requiredString('Title is required').pipe(
    z
      .string()
      .refine(
        (title) => checkDartRequestText('title', title).ok,
        `Title is longer than ${DART_TITLE_MAX_LENGTH} characters`
      )
  ),
  description: OptionalPlainString.pipe(DescriptionWithinLimit).optional(),
  dartboard: OptionalString,
  type: OptionalString,
  status: OptionalString,
  priority: OptionalString,
  assignee: OptionalString,
  tags: z.array(requiredString('Tag cannot be empty')).optional(),
  startAt: DartIsoDate,
  dueAt: DartIsoDate,
  size: DartSize
})

export const UpdateTask = z.object({
  taskId: DartTaskId,
  updates: z
    .object({
      title: OptionalString.pipe(TitleWithinLimit).optional(),
      description: OptionalPlainString.pipe(DescriptionWithinLimit).optional(),
      dartboard: OptionalString,
      type: OptionalString,
      status: OptionalString,
      priority: z.union([z.string(), z.null()]).optional(),
      assignee: z.union([z.string(), z.null()]).optional(),
      tags: z.array(requiredString('Tag cannot be empty')).optional(),
      startAt: DartIsoDate,
      dueAt: DartIsoDate,
      size: DartSize
    })
    .refine((updates) => Object.values(updates).some((value) => value !== undefined), {
      message: 'At least one update is required'
    })
})

// Never `occurrence`: a non-unique target must make Dart refuse, not pick one. The strict object turns a stray key into an invalid-argument reply.
const DescriptionUpdate = z
  .object({
    type: z.enum(['replace', 'insert_before', 'insert_after', 'delete']),
    oldText: z.string().min(1).optional(),
    anchorText: z.string().min(1).optional(),
    newText: z.string().optional()
  })
  .strict()
  .superRefine((update, ctx) => {
    const required = {
      replace: ['oldText', 'newText'],
      delete: ['oldText'],
      insert_before: ['anchorText', 'newText'],
      insert_after: ['anchorText', 'newText']
    } as const
    const needed: readonly string[] = required[update.type]
    for (const field of ['oldText', 'anchorText', 'newText'] as const) {
      if (needed.includes(field) && update[field] === undefined) {
        ctx.addIssue({ code: 'custom', message: `${update.type} needs ${field}`, path: [field] })
      } else if (!needed.includes(field) && update[field] !== undefined) {
        ctx.addIssue({
          code: 'custom',
          message: `${update.type} does not take ${field}`,
          path: [field]
        })
      }
    }
  })

export const UpdateTaskDescription = z.object({
  taskId: DartTaskId,
  updates: z
    .array(DescriptionUpdate)
    .min(1)
    .refine(
      (updates) =>
        checkDartRequestText(
          'descriptionPatch',
          updates
            .flatMap((update) => [update.oldText, update.anchorText, update.newText])
            .filter((text) => text !== undefined)
        ).ok,
      `Description change is larger than ${DART_REQUEST_TEXT_MAX_BYTES} bytes`
    )
})

export const AddComment = z.object({
  taskId: DartTaskId,
  text: requiredString('Comment text is required').pipe(
    z
      .string()
      .refine(
        (text) => checkDartRequestText('comment', text).ok,
        `Comment is longer than ${DART_COMMENT_MAX_LENGTH} characters`
      )
  ),
  parentId: OptionalString
})

/** `outcome` is set on failed writes only: `notApplied` means Dart certainly did not apply it, `unknown` means it may have. */
export type DartWriteOutcome = 'notApplied' | 'unknown'
export type DartFailure = {
  ok: false
  error: string
  errorCode: TaskProviderErrorCode
  outcome?: DartWriteOutcome
}
export type DartResult<T extends object> = ({ ok: true } & T) | DartFailure

export type DartListTasksArgs = z.input<typeof ListTasks>
export type DartListCommentsArgs = z.input<typeof ListComments>
export type DartCreateTaskArgs = z.input<typeof CreateTask>
export type DartUpdateTaskArgs = z.input<typeof UpdateTask>
export type DartUpdateTaskDescriptionArgs = z.input<typeof UpdateTaskDescription>
export type DartAddCommentArgs = z.input<typeof AddComment>

/** Params and reply per method; Lane A registers each with `DART_METHOD_PERMISSIONS[name]`. */
export type DartMethodContract = {
  'dart.status': { params: null; reply: DartResult<DartConnectionStatus> }
  'dart.connect': { params: z.input<typeof Connect>; reply: DartResult<{ viewer: DartUser }> }
  'dart.disconnect': { params: null; reply: DartResult<object> }
  'dart.testConnection': { params: null; reply: DartResult<{ viewer: DartUser }> }
  'dart.config': { params: null; reply: DartResult<{ config: DartWorkspaceConfig }> }
  'dart.listTasks': { params: DartListTasksArgs; reply: DartResult<DartTaskPage> }
  'dart.getTask': { params: z.input<typeof TaskId>; reply: DartResult<{ task: DartTask }> }
  'dart.listComments': { params: DartListCommentsArgs; reply: DartResult<DartCommentPage> }
  'dart.createTask': { params: DartCreateTaskArgs; reply: DartResult<{ task: DartTask }> }
  'dart.updateTask': { params: DartUpdateTaskArgs; reply: DartResult<{ task: DartTask }> }
  'dart.updateTaskDescription': {
    params: DartUpdateTaskDescriptionArgs
    reply: DartResult<{ task: DartTask }>
  }
  'dart.addComment': { params: DartAddCommentArgs; reply: DartResult<{ comment: DartComment }> }
}
