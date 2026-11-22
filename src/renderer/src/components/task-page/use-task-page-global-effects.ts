import type { TaskPageJiraSummaryGenerationModel } from './jira/creation/use-task-page-jira-summary-generation'
import { useEffect } from 'react'
import { addAppKeyListener, removeAppKeyListener } from '@/lib/keyboard/app-keyboard-router'
import { hasVisibleOverlay } from '@/lib/overlay-interaction/visible-overlay'

// A non-modal dialog elsewhere (e.g. another pane's restart prompt) does not own the page's Esc.
const NON_MODAL_DIALOG =
  '[role="dialog"]:not([aria-modal="true"]):not([data-slot="popover-content"])'

function isTextEntryTarget(target: HTMLElement): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  )
}

export function useTaskPageGlobalEffects(model: TaskPageJiraSummaryGenerationModel) {
  const {
    closeTaskPage,
    closeTaskDetailPage,
    taskSource,
    activeModal,
    linearStatusContextKey,
    preflightStatusChecked,
    preflightStatusContextKey,
    checkLinearConnection,
    refreshPreflightStatus,
    expectedPreflightContextKey,
    jiraStatusContextKey,
    checkJiraConnection,
    dartStatusContextKey,
    dartStatusReady,
    checkDartConnection,
    providerRuntimeContextKey,
    preflightStatusCurrent,
    linearStatusReady,
    jiraStatusReady,
    githubListPending,
    tasksRefreshing,
    tasksFiltering,
    dialogWorkItem,
    newIssueOpen,
    selectedLinearIssue,
    selectedJiraIssue,
    selectedDartTask,
    dartConnectOpen,
    newLinearIssueOpen,
    newJiraIssueOpen
  } = model
  const githubTasksBusy = githubListPending || tasksRefreshing || tasksFiltering
  // GitHub and Linear details replace the list in-page; the Jira detail is a Sheet that owns Esc.
  const detailPageOpen =
    (taskSource === 'github' && Boolean(dialogWorkItem)) ||
    (taskSource === 'linear' && Boolean(selectedLinearIssue))
  useEffect(() => {
    // Why: when a modal is open, let it own Esc dismissal.
    if (
      selectedJiraIssue ||
      selectedDartTask ||
      dartConnectOpen ||
      newIssueOpen ||
      newLinearIssueOpen ||
      newJiraIssueOpen ||
      activeModal !== 'none'
    ) {
      return
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') {
        return
      }
      const target = event.target
      if (!(target instanceof HTMLElement)) {
        return
      }

      if (detailPageOpen) {
        // Why: fields (reply, description, mentions) and overlays on the detail own Esc; the
        // router runs first in capture, so blurring here would also trigger their cancel.
        if (
          event.defaultPrevented ||
          isTextEntryTarget(target) ||
          hasVisibleOverlay({ ignoreMatches: NON_MODAL_DIALOG })
        ) {
          return
        }
        event.preventDefault()
        closeTaskDetailPage()
        return
      }

      // Why: open menus/popovers/selects own Esc; capture-phase leave would steal it from Radix.
      if (hasVisibleOverlay({ ignoreMatches: NON_MODAL_DIALOG })) {
        return
      }

      // A modal owns Esc even when disabling a field moved focus to body.
      if (document.querySelector('[role="dialog"][aria-modal="true"], [role="alertdialog"]')) {
        return
      }

      // Esc first blurs input; leave the page only when focus is outside one.
      if (isTextEntryTarget(target)) {
        event.preventDefault()
        target.blur()
        return
      }
      event.preventDefault()
      closeTaskPage()
    }
    addAppKeyListener('keydown', onKeyDown)
    return () => removeAppKeyListener('keydown', onKeyDown)
  }, [
    activeModal,
    closeTaskDetailPage,
    closeTaskPage,
    detailPageOpen,
    newIssueOpen,
    newLinearIssueOpen,
    newJiraIssueOpen,
    selectedJiraIssue,
    selectedDartTask,
    dartConnectOpen
  ])
  useEffect(() => {
    if (!preflightStatusCurrent || !preflightStatusChecked) {
      void refreshPreflightStatus()
    }
    if (!linearStatusReady) {
      void checkLinearConnection()
    }
    if (!jiraStatusReady) {
      void checkJiraConnection()
    }
    // Dart is opt-in: only probe it when the Tasks page is showing Dart.
    if (taskSource === 'dart' && !dartStatusReady) {
      void checkDartConnection()
    }
  }, [
    checkDartConnection,
    checkJiraConnection,
    dartStatusContextKey,
    dartStatusReady,
    taskSource,
    checkLinearConnection,
    expectedPreflightContextKey,
    jiraStatusContextKey,
    jiraStatusReady,
    linearStatusContextKey,
    linearStatusReady,
    providerRuntimeContextKey,
    preflightStatusContextKey,
    preflightStatusChecked,
    preflightStatusCurrent,
    refreshPreflightStatus
  ])

  const nextModel = model as typeof model & {
    githubTasksBusy: typeof githubTasksBusy
  }
  nextModel.githubTasksBusy = githubTasksBusy
  return nextModel
}
export type TaskPageGlobalEffectsModel = ReturnType<typeof useTaskPageGlobalEffects>
