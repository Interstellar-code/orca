// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BundledSkillInstallActionState } from '@/hooks/use-bundled-skill-install-action'
import { TooltipProvider } from '../ui/tooltip'
import { DartAgentSkillInstallCta } from './dart-agent-skill-install-cta'

const mocks = vi.hoisted(() => ({
  skill: {
    installed: false,
    loading: false,
    error: null as string | null,
    skills: [] as unknown[],
    refresh: vi.fn(async () => true)
  },
  action: { kind: 'run' } as unknown,
  useInstalledAgentSkillNames: vi.fn(),
  plan: vi.fn()
}))

vi.mock('@/hooks/use-bundled-skill-install-action', () => ({
  useBundledSkillInstallAction: () => mocks.action
}))

vi.mock('@/hooks/useInstalledAgentSkills', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useInstalledAgentSkillNames: mocks.useInstalledAgentSkillNames
}))

vi.mock('@/runtime/runtime-bundled-skills-client', () => ({
  planBundledSkillsOnTarget: mocks.plan,
  executeBundledSkillsOnTarget: vi.fn()
}))

vi.mock('@/hooks/useActiveProjectSkillRuntime', () => ({
  useActiveProjectSkillRuntime: () => ({
    bundledSkillTarget: { kind: 'local' },
    agentRuntime: { runtime: 'host', label: '' }
  })
}))

function setAction(action: BundledSkillInstallActionState): void {
  mocks.action = action
}

function renderRow(activeRuntimeEnvironmentId: string | null = null): void {
  render(
    <TooltipProvider>
      <DartAgentSkillInstallCta settings={{ activeRuntimeEnvironmentId }} />
    </TooltipProvider>
  )
}

beforeEach(() => {
  Object.assign(mocks.skill, { installed: false, loading: false, error: null, skills: [] })
  mocks.skill.refresh.mockClear()
  mocks.useInstalledAgentSkillNames.mockReset()
  mocks.useInstalledAgentSkillNames.mockReturnValue(mocks.skill)
  mocks.plan.mockReset()
  setAction({ kind: 'run' })
})

afterEach(() => {
  cleanup()
})

describe('DartAgentSkillInstallCta', () => {
  it('scans for exactly the orca-dart skill and names it in the row', () => {
    renderRow()

    expect(screen.getByText('orca-dart')).toBeTruthy()
    expect(mocks.useInstalledAgentSkillNames).toHaveBeenCalledWith(['orca-dart'], expect.anything())
  })

  it('shows Checking while the installed-skill scan runs', () => {
    mocks.skill.loading = true
    renderRow()

    expect(screen.getByText('Checking...')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Install skill' })).toBeNull()
  })

  it('offers Install skill when the skill is not installed, and installs orca-dart only', async () => {
    mocks.plan.mockResolvedValue({ kind: 'unsupported', reason: 'update-server' })
    renderRow()

    expect(screen.getByText('Not installed')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Install skill' }))

    await waitFor(() =>
      expect(mocks.plan).toHaveBeenCalledWith({ kind: 'local' }, { names: ['orca-dart'] })
    )
  })

  it('shows Installed without an install button when nothing is left to do', () => {
    mocks.skill.installed = true
    setAction({ kind: 'none' })
    renderRow()

    expect(screen.getByText('Installed')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Install skill' })).toBeNull()
  })

  it('shows Needs attention with the reason and a Retry instead of Install', () => {
    setAction({ kind: 'attention', attentionMessage: 'A copy of orca-dart was edited by hand.' })
    renderRow()

    expect(screen.getByText('Needs attention')).toBeTruthy()
    expect(screen.getByText('A copy of orca-dart was edited by hand.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Install skill' })).toBeNull()
  })

  it('tells the user to update an older server instead of offering Install', () => {
    setAction({ kind: 'unsupported', reason: 'update-server' })
    renderRow('runtime-1')

    expect(screen.getAllByText(/Update Orca on the server/).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Install skill' })).toBeNull()
  })

  it('tells the user to connect an SSH host that is not connected yet', () => {
    setAction({ kind: 'unsupported', reason: 'connect-host' })
    renderRow('runtime-1')

    expect(screen.getByText('Connect the SSH host')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Install skill' })).toBeNull()
  })

  it('names the missing bundle when the host does not ship orca-dart', async () => {
    mocks.plan.mockRejectedValue(new Error('bundled-skill-unknown: orca-dart'))
    renderRow('runtime-1')

    fireEvent.click(screen.getByRole('button', { name: 'Install skill' }))

    expect(
      await screen.findByText(
        'Orca could not install the skills. (bundled-skill-unknown: orca-dart)'
      )
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
  })

  it('notes that remote agent environments need their own setup', () => {
    renderRow('runtime-1')

    expect(screen.getByText(/remote agent environments may need separate setup/)).toBeTruthy()
  })
})
