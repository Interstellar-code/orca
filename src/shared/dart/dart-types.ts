import type { SecretAtRestProtection } from '../secret-at-rest-protection'

/**
 * Dart identity field list (Lanes A, B and D build `DartTaskProviderIdentity` from exactly these).
 * - `userId`: `user.id` from `GET /me` (12 characters); `/config` has no id.
 * Lane P confirmed Dart exposes no workspace id (`/me`, `/config` and tasks), so the user id is the
 * whole identity and the whole cache part.
 */
export const DART_TASK_PROVIDER_IDENTITY_FIELDS = ['userId'] as const

export type DartTaskProviderIdentity = {
  provider: 'dart'
  userId?: string | null
}

export const DART_API_BASE_URL = 'https://app.dartai.com/api/v0/public'
export const DART_APP_HOST = 'app.dartai.com'
export const DART_TASK_ID_LENGTH = 12

export type DartUser = {
  id: string
  name: string
  email?: string | null
}

export type DartConnectionStatus = {
  connected: boolean
  viewer: DartUser | null
  // Saved token decryption failures explain unreadable credentials while the connection remains configured.
  credentialError?: string
  // Older hosts omit protection, which means unknown rather than sealed.
  credentialProtection?: SecretAtRestProtection | null
}

/** `GET /config`: dartboards are full-path titles, assignees are names only, tags are plain strings. */
export type DartWorkspaceConfig = {
  dartboards: string[]
  statuses: string[]
  types: string[]
  tags: string[]
  priorities: string[]
  sizes: string[]
  assignees: string[]
}

/** Dart task ids; `dart.getTask` and relationship-aware list items carry them. */
export type DartTaskRelationships = {
  subtaskIds: string[]
  blockerIds: string[]
  blockingIds: string[]
  duplicateIds: string[]
  relatedIds: string[]
}

/** Names, not ids: Dart returns display names for people and full-path titles for dartboards. */
export type DartTask = {
  /** 12-character Dart task id. */
  id: string
  title: string
  /** `https://app.dartai.com/t/<id>-<slug>`, validated by `isTrustedDartHtmlUrl` before use. */
  htmlUrl: string
  /** Markdown; only `dart.getTask` returns it (list items have no description). */
  description?: string
  parentId?: string | null
  dartboard?: string | null
  type?: string | null
  status?: string | null
  /** Single-assignee workspaces return one display name or null. */
  assignee?: string | null
  tags: string[]
  priority?: string | null
  size?: string | number | null
  startAt?: string | null
  dueAt?: string | null
  createdBy?: string | null
  updatedBy?: string | null
  createdAt?: string
  updatedAt?: string
  completedAt?: string | null
  /** Absent means Dart returned no links data for this task. */
  relationships?: DartTaskRelationships
}

export type DartComment = {
  id: string
  parentId?: string | null
  taskId: string
  htmlUrl: string
  /** Display name, not a user id. */
  author: string
  /** Markdown. */
  text: string
  createdAt?: string
}

export type DartTaskPage = {
  tasks: DartTask[]
  /** Server total from `count`; an offset past the end returns no tasks with the same total. */
  totalCount: number
  /** Rows and `count` as Dart sent them, before unmappable rows were dropped; board cursors advance by `rowCount`. */
  raw?: { rowCount: number; totalCount: number }
}

export type DartHostFeatures = {
  board: boolean
  /** Absent means `false`. */
  relationships?: boolean
}

export type DartCommentPage = {
  comments: DartComment[]
  totalCount: number
  rawCount?: number
}
