import { translate } from '@/i18n/i18n'
import { dartTextTooLargeMessage } from '@/runtime/runtime-dart-write-client'
import type { DartDetailDescriptionApi } from './dart-detail-contracts'
import {
  buildDescriptionUpdates,
  type DartDescriptionPatch,
  type DartDescriptionUpdate
} from './dart-description-patch'
import { clearDraft, getDraft, setDraft, type DartDescriptionDraft } from './dart-draft-store'

/** `intended` is the text of a save whose outcome is unknown (D3); it travels with the lineage until a save or the user settles it, so a task switch or reopen keeps it. */
export type DartDescriptionLineage = DartDescriptionDraft & { intended?: string }

export type DartDescriptionSaveOutcome =
  /** Nothing for the editor to open; it reloads the lineage from the draft store. */
  | { kind: 'settled' }
  | { kind: 'conflict'; latest: string }
  | { kind: 'message'; message: string }
  | { kind: 'unknown'; intended: string; latest: string | null }

type SaveApi = Pick<DartDetailDescriptionApi, 'onSavePatch' | 'readLatestTask'>

// A write outlives the editor that sent it, so an editor reopened on the same draft can pick up its result.
const savesInFlight = new Map<string, Promise<DartDescriptionSaveOutcome>>()

export function descriptionSaveInFlight(
  key: string
): Promise<DartDescriptionSaveOutcome> | undefined {
  return savesInFlight.get(key)
}

export function isDescriptionLineageDirty(lineage: DartDescriptionDraft): boolean {
  return lineage.draft !== lineage.base || lineage.unresolved.length > 0
}

export function loadDescriptionLineage(key: string): DartDescriptionLineage | null {
  const stored = getDraft(key)
  return stored && typeof stored !== 'string' && isDescriptionLineageDirty(stored) ? stored : null
}

async function readFreshDescription(read: SaveApi['readLatestTask']): Promise<string | null> {
  try {
    const result = await read()
    return result.ok ? (result.task.description ?? '') : null
  } catch {
    return null
  }
}

function refusalMessage(patch: Extract<DartDescriptionPatch, { kind: 'refused' }>): string {
  if (patch.reason === 'too-large') {
    return dartTextTooLargeMessage(patch.size)
  }
  return patch.reason === 'empty-base'
    ? translate(
        'auto.components.task.page.dart.DartDescription.emptyBase',
        "An empty description can't be edited from Orca. Add one in Dart."
      )
    : translate(
        'auto.components.task.page.dart.DartDescription.nonUniqueAnchor',
        "This change can't be sent safely because the text it touches appears more than once. Edit a more specific passage, or edit it in Dart."
      )
}

/** The reply is what Dart holds, so it replaces the text; hunks still unresolved stay with the lineage. */
function settleSavedLineage(key: string, sent: DartDescriptionDraft, saved: string): void {
  if (getDraft(key) !== sent) {
    return
  }
  if (sent.unresolved.length === 0) {
    clearDraft(key)
  } else {
    setDraft(key, { base: saved, draft: saved, unresolved: sent.unresolved }, { dirty: true })
  }
}

async function sendPatch(args: {
  key: string
  lineage: DartDescriptionLineage
  updates: DartDescriptionUpdate[]
  api: SaveApi
  isCurrent: () => boolean
}): Promise<DartDescriptionSaveOutcome> {
  const { key, lineage, updates, api, isCurrent } = args
  const result = await api.onSavePatch(updates)
  if (result.ok) {
    settleSavedLineage(key, lineage, result.task.description ?? '')
    return { kind: 'settled' }
  }
  const isRefusal = result.errorCode === 'dart.descriptionPatchRefused'
  if (result.outcome !== 'unknown' && !isRefusal) {
    return { kind: 'settled' }
  }
  if (result.outcome === 'unknown' && getDraft(key) === lineage) {
    const unconfirmed: DartDescriptionLineage = { ...lineage, intended: lineage.draft }
    setDraft(key, unconfirmed, { dirty: true })
  }
  // Once the task changed, this read would land on the task now on screen.
  const latest = isCurrent() ? await readFreshDescription(api.readLatestTask) : null
  if (result.outcome === 'unknown') {
    return { kind: 'unknown', intended: lineage.draft, latest }
  }
  return latest !== null && latest !== lineage.base
    ? { kind: 'conflict', latest }
    : { kind: 'settled' }
}

/** The single save path: a forced read, then the patch only if Dart still holds `base`. Null means the task changed during the read and nothing was sent. */
export async function runDescriptionSave(args: {
  key: string
  lineage: DartDescriptionLineage
  api: SaveApi
  isCurrent: () => boolean
}): Promise<DartDescriptionSaveOutcome | null> {
  const { key, lineage, api, isCurrent } = args
  const fresh = await readFreshDescription(api.readLatestTask)
  if (!isCurrent()) {
    return null
  }
  if (fresh === null) {
    return {
      kind: 'message',
      message: translate(
        'auto.components.task.page.dart.DartDescription.preSaveReadFailed',
        "Couldn't check Dart before saving."
      )
    }
  }
  if (fresh !== lineage.base) {
    return { kind: 'conflict', latest: fresh }
  }
  const patch = buildDescriptionUpdates(lineage.base, lineage.draft)
  if (patch.kind === 'refused') {
    return { kind: 'message', message: refusalMessage(patch) }
  }
  const sent = sendPatch({ key, lineage, updates: patch.updates, api, isCurrent }).finally(() =>
    savesInFlight.delete(key)
  )
  savesInFlight.set(key, sent)
  return sent
}
