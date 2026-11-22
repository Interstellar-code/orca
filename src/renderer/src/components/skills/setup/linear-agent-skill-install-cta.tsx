import { WslLinearAgentSkillInstallCta } from './WslLinearAgentSkillInstallCta'
import type { DiscoveredSkill } from '../../../../../shared/skills/discovery/skills'
import { useActiveProjectSkillRuntime } from '@/hooks/skills/runtime/useActiveProjectSkillRuntime'
import {
  LINEAR_AGENT_SKILL_NAMES,
  ORCA_LINEAR_SKILL_NAME
} from '@/lib/skills/installation/agent-feature-skill-names'
import { getLinearAgentSkillUpdateTarget } from '@/lib/skills/installation/linear-agent-skill-update-target'
import { getLinearAgentSkillSetupInlineRuntimeCopy } from './linear-agent-skill-setup-copy'
import type { LinearAgentSkillPromptSettings } from './linear-agent-skill-runtime'
import { BundledAgentSkillInstallRow } from './bundled-agent-skill-install-row'
import { useTranslate } from '@/i18n/use-translate'

type LinearAgentSkillInstallCtaProps = {
  settings: LinearAgentSkillPromptSettings | null | undefined
}

function resolveLinearInstallName(skills: readonly DiscoveredSkill[], installed: boolean): string {
  return getLinearAgentSkillUpdateTarget(skills, installed).skillName
}

// Bridge provider setup to its separately installed skill so connected agents can read/edit Linear tasks.
function BundledLinearAgentSkillInstallCta({
  settings
}: LinearAgentSkillInstallCtaProps): React.JSX.Element {
  const t = useTranslate()
  return (
    <BundledAgentSkillInstallRow
      settings={settings}
      skillNames={LINEAR_AGENT_SKILL_NAMES}
      resolveInstallName={resolveLinearInstallName}
      displayName={ORCA_LINEAR_SKILL_NAME}
      description={t(
        'auto.components.settings.linear.agent.skill.install.cta.description',
        'Let agents read and edit Linear tasks. Full guided setup (connect + skill + visibility) is under Settings → Task Sources.'
      )}
      runtimeCopy={getLinearAgentSkillSetupInlineRuntimeCopy}
    />
  )
}

export function LinearAgentSkillInstallCta(
  props: LinearAgentSkillInstallCtaProps
): React.JSX.Element {
  const activeRuntime = useActiveProjectSkillRuntime()
  // COMPAT(wsl-bridge): removed when WSL runs as an orcad host.
  if (activeRuntime.agentRuntime?.runtime === 'wsl') {
    return <WslLinearAgentSkillInstallCta {...props} runtime={activeRuntime.agentRuntime} />
  }
  return <BundledLinearAgentSkillInstallCta {...props} />
}
