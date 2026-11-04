import { checkDartRequestText } from '../../../../../shared/dart/dart-text-limits'
import type { DartTask } from '../../../../../shared/dart/dart-types'
import {
  getExecutionHostLabel,
  normalizeExecutionHostId
} from '../../../../../shared/execution-host'
import { translate } from '@/i18n/i18n'
import { getCommentBodySubmitState } from '@/lib/comment-body-submit-state'
import { taskProviderErrorMessage } from '@/lib/task-provider-error-copy'
import { dartTextTooLargeMessage } from '@/runtime/runtime-dart-write-client'
import type { AppState } from '@/store/types'
import {
  dartDraftKeyParts,
  dirtyDraftTexts,
  getDraft,
  type DartDraftValue
} from './dart-draft-store'
import type { DartWriteNotice } from './dart-detail-contracts'

/**
 * A write outlives the composer: the sheet closes and the section remounts per task, so the draft's
 * text, its in-flight write and its unknown outcome belong to the draft key, not to React state.
 * Reopening a draft can therefore never hand the user a Send that posts the same text twice.
 */
export type DartCommentSendState = {
  /** The text the box shows, or null until this draft is first typed in or sent: while null the
   * draft store is the source. It lives here, not in the component, so a result that lands after a
   * remount can still clear the draft the user is looking at. */
  text: string | null
  /** False when the bounded draft store refused this text, so the warning can say it is not saved. */
  saved: boolean
  inFlight: boolean
  /** An unknown outcome blocks Send until the user edits the text or sends again on purpose. */
  blocked: boolean
  /** A successful list read happened after the unknown write, so Send again may appear. */
  reconciled: boolean
  notice: DartWriteNotice | null
  /** The notice came from the local size check, so shortening the text clears it. */
  noticeIsSize: boolean
}

const EMPTY_STATE: DartCommentSendState = {
  text: null,
  saved: true,
  inFlight: false,
  blocked: false,
  reconciled: false,
  notice: null,
  noticeIsSize: false
}

const states = new Map<string, DartCommentSendState>()
// Synchronous claims: a shortcut and a click in the same tick must not both send.
const inFlightKeys = new Set<string>()
const listeners = new Set<() => void>()

export function getDartCommentSendState(draftKey: string): DartCommentSendState {
  return states.get(draftKey) ?? EMPTY_STATE
}

