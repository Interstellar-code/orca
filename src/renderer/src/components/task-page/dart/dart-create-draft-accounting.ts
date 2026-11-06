import { useAppStore } from '@/store'
import type { DartCreateSession } from '@/store/slices/task-creation-drafts'
import { clearDraft, dartDraftKey, setDraft } from './dart-draft-store'

const NEW_TASK_DRAFT_ID = 'new-task'

function parseSessionKey(sessionKey: string): { hostKey: string; accountKey: string } {
  const [hostKey, , owner]: [string, string, string | null] = JSON.parse(sessionKey)
  return { hostKey, accountKey: owner ?? 'unknown' }
}

function draftStoreKey(sessionKey: string): string {
  return dartDraftKey(parseSessionKey(sessionKey), NEW_TASK_DRAFT_ID, 'create')
}

/** The typed text of a New task draft; picks alone are cheap to redo and do not make it dirty. */
export function dartCreateDraftText(draft: DartCreateSession['draft']): string {
  return [draft.title.trim(), draft.description.trim()].filter((part) => part !== '').join('\n\n')
}

function markUnsaved(sessionKey: string, session: DartCreateSession, unsaved: boolean): void {
  if (Boolean(session.draftUnsaved) !== unsaved) {
    useAppStore.getState().patchDartCreateSession(sessionKey, { draftUnsaved: unsaved })
  }
}

function syncSession(
  sessionKey: string,
  session: DartCreateSession,
  previous?: DartCreateSession
): void {
  const text = dartCreateDraftText(session.draft)
  const storeKey = draftStoreKey(sessionKey)
  if (text === '') {
    clearDraft(storeKey)
    markUnsaved(sessionKey, session, false)
    return
  }
  const changed = !previous || dartCreateDraftText(previous.draft) !== text
  if (changed || session.draftUnsaved) {
    // `full` leaves the text in the session only, so the dialog warns and the Disconnect prompt still counts it.
    markUnsaved(sessionKey, session, setDraft(storeKey, text, { dirty: true }) === 'full')
  }
}

let watching = false

/** Puts New task drafts under the same bounded accounting as comment and description drafts (D13). */
export function watchDartCreateDraftAccounting(): void {
  if (watching) {
    return
  }
  watching = true
  useAppStore.subscribe((state, previous) => {
    if (state.dartCreateSessions === previous.dartCreateSessions) {
      return
    }
    for (const [key, session] of Object.entries(state.dartCreateSessions)) {
      if (session !== previous.dartCreateSessions[key]) {
        syncSession(key, session, previous.dartCreateSessions[key])
      }
    }
    for (const key of Object.keys(previous.dartCreateSessions)) {
      if (!(key in state.dartCreateSessions)) {
        clearDraft(draftStoreKey(key))
      }
    }
  })
}

function hostSessionKeys(hostKey: string): string[] {
  return Object.keys(useAppStore.getState().dartCreateSessions).filter(
    (key) => parseSessionKey(key).hostKey === hostKey
  )
}

/** Texts the bounded store refused, which only the session holds. */
export function unsavedDartCreateTextsForHost(hostKey: string): string[] {
  const sessions = useAppStore.getState().dartCreateSessions
  return hostSessionKeys(hostKey).flatMap((key) => {
    const session = sessions[key]
    return session?.draftUnsaved ? [dartCreateDraftText(session.draft)] : []
  })
}

export function clearDartCreateSessionsForHost(hostKey: string): void {
  const { clearDartCreateSession } = useAppStore.getState()
  for (const key of hostSessionKeys(hostKey)) {
    clearDartCreateSession(key)
  }
}

/** Discarding the oldest draft when it is a New task draft also drops its session. */
export function clearDartCreateSessionForDraftKey(draftKey: string): void {
  const { clearDartCreateSession } = useAppStore.getState()
  for (const key of Object.keys(useAppStore.getState().dartCreateSessions)) {
    if (draftStoreKey(key) === draftKey) {
      clearDartCreateSession(key)
    }
  }
}
