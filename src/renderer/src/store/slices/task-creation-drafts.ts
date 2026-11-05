import type { StateCreator } from 'zustand'
import type { DartTask } from '../../../../shared/dart/dart-types'
import type {
  DartCreateDraft,
  DartWriteNotice
} from '@/components/task-page/dart/dart-detail-contracts'
import type { AppState } from '../types'

/** Session-only text drafts for Linear/Jira creation dialogs; picker selections stay fresh. */
export type NewLinearIssueDraft = { title: string; body: string }
export type NewLinearProjectDraft = { name: string; description: string; content: string }
export type NewJiraIssueDraft = { title: string; body: string }

export type DartCreateSession = {
  draft: DartCreateDraft
  lookupDraft: DartCreateDraft | null
  unknown: boolean
  submitting: boolean
  notice: DartWriteNotice | null
  listChecked: boolean
  matches: readonly DartTask[]
  truncated: boolean
  matchesDismissed: boolean
  lookingUp: boolean
  lookupSequence: number
  editable: boolean
}

export const EMPTY_DART_CREATE_SESSION: DartCreateSession = {
  draft: {
    title: '',
    description: '',
    dartboard: '',
    type: '',
    status: '',
    priority: '',
    assignee: '',
    tags: [],
    dueAt: ''
  },
  lookupDraft: null,
  unknown: false,
  submitting: false,
  notice: null,
  listChecked: false,
  matches: [],
  truncated: false,
  matchesDismissed: false,
  lookingUp: false,
  lookupSequence: 0,
  editable: true
}

/** Empty forms do not replace a later open with a meaningless draft. */
export function isTaskCreationDraftContentful(fields: Record<string, string>): boolean {
  return Object.values(fields).some((value) => value.trim().length > 0)
}

export type TaskCreationDraftsSlice = {
  newLinearIssueDraft: NewLinearIssueDraft | null
  setNewLinearIssueDraft: (draft: NewLinearIssueDraft) => void
  clearNewLinearIssueDraft: () => void
  newLinearProjectDraft: NewLinearProjectDraft | null
  setNewLinearProjectDraft: (draft: NewLinearProjectDraft) => void
  clearNewLinearProjectDraft: () => void
  newJiraIssueDraft: NewJiraIssueDraft | null
  setNewJiraIssueDraft: (draft: NewJiraIssueDraft) => void
  clearNewJiraIssueDraft: () => void
  dartCreateOwners: Record<string, { activeOwner: string | null; keys: Record<string, string> }>
  setDartCreateOwner: (host: string, owner: string, key: string) => void
  dartCreateSessions: Record<string, DartCreateSession>
  patchDartCreateSession: (key: string, patch: Partial<DartCreateSession>) => void
  clearDartCreateSession: (key: string) => void
}

export const createTaskCreationDraftsSlice: StateCreator<
  AppState,
  [],
  [],
  TaskCreationDraftsSlice
> = (set) => ({
  newLinearIssueDraft: null,
  setNewLinearIssueDraft: (draft) => set({ newLinearIssueDraft: draft }),
  clearNewLinearIssueDraft: () => set({ newLinearIssueDraft: null }),
  newLinearProjectDraft: null,
  setNewLinearProjectDraft: (draft) => set({ newLinearProjectDraft: draft }),
  clearNewLinearProjectDraft: () => set({ newLinearProjectDraft: null }),
  newJiraIssueDraft: null,
  setNewJiraIssueDraft: (draft) => set({ newJiraIssueDraft: draft }),
  clearNewJiraIssueDraft: () => set({ newJiraIssueDraft: null }),
  dartCreateOwners: {},
  setDartCreateOwner: (host, owner, key) =>
    set((state) => ({
      dartCreateOwners: {
        ...state.dartCreateOwners,
        [host]: {
          activeOwner: owner,
          keys: { ...state.dartCreateOwners[host]?.keys, [owner]: key }
        }
      }
    })),
  dartCreateSessions: {},
  patchDartCreateSession: (key, patch) =>
    set((state) => ({
      dartCreateSessions: {
        ...state.dartCreateSessions,
        [key]: { ...(state.dartCreateSessions[key] ?? EMPTY_DART_CREATE_SESSION), ...patch }
      }
    })),
  clearDartCreateSession: (key) =>
    set((state) => {
      const sessions = { ...state.dartCreateSessions }
      delete sessions[key]
      return { dartCreateSessions: sessions }
    })
})
