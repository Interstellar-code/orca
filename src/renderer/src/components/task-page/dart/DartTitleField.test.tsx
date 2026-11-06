// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DartTitleField } from './DartTitleField'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

const IDLE = { pending: false, blocked: false, disabled: false }

afterEach(cleanup)

function renderTitle(title: string, onSave = vi.fn()) {
  const view = render(<DartTitleField title={title} state={IDLE} onSave={onSave} />)
  return {
    onSave,
    input: (): HTMLTextAreaElement => screen.getByRole<HTMLTextAreaElement>('textbox'),
    serverTitleChanged: (next: string) =>
      view.rerender(<DartTitleField title={next} state={IDLE} onSave={onSave} />)
  }
}

describe('DartTitleField reconcile with a changed server title', () => {
  it('follows Dart when the field is not focused and the typing was undone', () => {
    const title = renderTitle('Original')
    fireEvent.change(title.input(), { target: { value: 'Orig' } })
    fireEvent.change(title.input(), { target: { value: 'Original' } })

    title.serverTitleChanged('Renamed in Dart')

    expect(title.input().value).toBe('Renamed in Dart')
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('keeps what the user typed, says Dart changed the title, and saves only on the user save', () => {
    const title = renderTitle('Original')
    fireEvent.change(title.input(), { target: { value: 'My edit' } })

    title.serverTitleChanged('Renamed in Dart')

    expect(title.input().value).toBe('My edit')
    expect(screen.getByRole('status').textContent).toContain('title changed in Dart')
    expect(title.onSave).not.toHaveBeenCalled()

    fireEvent.blur(title.input())
    expect(title.onSave).toHaveBeenCalledExactlyOnceWith('My edit')
  })

  it('drops the notice and the draft when the user typed what Dart now has', () => {
    const title = renderTitle('Original')
    fireEvent.change(title.input(), { target: { value: 'Same as Dart' } })

    title.serverTitleChanged('Same as Dart')

    expect(screen.queryByRole('status')).toBeNull()
    fireEvent.blur(title.input())
    expect(title.onSave).not.toHaveBeenCalled()
  })

  it('does not jump while focused when the user types the old title back, and never saves it over Dart', () => {
    const title = renderTitle('Original')
    fireEvent.focus(title.input())
    fireEvent.change(title.input(), { target: { value: 'Original!' } })
    title.serverTitleChanged('Renamed in Dart')
    fireEvent.change(title.input(), { target: { value: 'Original' } })

    expect(title.input().value).toBe('Original')

    fireEvent.blur(title.input())
    expect(title.onSave).not.toHaveBeenCalled()
    expect(title.input().value).toBe('Renamed in Dart')
  })
})
