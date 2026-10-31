import { bundledSkillSetupActionLabel } from './bundled-skill-setup-copy'
import { useActiveProjectSkillRuntime } from '@/hooks/useActiveProjectSkillRuntime'
import { useCallback, useMemo } from 'react'
import { Download, Loader2, RefreshCw } from 'lucide-react'
import { IntegrationStatusPill } from '@/components/integration-status-pill'
import { SkillUnsupportedStatusPill } from '../skills/SkillFreshnessStatusPill'
import { Button } from '@/components/ui/button'
import type { DiscoveredSkill } from '../../../../shared/skills'
import {
  GLOBAL_AGENT_SKILL_SOURCE_KINDS,
  useInstalledAgentSkillNames
} from '@/hooks/useInstalledAgentSkills'
import { useBundledSkillInstallAction } from '@/hooks/use-bundled-skill-install-action'
import {
  bundledSkillInstallNeedsAttention,
  useBundledSkillInstall
} from '@/hooks/use-bundled-skill-install'
import { cn } from '@/lib/utils'
import type { LocalAgentRuntime } from './CliSkillRuntimeSetup'
import { useIntegrationSubordinateRowClass } from './integration-card-presentation'
import { BundledSkillInstallStatus } from './BundledSkillInstallStatus'
import { recheckSurfacesAfterAgentSkillInstall } from './agent-skill-recheck-surface-sync'
import { translate } from '@/i18n/i18n'

export type BundledAgentSkillInstallRowProps = {
  settings: { activeRuntimeEnvironmentId?: string | null } | null | undefined
  /** Every name that counts as this feature's skill being installed (canonical first). */
  skillNames: readonly string[]
  /** Defaults to `skillNames[0]`; legacy aliases need an override. */
  resolveInstallName?: (skills: readonly DiscoveredSkill[], installed: boolean) => string
  displayName: string
  description: string
  runtimeCopy: (remote: boolean, agentRuntime: LocalAgentRuntime) => string
}

// Provider setup row for a separately installed skill, installed through the bundled-skill planner on the owning host.
export function BundledAgentSkillInstallRow({
  settings,
  skillNames,
  resolveInstallName,
  displayName,
  description,
  runtimeCopy
}: BundledAgentSkillInstallRowProps): React.JSX.Element {
  // Match sidebar runtime resolution so both surfaces scan/install on the same host or WSL distro.
  const remote = Boolean(settings?.activeRuntimeEnvironmentId?.trim())
  const activeRuntime = useActiveProjectSkillRuntime()
  const agentRuntime = activeRuntime.agentRuntime ?? {
    runtime: 'host',
    label: ''
  }
  const skill = useInstalledAgentSkillNames(skillNames, {
    discoveryTarget: activeRuntime.discoveryTarget,
    sourceKinds: GLOBAL_AGENT_SKILL_SOURCE_KINDS
  })
  const skillName = useMemo(
    () => resolveInstallName?.(skill.skills, skill.installed) ?? skillNames[0] ?? '',
    [resolveInstallName, skillNames, skill.installed, skill.skills]
  )
  const { refresh } = skill
  const recheckAfterInstall = useCallback(
    () => recheckSurfacesAfterAgentSkillInstall(refresh),
    [refresh]
  )
  const skillInstall = useBundledSkillInstall({
    onFinished: recheckAfterInstall,
    target: activeRuntime.bundledSkillTarget
  })
  const { state, ready, install } = skillInstall
  const installing = state.kind === 'installing'
  const action = useBundledSkillInstallAction([skillName], {
    enabled: true,
    refreshKey: state.kind,
    target: activeRuntime.bundledSkillTarget
  })
  const replacePaths = action.kind === 'replace' ? action.paths : undefined
  const unsupported = action.kind === 'unsupported' ? action.reason : undefined
  const needsAttention = action.kind === 'attention'
  const showInstall =
    action.kind !== 'none' &&
    !unsupported &&
    !needsAttention &&
    (!skill.installed || action.kind === 'run' || action.kind === 'unknown' || replacePaths)
  const subordinateRowClass = useIntegrationSubordinateRowClass('space-y-1.5')

  return (
    <div className={subordinateRowClass}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-medium text-foreground">
          {translate(
            'auto.components.settings.linear.agent.skill.install.cta.skillLabel',
            'Agent skill:'
          )}{' '}
          <span className="font-mono text-2xs">{displayName}</span>
        </p>
        {unsupported ? (
          <SkillUnsupportedStatusPill reason={unsupported} />
        ) : needsAttention ? (
          <IntegrationStatusPill tone="attention">
            {translate('auto.components.skills.skillPlanOpCopy.needsAttention', 'Needs attention')}
          </IntegrationStatusPill>
        ) : skill.loading ? (
          <IntegrationStatusPill tone="neutral">
            {translate(
              'auto.components.settings.linear.agent.skill.install.cta.checking',
              'Checking...'
            )}
          </IntegrationStatusPill>
        ) : skill.installed || action.kind === 'none' ? (
          <IntegrationStatusPill tone="connected">
            {translate(
              'auto.components.settings.linear.agent.skill.install.cta.installed',
              'Installed'
            )}
          </IntegrationStatusPill>
        ) : (
          <IntegrationStatusPill tone="attention">
            {translate(
              'auto.components.settings.linear.agent.skill.install.cta.notInstalled',
              'Not installed'
            )}
          </IntegrationStatusPill>
        )}
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="ml-auto"
          onClick={() => void skill.refresh()}
          disabled={skill.loading}
        >
          <RefreshCw className={cn('size-3', skill.loading && 'animate-spin')} />
          {translate('auto.components.settings.linear.agent.skill.install.cta.recheck', 'Re-check')}
        </Button>
      </div>
      {skill.error ? <p className="text-xs text-destructive">{skill.error}</p> : null}
      {(!skill.loading || unsupported) && (
        <>
          {skill.installed ? null : <p className="text-xs text-muted-foreground">{description}</p>}
          {!showInstall ||
          state.kind === 'unsupported' ||
          bundledSkillInstallNeedsAttention(state) ? null : (
            <Button
              type="button"
              variant="outline"
              size="xs"
              className="w-fit"
              onClick={() => void install([skillName], replacePaths)}
              disabled={installing || !ready || action.kind === 'loading'}
            >
              {installing ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Download className="size-3" />
              )}
              {installing
                ? translate(
                    'auto.components.settings.AgentSkillSetupPanel.installing',
                    'Installing...'
                  )
                : replacePaths
                  ? translate(
                      'auto.components.settings.AgentSkillSetupPanel.replaceWithOrcaCopy',
                      "Replace with Orca's copy"
                    )
                  : action.kind === 'run' && action.changes
                    ? bundledSkillSetupActionLabel(action.changes)
                    : skill.installed
                      ? translate(
                          'auto.components.settings.AgentSkillSetupPanel.updateLabel',
                          'Update'
                        )
                      : translate(
                          'auto.components.skills.SkillInstallDialog.39acb9e8f4',
                          'Install skill'
                        )}
            </Button>
          )}
          <BundledSkillInstallStatus
            install={skillInstall}
            unsupported={unsupported}
            attention={
              needsAttention
                ? {
                    retry: () => void install([skillName]),
                    message: action.attentionMessage
                  }
                : undefined
            }
            buttonSize="xs"
          />
          {remote || agentRuntime.runtime === 'wsl' ? (
            <p className="text-2xs text-muted-foreground/70">{runtimeCopy(remote, agentRuntime)}</p>
          ) : null}
        </>
      )}
    </div>
  )
}
