// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DartSetupSteps } from './TaskSourceDartSetup'

const mocks = vi.hoisted(() => ({ dialogOpen: [] as boolean[] }))

vi.mock('@/components/dart/dart-connect-dialog', () => ({
  DartConnectDialog: ({ open, onConnected }: { open: boolean; onConnected?: () => void }) => {
    mocks.dialogOpen.push(open)
    return open ? (
      <button type="button" onClick={onConnected}>
        Simulate token saved
      </button>
    ) : null
  }
}))

afterEach(() => {
  cleanup()
  mocks.dialogOpen = []
})

function renderSteps(props: Partial<React.ComponentProps<typeof DartSetupSteps>> = {}) {
  const handlers = {
    onToggleVisible: vi.fn(),
    onConnected: vi.fn(),
    onOpenIntegrations: vi.fn()
  }
  const rendered = render(
    <DartSetupSteps
      connected={false}
      checking={false}
      updateRequired={false}
      visible
      canHide
      {...handlers}
      {...props}
    />
  )
  return { ...handlers, rendered }
}

describe('DartSetupSteps', () => {
  it('connects from Tasks without GitHub wording', () => {
    const { onConnected, onOpenIntegrations } = renderSteps()

    expect(document.body.textContent).not.toMatch(/GitHub|GitLab|CLI/)
    fireEvent.click(screen.getByRole('button', { name: 'Connect Dart' }))
    expect(onOpenIntegrations).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Simulate token saved' }))
    expect(onConnected).toHaveBeenCalledOnce()
  })

  it('routes a connected token to Integrations instead of reopening the dialog', () => {
    const { onOpenIntegrations } = renderSteps({ connected: true })

    fireEvent.click(screen.getByRole('button', { name: 'Manage token' }))

    expect(onOpenIntegrations).toHaveBeenCalledOnce()
    expect(mocks.dialogOpen.at(-1)).toBe(false)
  })

  it('shows the update-server message and sends the user to Integrations for an old host', () => {
    const { onOpenIntegrations } = renderSteps({ updateRequired: true })

    expect(screen.getByText('Update the remote Orca server to use Dart.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Connect Dart' })).toBeNull()
    fireEvent.click(screen.getAllByRole('button', { name: 'Open Integrations' })[0]!)
    expect(onOpenIntegrations).toHaveBeenCalled()
  })

  it('toggles visibility in Tasks from the second step', () => {
    const { onToggleVisible } = renderSteps({ visible: false })

    fireEvent.click(screen.getByRole('button', { name: 'Show Dart in Tasks' }))

    expect(onToggleVisible).toHaveBeenCalledOnce()
  })
})
