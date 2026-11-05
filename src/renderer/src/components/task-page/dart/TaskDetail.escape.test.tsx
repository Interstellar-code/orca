// @vitest-environment happy-dom

import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DartWorkspaceConfig } from '../../../../../shared/dart/dart-types'
import {
  BASE,
  clearDirtyDrafts,
  editToDraft,
  startEditing
} from './dart-description-detail.test-support'
import {
  openRenderedDartDetail,
  setUpRenderedDartDetail,
  tearDownRenderedDartDetail
} from './dart-task-detail.test-support'

const CONFIG: DartWorkspaceConfig = {
  dartboards: ['Board A'],
  statuses: ['To-do', 'Done'],
  types: [],
  tags: ['search'],
  priorities: ['High'],
  sizes: [],
  assignees: []
}

beforeEach(() => void setUpRenderedDartDetail())
afterEach(() => {
  tearDownRenderedDartDetail()
  clearDirtyDrafts()
})

async function openDetail() {
  const detail = openRenderedDartDetail({ config: CONFIG })
  const shown = { ...detail.task, description: BASE }
  detail.host.addTask(shown)
  detail.showTask(shown)
  await screen.findByRole('heading', { name: 'Description' })
  return detail
}

// No stand-in for the sheet's Escape handling: these run the merged TaskDetail.
describe('Escape in the merged Dart detail', () => {
  it('closes an open picker first, then the sheet', async () => {
    const user = userEvent.setup()
    const { onClose } = await openDetail()

    await user.click(await screen.findByRole('combobox', { name: 'Status' }))
    await screen.findByRole('option', { name: 'Done' })
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('option', { name: 'Done' })).toBeNull())
    expect(onClose).not.toHaveBeenCalled()

    await user.click(await screen.findByRole('button', { name: 'Tags' }))
    await screen.findByRole('option', { name: 'search' })
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('option', { name: 'search' })).toBeNull())
    expect(onClose).not.toHaveBeenCalled()

    await user.keyboard('{Escape}')
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('ends a clean description edit without closing, then closes on the next Escape', async () => {
    const user = userEvent.setup()
    const { onClose } = await openDetail()
    await startEditing(user)

    await user.keyboard('{Escape}')
    const edit = await screen.findByRole('button', { name: 'Edit' })
    await waitFor(() => expect(document.activeElement).toBe(edit))
    expect(onClose).not.toHaveBeenCalled()

    await user.keyboard('{Escape}')
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('asks before discarding a dirty draft and never closes the sheet from the prompt', async () => {
    const user = userEvent.setup()
    const { onClose } = await openDetail()
    const textarea = await editToDraft(user, `${BASE} Mine.`)
    textarea.focus()

    await user.keyboard('{Escape}')
    const prompt = await screen.findByRole('dialog', { name: /Discard unsaved/ })
    expect(onClose).not.toHaveBeenCalled()
    await user.click(within(prompt).getByRole('button', { name: 'Discard' }))

    await screen.findByRole('button', { name: 'Edit' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('keeps a title or date edit’s Escape from closing the sheet', async () => {
    const user = userEvent.setup()
    const { onClose } = await openDetail()
    const title = await screen.findByRole('textbox', { name: 'Title' })

    await user.type(title, ' extra{Escape}')

    expect(onClose).not.toHaveBeenCalled()
  })
})
