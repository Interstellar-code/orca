import { defineFixture } from '../../../component-fixtures/component-fixture'
import type { DartTask } from '../../../../../shared/dart/dart-types'
import type { Worktree } from '../../../../../shared/worktree/types'
import type {
  DartDetailCommentsApi,
  DartDetailDescriptionApi,
  DartDetailEditApi,
  DartNoticeApi,
  DartWriteNotice
} from './dart-detail-contracts'
import { fixtureComments, fixtureDetailTask } from './dart-task.mock'
import { getDartTaskOpenUrl } from './task-page-dart-list-model'
import { DartTaskDetailView, type DartTaskDetailViewProps } from './TaskDetailView'

const linkedWorkspace = {
  id: 'wt-fix-search',
  displayName: 'fix-search-ranking',
  branch: 'fix-search-ranking',
  path: '/work/fix-search-ranking'
} as Worktree

const noop = (): void => {}
const noPending: ReadonlySet<string> = new Set()
const notRun = (): Promise<never> => Promise.reject(new Error('Fixture does not write.'))

function fixtureNotice(notice: DartWriteNotice | null): DartNoticeApi {
  return { notice, dismissNotice: noop, recheckNotice: () => Promise.resolve() }
}

function fixtureProps(
  task: DartTask,
  options: {
    comments?: DartDetailCommentsApi['comments']
    notice?: DartWriteNotice | null
  } = {}
): DartTaskDetailViewProps {
  const openUrl = getDartTaskOpenUrl(task)
  const notice = fixtureNotice(options.notice ?? null)
  const edit: DartDetailEditApi = {
    task,
    openUrl,
    onUpdate: notRun,
    pendingFields: noPending,
    blockedFields: noPending,
    config: null,
    supportsWritesV2: false,
    viewerName: null
  }
  const commentsApi: DartDetailCommentsApi = {
    comments: options.comments ?? {
      status: 'ready',
      value: { comments: fixtureComments, totalCount: fixtureComments.length }
    },
    onAddComment: notRun,
    reloadComments: () => Promise.resolve(),
    appendLocalComment: noop,
    draftKey: 'fixture-comment'
  }
  const descriptionApi: DartDetailDescriptionApi = {
    task,
    openUrl,
    supportsWritesV2: false,
    description: { status: 'ready', value: task.description ?? '' },
    readLatestTask: notRun,
    onSavePatch: notRun,
    registerCloseGuard: () => noop,
    pendingFields: noPending,
    blockedFields: noPending,
    notice,
    draftKey: 'fixture-description'
  }
  return {
    edit,
    commentsApi,
    descriptionApi,
    notice,
    workspaces: [],
    onUse: noop,
    onClose: noop,
    onRetry: noop,
    onOpenWorkspace: noop
  }
}

export const loaded = defineFixture({
  width: 780,
  render: () => (
    <div className="h-[720px] bg-background text-foreground">
      <DartTaskDetailView {...fixtureProps(fixtureDetailTask)} workspaces={[linkedWorkspace]} />
    </div>
  )
})

export const invalidLink = defineFixture({
  width: 780,
  render: () => (
    <div className="h-[660px] bg-background text-foreground">
      <DartTaskDetailView
        {...fixtureProps(
          { ...fixtureDetailTask, htmlUrl: '' },
          { comments: { status: 'ready', value: { comments: [], totalCount: 0 } } }
        )}
      />
    </div>
  )
})

export const unknownNotice = defineFixture({
  width: 780,
  render: () => (
    <div className="h-[720px] bg-background text-foreground">
      <DartTaskDetailView
        {...fixtureProps(fixtureDetailTask, {
          notice: {
            kind: 'unknown',
            field: 'status',
            message:
              'Dart may have applied this change. Showing what Dart had when Orca last checked.',
            checkedAt: Date.UTC(2026, 10, 4, 12, 0, 0)
          }
        })}
        workspaces={[linkedWorkspace]}
      />
    </div>
  )
})

export const refusedNotice = defineFixture({
  width: 780,
  render: () => (
    <div className="h-[720px] bg-background text-foreground">
      <DartTaskDetailView
        {...fixtureProps(fixtureDetailTask, {
          notice: {
            kind: 'refused',
            field: 'priority',
            message: 'Dart did not accept this change.'
          }
        })}
        workspaces={[linkedWorkspace]}
      />
    </div>
  )
})
