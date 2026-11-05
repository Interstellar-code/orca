import type { DartComment } from '../../../../../shared/dart/dart-types'
import { defineFixture } from '../../../component-fixtures/component-fixture'
import { dartDraftKey, setDraft } from './dart-draft-store'
import type { DartDetailCommentsApi } from './dart-detail-contracts'
import { fixtureComments } from './dart-task.mock'
import { DartTaskDetailComments } from './TaskDetailComments'

const fixtureIdentity = { hostKey: 'fixture-host', accountKey: 'fixture-account' }
const draftKey = (taskId: string): string => dartDraftKey(fixtureIdentity, taskId, 'comment')

const noop = (): void => {}
const draftText = 'The archived project still shows up in saved searches.'

const reply: DartComment = {
  id: 'cm3QrStUvWxY',
  parentId: 'cm1AbCdEfGhI',
  taskId: 'aB3dE5gH7jK9',
  htmlUrl: 'https://app.dartai.com/c/cm3QrStUvWxY',
  author: 'Priya Example',
  text: 'Also hits saved searches: the archived project comes back after a reload.',
  createdAt: new Date(Date.now() - 90 * 60_000).toISOString()
}

const threadComments: readonly DartComment[] = [...fixtureComments, reply]

function fixtureApi(options: {
  draftKey: string
  onAddComment?: DartDetailCommentsApi['onAddComment']
}): DartDetailCommentsApi & {
  readLatestComments(): Promise<DartComment[]>
  viewerName: string
} {
  return {
    comments: {
      status: 'ready',
      value: { comments: threadComments, totalCount: threadComments.length }
    },
    onAddComment:
      options.onAddComment ??
      ((): Promise<never> => Promise.reject(new Error('Fixture does not write.'))),
    reloadComments: () => Promise.resolve(),
    readLatestComments: () => Promise.resolve([...threadComments]),
    viewerName: 'Priya Example',
    appendLocalComment: noop,
    draftKey: options.draftKey
  }
}

function Sheet({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <div className="bg-background text-foreground">{children}</div>
}

function findButton(frame: HTMLElement, text: string): HTMLButtonElement | null {
  return (
    [...frame.querySelectorAll('button')].find((button) => button.textContent?.trim() === text) ??
    null
  )
}

async function nextTick(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>()
  setTimeout(resolve, 10)
  await promise
}

/** The unknown outcome keeps the draft and offers a fresh comments check. */
async function waitForCheckAgain(frame: HTMLElement): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const button = findButton(frame, 'Check again')
    if (button && !button.disabled) {
      return
    }
    await nextTick()
  }
  throw new Error('Comments fixture: the unknown-outcome check never became available.')
}

function send(frame: HTMLElement): void {
  const button = frame.querySelector<HTMLButtonElement>('button[aria-label="Send comment"]')
  if (!button) {
    throw new Error('Comments fixture: the send button is missing.')
  }
  button.click()
}

export const thread = defineFixture({
  width: 720,
  render: () => (
    <Sheet>
      <DartTaskDetailComments {...fixtureApi({ draftKey: draftKey('thread') })} onRetry={noop} />
    </Sheet>
  )
})

export const replyComposer = defineFixture({
  width: 720,
  setup: () => setDraft(draftKey('reply'), draftText, { dirty: true }),
  render: () => (
    <Sheet>
      <DartTaskDetailComments {...fixtureApi({ draftKey: draftKey('reply') })} onRetry={noop} />
    </Sheet>
  ),
  interact: (frame) => {
    const button = findButton(frame, 'Reply')
    if (!button) {
      throw new Error('Comments fixture: no Reply button to start a reply from.')
    }
    button.click()
  }
})

export const unknownOutcome = defineFixture({
  width: 720,
  setup: () => setDraft(draftKey('unknown'), draftText, { dirty: true }),
  render: () => (
    <Sheet>
      <DartTaskDetailComments
        {...fixtureApi({
          draftKey: draftKey('unknown'),
          onAddComment: async () => ({
            ok: false,
            outcome: 'unknown',
            error: 'Dart request timed out.'
          })
        })}
        onRetry={noop}
      />
    </Sheet>
  ),
  interact: async (frame) => {
    send(frame)
    await waitForCheckAgain(frame)
  }
})

export const duplicate = defineFixture({
  width: 720,
  setup: () => setDraft(draftKey('duplicate'), draftText, { dirty: true }),
  render: () => (
    <Sheet>
      <DartTaskDetailComments
        {...fixtureApi({ draftKey: draftKey('duplicate') })}
        readLatestComments={() =>
          Promise.resolve([
            ...threadComments,
            {
              ...reply,
              id: 'duplicate',
              parentId: null,
              text: draftText,
              createdAt: new Date().toISOString()
            }
          ])
        }
        onRetry={noop}
      />
    </Sheet>
  ),
  interact: async (frame) => {
    send(frame)
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (findButton(frame, 'Post anyway')) {
        return
      }
      await nextTick()
    }
    throw new Error('Comments fixture: duplicate warning did not appear.')
  }
})
