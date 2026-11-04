import { useCallback, useEffect, useRef, useState } from 'react'
import type { DartDetailDescriptionApi, DartWriteNotice } from './dart-detail-contracts'
import { restoreBaseLineEndings } from './dart-description-patch'
import { rebaseDescriptionLineage } from './dart-description-rebase'
import {
  descriptionSaveInFlight,
  isDescriptionLineageDirty,
  loadDescriptionLineage,
  runDescriptionSave,
  type DartDescriptionSaveOutcome
} from './dart-description-save-flow'
import {
  clearDraft,
  getDraft,
  oldestDirtyDraft,
  setDraft,
  type DartDescriptionDraft,
  type DartDraftValue
} from './dart-draft-store'
import { useDartDescriptionDiscardPrompt } from './use-dart-description-discard-prompt'
import { useDartDescriptionUnknownNotice } from './use-dart-description-unknown-notice'

export type DartDescriptionConflict = {
  latest: string
  editorText: string
  rebased: DartDescriptionDraft
}

export function useDartDescriptionEditor(api: DartDetailDescriptionApi) {
  const { draftKey: key, description, notice, onSavePatch, readLatestTask } = api
  const { pendingFields, blockedFields, registerCloseGuard } = api
  const [lineage, setLineageState] = useState(() => loadDescriptionLineage(key))
  const [saving, setSaving] = useState(() => descriptionSaveInFlight(key) !== undefined)
  const [conflict, setConflict] = useState<DartDescriptionConflict | null>(null)
  const [localNotice, setLocalNotice] = useState<DartWriteNotice | null>(null)
  const [fullDraft, setFullDraft] = useState<{ key: string; value: DartDraftValue } | null>(null)
  const discardPrompt = useDartDescriptionDiscardPrompt()
  const lineageRef = useRef(lineage)
  const savingRef = useRef(saving)
  const mountedRef = useRef(true)
  const editButtonRef = useRef<HTMLButtonElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const focusNextRef = useRef<'edit' | 'textarea' | null>(null)
  const latestRef = useRef({ notice, pendingFields, blockedFields })
  useEffect(() => {
    latestRef.current = { notice, pendingFields, blockedFields }
  })

  const showLineage = useCallback((next: DartDescriptionDraft | null) => {
    lineageRef.current = next
    setLineageState(next)
  }, [])

  const commitLineage = useCallback(
    (next: DartDescriptionDraft): boolean => {
      if (setDraft(key, next, { dirty: isDescriptionLineageDirty(next) }) === 'full') {
        setFullDraft(oldestDirtyDraft())
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
              rebased: rebaseDescriptionLineage(current, latest)
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
      const next = { ...current, base: intended }
      if (isDescriptionLineageDirty(next)) {
        commitLineage(next)
      } else {
        leaveEditingRef.current()
      }
    },
    [commitLineage]
  )

  const shownText = description.status === 'ready' ? description.value : null
  const { sectionNotice, setIntended } = useDartDescriptionUnknownNotice({
    notice,
    shownText,
    base: lineage?.base ?? null,
    onConflict: openConflict,
    onAcceptedIntended
  })

  const leaveEditing = useCallback(() => {
    focusNextRef.current = 'edit'
    clearDraft(key)
    setLocalNotice(null)
    setIntended(null)
    setFullDraft(null)
    showLineage(null)
  }, [key, setIntended, showLineage])
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
      if (outcome.kind === 'message') {
        setLocalNotice({ kind: 'refused', message: outcome.message })
      } else if (outcome.kind === 'conflict') {
        clearOwnRefusal()
        openConflict(outcome.latest)
      } else if (outcome.kind === 'unknown') {
        setIntended(outcome.intended)
        if (
          current &&
          outcome.latest !== null &&
          outcome.latest !== current.base &&
          outcome.latest !== outcome.intended
        ) {
          openConflict(outcome.latest)
        }
      } else {
        // The store holds the outcome: gone when saved, moved on when hunks remain, untouched otherwise.
        const stored = getDraft(key)
        const next = stored && typeof stored !== 'string' ? stored : null
        if (!next && current) {
          focusNextRef.current = 'edit'
        }
        if (next !== current) {
          showLineage(next)
        }
      }
    },
    [clearOwnRefusal, key, openConflict, setIntended, showLineage]
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
  const confirmDiscard = useCallback(() => {
    setConflict(null)
    leaveEditing()
    settleDiscard(true)
  }, [leaveEditing, settleDiscard])

  const cancel = useCallback(() => {
    const current = lineageRef.current
    if (current && isDescriptionLineageDirty(current)) {
      void askDiscard()
    } else {
      leaveEditing()
    }
  }, [askDiscard, leaveEditing])

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

  const editing = lineage !== null
  const restoreFocus = useCallback((): boolean => {
    const target = focusNextRef.current === 'edit' ? editButtonRef : textareaRef
    if (focusNextRef.current && target.current) {
      focusNextRef.current = null
      target.current.focus()
      return true
    }
    return false
  }, [])
  useEffect(() => {
    restoreFocus()
  }, [editing, restoreFocus])

  return {
    lineage,
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
      if (current) {
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
        commitLineage(conflict.rebased)
        setConflict(null)
      }
    },
    discardFromConflict: (): void => {
      setConflict(null)
      leaveEditing()
    },
    dismissLocalNotice: () => setLocalNotice(null),
    discardOldestDraft: (): void => {
      if (fullDraft) {
        clearDraft(fullDraft.key)
        setFullDraft(null)
      }
    }
  }
}

export type DartDescriptionEditorState = ReturnType<typeof useDartDescriptionEditor>
