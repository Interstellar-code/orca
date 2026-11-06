import { useCallback, useEffect, useRef, useState } from 'react'
import type { DartDetailDescriptionApi, DartWriteNotice } from './dart-detail-contracts'
import { restoreBaseLineEndings } from './dart-description-patch'
import { rebaseDescriptionLineage } from './dart-description-rebase'
import {
  descriptionSaveInFlight,
  isDescriptionLineageDirty,
  loadDescriptionLineage,
  runDescriptionSave,
  type DartDescriptionLineage,
  type DartDescriptionSaveOutcome
} from './dart-description-save-flow'
import { dartFullDraftTarget, type DartFullDraftTarget } from './dart-draft-eviction'
import { clearDraft, getDraft, setDraft } from './dart-draft-store'
import { useDartDescriptionDiscardPrompt } from './use-dart-description-discard-prompt'
import { useDartDescriptionFocus } from './use-dart-description-focus'
import { useDartDescriptionUnknownNotice } from './use-dart-description-unknown-notice'

export type DartDescriptionConflict = {
  latest: string
  editorText: string
  rebased: DartDescriptionLineage
  writeMayHaveLanded: boolean
}

export function useDartDescriptionEditor(api: DartDetailDescriptionApi) {
  const { draftKey: key, description, notice, onSavePatch, readLatestTask } = api
  const { pendingFields, blockedFields, registerCloseGuard, supportsWritesV2 } = api
  const [lineage, setLineageState] = useState(() => loadDescriptionLineage(key))
  const [saving, setSaving] = useState(() => descriptionSaveInFlight(key) !== undefined)
  const [conflict, setConflict] = useState<DartDescriptionConflict | null>(null)
  const [localNotice, setLocalNotice] = useState<DartWriteNotice | null>(null)
  const [fullDraft, setFullDraft] = useState<DartFullDraftTarget | null>(null)
  const [preview, setPreview] = useState(false)
  const discardPrompt = useDartDescriptionDiscardPrompt()
  const lineageRef = useRef(lineage)
  const savingRef = useRef(saving)
  const mountedRef = useRef(true)
  const editing = lineage !== null && supportsWritesV2
  const { editButtonRef, textareaRef, focusNextRef, restoreFocus } =
    useDartDescriptionFocus(editing)
  const latestRef = useRef({ notice, pendingFields, blockedFields })
  useEffect(() => {
    latestRef.current = { notice, pendingFields, blockedFields }
  })

  const showLineage = useCallback((next: DartDescriptionLineage | null) => {
    lineageRef.current = next
    setLineageState(next)
  }, [])

  const commitLineage = useCallback(
    (next: DartDescriptionLineage): boolean => {
      if (setDraft(key, next, { dirty: isDescriptionLineageDirty(next) }) === 'full') {
        setFullDraft(dartFullDraftTarget())
        return false
      }
      setFullDraft(null)
      showLineage(next)
      return true
    },
    [key, showLineage]
  )

  const openConflict = useCallback((latest: string) => {
    const current = lineageRef.current
    if (current) {
      setConflict((open) =>
        open?.latest === latest
          ? open
          : {
              latest,
              editorText: current.draft,
              rebased: rebaseDescriptionLineage(current, latest),
              writeMayHaveLanded: current.intended !== undefined
            }
      )
    }
  }, [])

  const leaveEditingRef = useRef<() => void>(() => {})
  const onAcceptedIntended = useCallback(
    (intended: string) => {
      const current = lineageRef.current
      if (!current) {
        return
      }
      // The user accepted that Dart holds this text, so it is the new starting point.
      const next = { base: intended, draft: current.draft, unresolved: current.unresolved }
      if (isDescriptionLineageDirty(next)) {
        commitLineage(next)
      } else {
        leaveEditingRef.current()
      }
    },
    [commitLineage]
  )

  const shownText = description.status === 'ready' ? description.value : null
  const sectionNotice = useDartDescriptionUnknownNotice({
    notice,
    shownText,
    base: lineage?.base ?? null,
    intended: lineage?.intended ?? null,
    onConflict: openConflict,
    onAcceptedIntended
  })

  const leaveEditing = useCallback(() => {
    focusNextRef.current = 'edit'
    clearDraft(key)
    setLocalNotice(null)
    setFullDraft(null)
    showLineage(null)
  }, [focusNextRef, key, showLineage])
  useEffect(() => {
    leaveEditingRef.current = leaveEditing
  }, [leaveEditing])

  // An earlier refusal is moot once the user tries again or the conflict dialog explains it.
  const clearOwnRefusal = useCallback(() => {
    const open = latestRef.current.notice
    if (open.notice?.field === 'description' && open.notice.kind === 'refused') {
      open.dismissNotice()
    }
  }, [])

  const applyOutcome = useCallback(
    (outcome: DartDescriptionSaveOutcome) => {
      savingRef.current = false
      if (!mountedRef.current) {
        return
      }
      setSaving(false)
      const current = lineageRef.current
      // The store holds what a write decided: gone when saved, moved on when hunks remain, marked when unknown.
      const stored = getDraft(key)
      const next = stored && typeof stored !== 'string' ? stored : null
      if (outcome.kind === 'message') {
        setLocalNotice({ kind: 'refused', message: outcome.message })
      } else if (outcome.kind === 'conflict') {
        clearOwnRefusal()
        openConflict(outcome.latest)
      } else if (outcome.kind === 'unknown') {
        showLineage(next)
        if (
          next &&
          outcome.latest !== null &&
          outcome.latest !== next.base &&
          outcome.latest !== outcome.intended
        ) {
          openConflict(outcome.latest)
        }
      } else {
        if (!next && current) {
          focusNextRef.current = 'edit'
        }
        if (next !== current) {
          showLineage(next)
        }
      }
    },
    [clearOwnRefusal, focusNextRef, key, openConflict, showLineage]
  )

  const save = useCallback(async () => {
    const current = lineageRef.current
    const latest = latestRef.current
    if (
      !current ||
      current.draft === current.base ||
      savingRef.current ||
      latest.pendingFields.has('description') ||
      latest.blockedFields.has('description')
    ) {
      return
    }
    savingRef.current = true
    setSaving(true)
    setLocalNotice(null)
    clearOwnRefusal()
    const outcome = await runDescriptionSave({
      key,
      lineage: current,
      api: { onSavePatch, readLatestTask },
      isCurrent: () => mountedRef.current
    })
    if (outcome) {
      applyOutcome(outcome)
    }
  }, [applyOutcome, clearOwnRefusal, key, onSavePatch, readLatestTask])

  const { ask: askDiscard, settle: settleDiscard } = discardPrompt
  const saveInFlight = useCallback(
    () => savingRef.current || latestRef.current.pendingFields.has('description'),
    []
  )
  const confirmDiscard = useCallback(() => {
    if (saveInFlight()) {
      return
    }
    setConflict(null)
    leaveEditing()
    settleDiscard(true)
  }, [leaveEditing, saveInFlight, settleDiscard])

  const cancel = useCallback(() => {
    if (saveInFlight()) {
      return
    }
    const current = lineageRef.current
    if (current && isDescriptionLineageDirty(current)) {
      void askDiscard()
    } else {
      leaveEditing()
    }
  }, [askDiscard, leaveEditing, saveInFlight])

  const dirty = lineage !== null && isDescriptionLineageDirty(lineage)
  useEffect(
    () => (dirty ? registerCloseGuard(askDiscard) : undefined),
    [askDiscard, dirty, registerCloseGuard]
  )

  useEffect(() => {
    mountedRef.current = true
    const inFlight = descriptionSaveInFlight(key)
    if (inFlight) {
      savingRef.current = true
      void inFlight.then(applyOutcome)
    }
    return () => {
      mountedRef.current = false
    }
  }, [applyOutcome, key])

  return {
    lineage,
    editing,
    preview,
    togglePreview: () => setPreview((shown) => !shown),
    saving,
    conflict,
    localNotice,
    fullDraft,
    discardPromptOpen: discardPrompt.open,
    sectionNotice,
    editButtonRef,
    textareaRef,
    saveDisabled:
      lineage === null ||
      lineage.draft === lineage.base ||
      saving ||
      pendingFields.has('description') ||
      blockedFields.has('description'),
    savePending: saving || pendingFields.has('description'),
    saveBlocked: blockedFields.has('description'),
    startEditing: (text: string): void => {
      focusNextRef.current = 'textarea'
      setPreview(false)
      commitLineage({ base: text, draft: text, unresolved: [] })
    },
    changeDraft: (text: string): void => {
      const current = lineageRef.current
      if (current) {
        commitLineage({ ...current, draft: restoreBaseLineEndings(current.base, text) })
      }
    },
    removeHunk: (id: string): void => {
      const current = lineageRef.current
      if (current && !saveInFlight()) {
        commitLineage({
          ...current,
          unresolved: current.unresolved.filter((hunk) => hunk.id !== id)
        })
      }
    },
    save,
    cancel,
    /** The sheet leaves Esc inside `data-dart-escape-local` to this section; keys bubbling through a dialog's portal are that dialog's. */
    onSectionKeyDown: (event: React.KeyboardEvent<HTMLElement>): void => {
      if (
        event.key === 'Escape' &&
        editing &&
        event.target instanceof Node &&
        event.currentTarget.contains(event.target)
      ) {
        cancel()
      }
    },
    confirmDiscard,
    declineDiscard: () => settleDiscard(false),
    /** For a dialog closing on a focus change it made: true means focus is already placed. */
    restoreFocus,
    backToEditing: (): void => {
      if (conflict) {
        focusNextRef.current = 'textarea'
        setPreview(false)
        commitLineage(conflict.rebased)
        setConflict(null)
      }
    },
    discardFromConflict: (): void => {
      setConflict(null)
      leaveEditing()
    },
    dismissLocalNotice: () => setLocalNotice(null),
    /** The warning already discarded the draft; the editor only closes it. */
    discardOldestDraft: (): void => setFullDraft(null)
  }
}

export type DartDescriptionEditorState = ReturnType<typeof useDartDescriptionEditor>
