import { ORCA_DART_SKILL_NAME } from '@/lib/agent-feature-skill-names'
import type { LocalAgentRuntime } from './CliSkillRuntimeSetup'
import { BundledAgentSkillInstallRow } from './bundled-agent-skill-install-row'
import { translate } from '@/i18n/i18n'

const DART_AGENT_SKILL_NAMES = [ORCA_DART_SKILL_NAME] as const

type DartAgentSkillInstallCtaProps = {
  settings: { activeRuntimeEnvironmentId?: string | null } | null | undefined
}

function dartSkillRuntimeCopy(remote: boolean, agentRuntime: LocalAgentRuntime): string {
  if (remote) {
    return translate(
      'auto.components.settings.dart.agent.skill.install.cta.remoteCopy',
      'This installs host setup; remote agent environments may need separate setup.'
    )
  }
  if (agentRuntime.runtime === 'wsl') {
    return translate(
      'auto.components.settings.dart.agent.skill.install.cta.wslCopy',
      'Orca installs this skill on the host. WSL agents need it set up separately.'
    )
  }
  return translate(
    'auto.components.settings.dart.agent.skill.install.cta.hostCopy',
    'Install it for host agent handoffs from linked Dart work.'
  )
}

export function DartAgentSkillInstallCta({
  settings
}: DartAgentSkillInstallCtaProps): React.JSX.Element {
  return (
    <BundledAgentSkillInstallRow
      settings={settings}
      skillNames={DART_AGENT_SKILL_NAMES}
      displayName={ORCA_DART_SKILL_NAME}
      description={translate(
        'auto.components.settings.dart.agent.skill.install.cta.description',
        'Let agents read and update Dart tasks.'
      )}
      runtimeCopy={dartSkillRuntimeCopy}
    />
  )
}
