// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DartConnectionStatus } from '../../../../shared/dart/dart-types'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import { TooltipProvider } from '../ui/tooltip'
import { DartIntegrationCard } from './dart-integration-card'

const FAKE_TOKEN = 'dsa_FAKE0000000000000000'

type ClientResult = { ok: true } | { ok: false; error: string; errorCode?: string }

type StoreState = {
  dartStatus: DartConnectionStatus
  dartStatusChecked: boolean
  dartStatusContextKey: string | null
  dartUpdateRequired: boolean
  checkDartConnection: () => Promise<void>
  connectDart: (args: { apiToken: string }) => Promise<ClientResult>
  testDartConnection: () => Promise<ClientResult>
  disconnectDart: () => Promise<ClientResult>
  settings: { activeRuntimeEnvironmentId: string | null }
  openSettingsPage: () => void
  openSettingsTarget: (target: unknown) => void
}

const mocks = vi.hoisted(() => ({
  store: { current: null as StoreState | null }
}))

vi.mock('@/store', () => ({
  useAppStore: Object.assign(
    (selector: (state: StoreState) => unknown) => {
      if (!mocks.store.current) {
        throw new Error('Store state was not installed')
      }
      return selector(mocks.store.current)
    },
    { getState: () => mocks.store.current }
  )
}))

vi.mock('./dart-agent-skill-install-cta', () => ({
  DartAgentSkillInstallCta: () => <div data-testid="dart-skill-row" />
}))

const CONNECTED: DartConnectionStatus = {
  connected: true,
  viewer: { id: 'aB3dE5gH7jK9', name: 'Alex Example', email: 'alex@example.test' }
}

function installStore(
  overrides: Partial<StoreState> = {},
  settings: StoreState['settings'] = { activeRuntimeEnvironmentId: null }
): StoreState {
  const state: StoreState = {
    dartStatus: { connected: false, viewer: null },
    dartStatusChecked: true,
    dartStatusContextKey: getProviderRuntimeContextKey(settings),
    dartUpdateRequired: false,
    checkDartConnection: vi.fn(async () => {}),
    connectDart: vi.fn(async () => ({ ok: true as const })),
    testDartConnection: vi.fn(async () => ({ ok: true as const })),
    disconnectDart: vi.fn(async () => ({ ok: true as const })),
    settings,
    openSettingsPage: vi.fn(),
    openSettingsTarget: vi.fn(),
    ...overrides
  }
  mocks.store.current = state
  return state
}

function renderCard(): ReturnType<typeof render> {
  return render(
    <TooltipProvider>
      <DartIntegrationCard />
    </TooltipProvider>
  )
}

beforeEach(() => {
  mocks.store.current = null
})

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

