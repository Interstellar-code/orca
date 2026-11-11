// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DART_SAVED_VIEWS_UPDATE_REQUIRED } from '../../../../../shared/dart/dart-saved-views'
import type { DartSavedViewsModel } from './dart-board-contracts'
import { TaskPageDartSavedViews } from './TaskPageDartSavedViews'

afterEach(cleanup)

const filters = {
  mine: false,
  status: null,
  dartboard: null,
  search: '',
  tag: null,
  priority: null,
  onHold: false
}
const mine = {
  id: 'mine',
  name: 'My work',
  filters,
  layout: 'list' as const,
  showEmptyColumns: false
}
const other = { ...mine, id: 'other', name: 'Bugs' }

function setup(overrides: Partial<DartSavedViewsModel> = {}) {
  const model: DartSavedViewsModel = {
    views: [mine, other],
    activeViewId: mine.id,
    modified: false,
    load: { state: 'ready', data: null, error: null, retry: vi.fn() },
    pending: false,
    supported: true,
    apply: vi.fn(async () => true),
    saveCurrent: vi.fn(async () => true),
    saveAsNew: vi.fn(async () => true),
    rename: vi.fn(async () => true),
    remove: vi.fn(async () => true),
    ...overrides
  }
  render(<TaskPageDartSavedViews model={model} />)
  return { user: userEvent.setup(), model }
}

it('applies the picked view', async () => {
  const { user, model } = setup()
  await user.click(screen.getByRole('button', { name: 'My work' }))
  await user.click(screen.getByRole('option', { name: /Bugs/ }))
  expect(model.apply).toHaveBeenCalledWith('other')
})

it('offers Save and the Modified mark only for a modified active view', async () => {
  const { user, model } = setup({ modified: true })
  expect(screen.getByText('Modified')).toBeTruthy()
  await user.click(screen.getByRole('button', { name: 'Save' }))
  expect(model.saveCurrent).toHaveBeenCalledOnce()
  cleanup()
  setup({ modified: false })
  expect(screen.queryByText('Modified')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
})

it('saves the current state as a new named view and blocks a duplicate name', async () => {
  const { user, model } = setup()
  await user.click(screen.getByRole('button', { name: 'My work' }))
  await user.click(screen.getByRole('button', { name: 'Save as new' }))
  await user.type(screen.getByRole('textbox', { name: 'Name' }), 'bugs')
  expect(screen.getByRole('alert').textContent).toContain('already exists')
  expect(screen.getByRole('button', { name: 'Save view' }).hasAttribute('disabled')).toBe(true)
  await user.clear(screen.getByRole('textbox', { name: 'Name' }))
  await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Triage')
  await user.click(screen.getByRole('button', { name: 'Save view' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(model.saveAsNew).toHaveBeenCalledWith('Triage')
})

it('keeps the dialog open when the host refuses the new view', async () => {
  const { user, model } = setup({ activeViewId: null, saveAsNew: vi.fn(async () => false) })
  await user.click(screen.getByRole('button', { name: 'Saved views' }))
  await user.click(screen.getByRole('button', { name: 'Save view' }))
  await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Triage')
  await user.click(screen.getByRole('button', { name: 'Save view' }))
  await waitFor(() => expect(model.saveAsNew).toHaveBeenCalledWith('Triage'))
  expect(screen.getByRole('dialog')).toBeTruthy()
})

it('renames and deletes a view from its edit dialog', async () => {
  const { user, model } = setup()
  await user.click(screen.getByRole('button', { name: 'My work' }))
  await user.click(screen.getByRole('button', { name: 'Edit Bugs' }))
  await user.clear(screen.getByRole('textbox', { name: 'Name' }))
  await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Defects')
  await user.click(screen.getByRole('button', { name: 'Rename' }))
  expect(model.rename).toHaveBeenCalledWith('other', 'Defects')
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

  await user.click(screen.getByRole('button', { name: 'My work' }))
  await user.click(screen.getByRole('button', { name: 'Edit Bugs' }))
  await user.click(screen.getByRole('button', { name: 'Delete view' }))
  expect(model.remove).toHaveBeenCalledWith('other')
})

it('shows the update text instead of the picker for a host without saved views', () => {
  setup({ supported: false })
  expect(screen.getByText(DART_SAVED_VIEWS_UPDATE_REQUIRED)).toBeTruthy()
  expect(screen.queryByRole('button')).toBeNull()
})