export function subscribeDartCommentSendState(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function patchDartCommentSendState(
  draftKey: string,
  next:
    | Partial<DartCommentSendState>
    | ((current: DartCommentSendState) => Partial<DartCommentSendState>)
): void {
  const current = getDartCommentSendState(draftKey)
  const merged = { ...current, ...(typeof next === 'function' ? next(current) : next) }
  const keys: (keyof DartCommentSendState)[] = Object.keys(merged).filter(
    (key): key is keyof DartCommentSendState => key in EMPTY_STATE
  )
  if (keys.every((key) => merged[key] === current[key])) {
    return
  }
  if (keys.every((key) => merged[key] === EMPTY_STATE[key])) {
    states.delete(draftKey)
  } else {
    states.set(draftKey, merged)
  }
  for (const listener of listeners) {
    listener()
  }
}

/** False means this draft already has a write in flight, whichever mount sent it. */
export function beginDartCommentSend(draftKey: string): boolean {
  if (inFlightKeys.has(draftKey)) {
    return false
  }
  inFlightKeys.add(draftKey)
  patchDartCommentSendState(draftKey, { inFlight: true })
  return true
}

export function endDartCommentSend(draftKey: string): void {
  inFlightKeys.delete(draftKey)
  patchDartCommentSendState(draftKey, { inFlight: false })
}

export type DartCommentSubmission =
  | { status: 'empty' }
  | { status: 'refused'; notice: DartWriteNotice }
  | { status: 'ready'; body: string }

/** Every local check Send makes, so a size notice can appear without sending anything. */
export function readDartCommentSubmission(text: string): DartCommentSubmission {
  const bodyState = getCommentBodySubmitState(text)
  if (bodyState.status === 'empty') {
    return { status: 'empty' }
  }
  if (bodyState.status === 'too-large-leading-whitespace') {
    return { status: 'refused', notice: dartCommentTooLargeNotice() }
  }
  const size = checkDartRequestText('comment', bodyState.body)
  if (!size.ok) {
    return {
      status: 'refused',
      notice: {
        kind: 'refused',
        message: dartTextTooLargeMessage({ amount: size.size, limit: size.limit, unit: size.unit })
      }
    }
  }
  return { status: 'ready', body: bodyState.body }
}

function dartCommentTooLargeNotice(): DartWriteNotice {
  return {
    kind: 'refused',
    message: translate(
      'auto.components.task.page.dart.DartCommentComposer.commentTooLarge',
      'This comment is too long to send to Dart. Shorten it and try again.'
    )
  }
}

/** What the box shows before this draft is typed in or sent: whatever the store kept. */
export function draftCommentText(draftKey: string): string {
  const stored = getDraft(draftKey)
  return typeof stored === 'string' ? stored : ''
}

/** The write may have landed: read the list, but never resend the same text on its own. */
export function dartCommentUnknownNotice(): DartWriteNotice {
  return {
    kind: 'unknown',
    message: translate(
      'auto.components.task.page.dart.DartCommentComposer.mayHavePosted',
      'Dart may have posted this comment. Check the list before sending again'
    )
  }
}

/** A refusal proves nothing landed, so Send works again and the draft stays as it was. */
export function dartCommentRefusedNotice(failure: {
  error?: unknown
  errorCode?: unknown
}): DartWriteNotice {
  return {
    kind: 'refused',
    message: translate(
      'auto.components.task.page.dart.DartCommentComposer.notSaved',
      "Comment wasn't saved: {{message}}",
      { message: taskProviderErrorMessage(failure) }
    )
  }
}

/** Dismissing the notice must not leave a disabled Send without a reason. */
export function dartCommentBlockedReason(): string {
  return translate(
    'auto.components.task.page.dart.DartCommentComposer.blockedReason',
    'Dart may have posted this comment. Check the list before sending again: edit the text, or use Send again if it is not there.'
  )
}

/** Name the drafts-full warning in words, keeping an id only where nothing is known. */
export function dartDraftsFullWarning(
  state: Pick<AppState, 'dartTaskCache'>,
  oldest: { key: string; value: DartDraftValue }
): string {
  const { kind, hostKey, taskId } = dartDraftKeyParts(oldest.key)
  // A host key is `local` or `runtime:<id>`, exactly the ids the label helper accepts.
  const host = normalizeExecutionHostId(hostKey)
  return translate(
    'auto.components.task.page.dart.DartCommentComposer.draftsFull',
    'Orca keeps a bounded number of unsaved Dart drafts, and this text is not saved yet. The oldest ({{kind}} on {{host}}, task {{task}}) has to be copied or discarded first.',
    {
      kind:
        kind === 'description'
          ? translate(
              'auto.components.task.page.dart.DartCommentComposer.draftKindDescription',
              'description'
            )
          : translate(
              'auto.components.task.page.dart.DartCommentComposer.draftKindComment',
              'comment'
            ),
      host: getExecutionHostLabel(host),
      task: cachedDartTaskTitle(state, taskId) ?? taskId
    }
  )
}

function cachedDartTaskTitle(
  state: Pick<AppState, 'dartTaskCache'>,
  taskId: string
): string | null {
  for (const entry of Object.values(state.dartTaskCache)) {
    const task: DartTask | null = entry.data
    if (task?.id === taskId && task.title.trim()) {
      return task.title.trim()
    }
  }
  return null
}

/** Copying the oldest draft copies its whole lineage, unresolved description hunks included. */
export function dartFullDraftCopyText(oldest: { key: string; value: DartDraftValue }): string {
  // The oldest dirty draft overall is its host's first entry, so `dirtyDraftTexts` starts with it.
  const [oldestText] = dirtyDraftTexts(dartDraftKeyParts(oldest.key).hostKey)
  if (oldestText !== undefined) {
    return oldestText
  }
  return typeof oldest.value === 'string' ? oldest.value : oldest.value.draft
}
