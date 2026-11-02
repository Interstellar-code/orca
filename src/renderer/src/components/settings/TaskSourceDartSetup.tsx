import { useState } from 'react'
import { DartConnectDialog } from '@/components/dart/dart-connect-dialog'
import { Button } from '@/components/ui/button'
import { dartUpdateRequiredMessage } from '@/runtime/runtime-dart-client'
import { ORCA_DART_SKILL_NAME } from '@/lib/agent-feature-skill-names'
import { TaskSourceShowInTasksStep } from './TaskSourceShowInTasksStep'
import { TaskSourceStepRow } from './TaskSourceStepRow'
import { translate } from '@/i18n/i18n'

type DartSetupStepsProps = {
  connected: boolean
  checking: boolean
  updateRequired: boolean
  visible: boolean
  canHide: boolean
  onToggleVisible: () => void
  onConnected: () => void
  onOpenIntegrations: () => void
}

export function DartSetupSteps({
  connected,
  checking,
  updateRequired,
  visible,
  canHide,
  onToggleVisible,
  onConnected,
  onOpenIntegrations
}: DartSetupStepsProps): React.JSX.Element {
  const [dialogOpen, setDialogOpen] = useState(false)
  const openIntegrationsInstead = connected || updateRequired

  return (
    <>
      <ol className="divide-y divide-border/50">
        <TaskSourceStepRow
          index={1}
          state={checking ? 'in-progress' : connected ? 'done' : 'pending'}
          title={translate(
            'auto.components.settings.TaskSourceDartSetup.connectTitle',
            'Connect Dart'
          )}
          description={
            updateRequired
              ? dartUpdateRequiredMessage()
              : translate(
                  'auto.components.settings.TaskSourceDartSetup.connectDescription',
                  'Paste your Dart authorization token so Orca can browse tasks.'
                )
          }
          action={
            <Button
              type="button"
              size="sm"
              variant={openIntegrationsInstead ? 'outline' : 'default'}
              onClick={openIntegrationsInstead ? onOpenIntegrations : () => setDialogOpen(true)}
            >
              {updateRequired
                ? translate(
                    'auto.components.settings.TaskSourceDartSetup.openIntegrations',
                    'Open Integrations'
                  )
                : connected
                  ? translate('auto.components.settings.TaskSourceDartSetup.manage', 'Manage token')
                  : translate(
                      'auto.components.settings.TaskSourceDartSetup.connect',
                      'Connect Dart'
                    )}
            </Button>
          }
        />
        <TaskSourceShowInTasksStep
          index={2}
          providerLabel={translate('auto.components.settings.TasksPane.dartLabel', 'Dart')}
          visible={visible}
          canHide={canHide}
          onToggleVisible={onToggleVisible}
        />
      </ol>
      <p className="px-1 pt-2 text-xs text-muted-foreground">
        {translate(
          'auto.components.settings.TaskSourceDartSetup.skillHint',
          'Optional: install the {{skill}} skill under Integrations so agents can read and update Dart tasks.',
          { skill: ORCA_DART_SKILL_NAME }
        )}{' '}
        <Button type="button" variant="link" size="xs" onClick={onOpenIntegrations}>
          {translate(
            'auto.components.settings.TaskSourceDartSetup.openIntegrations',
            'Open Integrations'
          )}
        </Button>
      </p>
      <DartConnectDialog open={dialogOpen} onOpenChange={setDialogOpen} onConnected={onConnected} />
    </>
  )
}
