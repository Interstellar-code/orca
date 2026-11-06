import { fireEvent, screen } from '@testing-library/react'
import type userEvent from '@testing-library/user-event'
import type { FakeDartHost } from '@/store/slices/dart/dart-fake-runtime.test-support'
import type { DartDescriptionUpdate } from './dart-description-patch'
import { applyLikeDart, DartRefused } from './dart-description-reference.test-support'
import { clearDraft, oldestDirtyDraft } from './dart-draft-store'
import { openRenderedDartDetail } from './dart-task-detail.test-support'

export const BASE = 'First paragraph stays as it is.\n\nSecond paragraph gets the edit.'
export const REFUSED = {
  ok: false,
  error: 'Dart did not accept this change.',
  errorCode: 'dart.descriptionPatchRefused',
  outcome: 'notApplied'
} as const
export const LOST = {
  ok: false,
  error: 'Failed to update Dart task.',
  errorCode: 'dart.updateFailed',
  outcome: 'unknown'
} as const

// T4b's sheet prevents the dismissal for Esc inside this marker; TaskDetail.tsx is not this task's file, so this does the same.
export function honourEscapeLocal(event: KeyboardEvent): void {
  if (
    event.key === 'Escape' &&
    event.target instanceof Element &&
    event.target.closest('[data-dart-escape-local]')
  ) {
    event.preventDefault()
  }
}

export function setDescription(host: FakeDartHost, id: string, description: string): void {
  host.tasks.set(id, { ...host.tasks.get(id)!, description })
}

/** The shared fake answers every patch with fixed text; this host applies Dart's real rules. */
export function applyPatchesLikeDart(host: FakeDartHost, beforeWrite?: () => void): void {
  const handle = host.handle.bind(host)
  host.handle = async (method, params) => {
    if (method !== 'dart.updateTaskDescription') {
      return handle(method, params)
    }
    beforeWrite?.()
    const id = params.taskId ?? ''
    const before = host.tasks.get(id)?.description ?? ''
    // The fake's params type covers `dart.updateTask`; this method's `updates` is the patch array.
    const updates: DartDescriptionUpdate[] = Array.isArray(params.updates) ? params.updates : []
    let patched: string
    try {
      patched = applyLikeDart(before, updates)
    } catch (error) {
      if (error instanceof DartRefused) {
        host.requests.push({ method, params })
        return REFUSED
      }
      throw error
    }
    const reply = await handle(method, params)
    if (host.tasks.get(id)?.description !== before) {
      setDescription(host, id, patched)
    }
    return 'ok' in reply && reply.ok ? { ok: true, task: host.tasks.get(id) } : reply
  }
}

export async function openWith(description: string) {
  const detail = openRenderedDartDetail()
  const task = detail.addTask('desc')
  const shown = { ...task, description }
  detail.host.addTask(shown)
  detail.showTask(shown)
  await screen.findByRole('heading', { name: 'Description' })
  return { ...detail, task: shown }
}

export async function findEditorTextarea(): Promise<HTMLTextAreaElement> {
  const textarea = await screen.findByRole('textbox', { name: 'Description (Markdown)' })
  if (!(textarea instanceof HTMLTextAreaElement)) {
    throw new Error('The description editor is not a textarea.')
  }
  return textarea
}

export async function startEditing(
  user: ReturnType<typeof userEvent.setup>
): Promise<HTMLTextAreaElement> {
  await user.click(await screen.findByRole('button', { name: 'Edit' }))
  return findEditorTextarea()
}

export function typeInto(textarea: HTMLTextAreaElement, text: string): void {
  fireEvent.change(textarea, { target: { value: text } })
}

export async function editToDraft(
  user: ReturnType<typeof userEvent.setup>,
  text: string
): Promise<HTMLTextAreaElement> {
  const textarea = await startEditing(user)
  typeInto(textarea, text)
  return textarea
}

export function saveButton(): HTMLElement {
  return screen.getByRole('button', { name: /^(Save|Saving…)/ })
}

/** The draft store is one per session, and dirty drafts left behind would count against the limit. */
export function clearDirtyDrafts(): void {
  for (let oldest = oldestDirtyDraft(); oldest; oldest = oldestDirtyDraft()) {
    clearDraft(oldest.key)
  }
}