describe('DartIntegrationCard', () => {
  it('offers Connect when no token is saved and keeps the card in its Dart section', () => {
    installStore()
    const { container } = renderCard()

    expect(container.querySelector('[data-settings-section="integrations-dart"]')).not.toBeNull()
    expect(screen.getByText('Not connected')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Connect Dart' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Test' })).toBeNull()
  })

  it('shows the connected viewer as name and email with Test and Disconnect', async () => {
    const state = installStore({ dartStatus: CONNECTED })
    renderCard()

    expect(screen.getByText('Connected')).toBeTruthy()
    expect(screen.getByText('Alex Example (alex@example.test)')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Test' }))
    expect(await screen.findByText('Verified')).toBeTruthy()
    expect(state.testDartConnection).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect Dart' }))
    expect(state.disconnectDart).toHaveBeenCalledOnce()
  })

  it('labels the icon-only Disconnect action on keyboard focus', async () => {
    installStore({ dartStatus: CONNECTED })
    renderCard()

    fireEvent.focus(screen.getByRole('button', { name: 'Disconnect Dart' }))

    expect((await screen.findByRole('tooltip')).textContent).toBe('Disconnect Dart')
  })

  it('shows only the name when Dart returned no email', () => {
    installStore({ dartStatus: { connected: true, viewer: { id: 'aB3dE5gH7jK9', name: 'Alex' } } })
    renderCard()

    expect(screen.getByText('Alex')).toBeTruthy()
    expect(screen.queryByText(/\(/)).toBeNull()
  })

  it('renders a rejected test through the task-provider error copy', async () => {
    installStore({
      dartStatus: CONNECTED,
      testDartConnection: vi.fn(async () => ({
        ok: false as const,
        error: 'raw upstream text',
        errorCode: 'dart.unauthorized'
      }))
    })
    renderCard()

    fireEvent.click(screen.getByRole('button', { name: 'Test' }))

    expect(await screen.findByText('Dart rejected the API token.')).toBeTruthy()
    expect(screen.queryByText('raw upstream text')).toBeNull()
  })

  it('reports a failed disconnect instead of silently keeping the connection', async () => {
    installStore({
      dartStatus: CONNECTED,
      disconnectDart: vi.fn(async () => ({
        ok: false as const,
        error: 'x',
        errorCode: 'dart.badRequest'
      }))
    })
    renderCard()

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect Dart' }))

    expect(await screen.findByText('Dart rejected the request.')).toBeTruthy()
  })

  it('shows the update-server message for an old remote host and no connect action', () => {
    installStore({ dartUpdateRequired: true }, { activeRuntimeEnvironmentId: 'runtime-1' })
    renderCard()

    expect(screen.getByText('Update required')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain(
      'Update the remote Orca server to use Dart.'
    )
    expect(screen.queryByRole('button', { name: 'Connect Dart' })).toBeNull()
    expect(screen.queryByTestId('dart-skill-row')).toBeNull()
  })

  it('does not trust a status read for another runtime context', () => {
    installStore({ dartStatus: CONNECTED, dartStatusContextKey: 'some-other-runtime' })
    renderCard()

    expect(screen.queryByText('Alex Example (alex@example.test)')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Connect Dart' })).toBeNull()
  })

  it('surfaces an unreadable saved token and offers Reconnect', () => {
    installStore({
      dartStatus: {
        connected: true,
        viewer: null,
        credentialError: 'Could not read the saved token'
      }
    })
    renderCard()

    expect(screen.getByText('Could not read the saved token')).toBeTruthy()
    expect(screen.getByText('Needs attention')).toBeTruthy()
    expect(screen.queryByText('Connected')).toBeNull()
    expect(screen.getByRole('button', { name: 'Reconnect' })).toBeTruthy()
  })

  it('warns when the saved token is stored unencrypted', () => {
    installStore({ dartStatus: { ...CONNECTED, credentialProtection: 'plaintext' } })
    renderCard()

    expect(screen.getByRole('alert').textContent).toContain('Your Dart token')
  })

  it('says the token is stored locally on this computer', async () => {
    installStore()
    renderCard()

    expect(screen.getByText(/stored locally/)).toBeTruthy()
    expect(screen.queryByText(/remote runtime/)).toBeNull()
  })

  it('says the token is stored on the remote runtime for a remote scope and shows the host', () => {
    installStore({}, { activeRuntimeEnvironmentId: 'runtime-1' })
    renderCard()

    expect(screen.getByText(/sent to the selected remote runtime/)).toBeTruthy()
    expect(screen.getByText(/Remote server: runtime-1/)).toBeTruthy()
  })

  it('opens the Hosts settings from the account scope row', () => {
    const state = installStore({}, { activeRuntimeEnvironmentId: 'runtime-1' })
    renderCard()

    fireEvent.click(screen.getByRole('button', { name: 'Open Remote Servers' }))

    expect(state.openSettingsTarget).toHaveBeenCalledWith({
      pane: 'servers',
      repoId: null,
      sectionId: 'default-runtime'
    })
  })

  it('connects with the pasted token, closes, and leaves the token nowhere in the page', async () => {
    const state = installStore()
    renderCard()

    fireEvent.click(screen.getByRole('button', { name: 'Connect Dart' }))
    const field = await screen.findByLabelText('Authorization token')
    const dialog = within(screen.getByRole('dialog'))
    expect(dialog.getByText(/It starts with dsa_/)).toBeTruthy()
    expect(dialog.getByText(/Dart Premium plan or above/)).toBeTruthy()

    fireEvent.change(field, { target: { value: `  ${FAKE_TOKEN}  ` } })
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }))

    await waitFor(() => expect(state.connectDart).toHaveBeenCalledWith({ apiToken: FAKE_TOKEN }))
    await waitFor(() => expect(screen.queryByLabelText('Authorization token')).toBeNull())
    expect(document.body.innerHTML).not.toContain(FAKE_TOKEN)
  })

  it('keeps the dialog open on a rejected token, shows the mapped copy and clears on Cancel', async () => {
    const state = installStore({
      connectDart: vi.fn(async () => ({
        ok: false as const,
        error: 'raw upstream text',
        errorCode: 'dart.unauthorized'
      }))
    })
    renderCard()

    fireEvent.click(screen.getByRole('button', { name: 'Connect Dart' }))
    fireEvent.change(await screen.findByLabelText('Authorization token'), {
      target: { value: FAKE_TOKEN }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }))

    expect(await screen.findByText('Dart rejected the API token.')).toBeTruthy()
    expect(state.connectDart).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByLabelText('Authorization token')).toBeNull())
    expect(document.body.innerHTML).not.toContain(FAKE_TOKEN)

    fireEvent.click(screen.getByRole('button', { name: 'Connect Dart' }))
    expect(((await screen.findByLabelText('Authorization token')) as HTMLInputElement).value).toBe(
      ''
    )
  })

  it('does not submit an empty token', async () => {
    const state = installStore()
    renderCard()

    fireEvent.click(screen.getByRole('button', { name: 'Connect Dart' }))
    await screen.findByLabelText('Authorization token')

    expect((screen.getByRole('button', { name: 'Connect' }) as HTMLButtonElement).disabled).toBe(
      true
    )
    expect(state.connectDart).not.toHaveBeenCalled()
  })
})
