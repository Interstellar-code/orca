import { taskProviderErrorMessage, taskProviderErrorText } from '@/lib/task-provider-error-copy'
import { UnsealedCredentialNotice } from './UnsealedCredentialNotice'
import { useState } from 'react'
import { AlertCircle, CheckCircle2, LoaderCircle, TriangleAlert, Unlink } from 'lucide-react'
import { DartConnectDialog } from '@/components/dart/dart-connect-dialog'
import { dartCredentialStorageCopy } from '@/components/dart/dart-credential-storage-copy'
import { DartIcon } from '@/components/icons/DartIcon'
import { Button } from '@/components/ui/button'
import { useMountedRef } from '@/hooks/useMountedRef'
import {
  getProviderRuntimeContextKey,
  hasRemoteProviderRuntime
} from '@/lib/provider-runtime-context'
import { dartUpdateRequiredMessage } from '@/runtime/runtime-dart-client'
import { useAppStore } from '@/store'
import { DartAgentSkillInstallCta } from './dart-agent-skill-install-cta'
import { IntegrationCardDetails, IntegrationCardShell } from './integration-card-shell'
import { useIntegrationSubordinateRowClass } from './integration-card-presentation'
import { getProviderAccountScope } from './provider-account-scope'
import { ProviderHostScopeControl } from './ProviderHostScopeControl'
import { DART_INTEGRATION_SECTION_ID } from './task-provider-integration-section-ids'
import { translate } from '@/i18n/i18n'

type VerificationResult = { state: 'ok' | 'error'; error?: string }

export function DartIntegrationCard(): React.JSX.Element {
  const dartStatus = useAppStore((s) => s.dartStatus)
  const dartStatusChecked = useAppStore((s) => s.dartStatusChecked)
  const dartStatusContextKey = useAppStore((s) => s.dartStatusContextKey)
  const dartUpdateRequired = useAppStore((s) => s.dartUpdateRequired)
  const checkDartConnection = useAppStore((s) => s.checkDartConnection)
  const disconnectDart = useAppStore((s) => s.disconnectDart)
  const testDartConnection = useAppStore((s) => s.testDartConnection)
  const settings = useAppStore((s) => s.settings)
  const mountedRef = useMountedRef()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<VerificationResult | null>(null)
  const [disconnectError, setDisconnectError] = useState<string | null>(null)

  const contextMatches = dartStatusContextKey === getProviderRuntimeContextKey(settings)
  const checking = !contextMatches || !dartStatusChecked
  const updateRequired = contextMatches && dartUpdateRequired
  const connected = contextMatches && !updateRequired && dartStatus.connected
  const credentialError = contextMatches ? dartStatus.credentialError : undefined
  const viewer = connected ? dartStatus.viewer : null
  const accountScope = getProviderAccountScope(settings)
  const remote = hasRemoteProviderRuntime(settings)
  const subordinateRowClass = useIntegrationSubordinateRowClass('flex items-center gap-3')
  const accountScopeRowClass = useIntegrationSubordinateRowClass('text-xs')

  const handleDisconnect = async (): Promise<void> => {
    setDisconnectError(null)
    const result = await disconnectDart()
    if (!mountedRef.current) {
      return
    }
    setTestResult(null)
    if (!result.ok) {
      setDisconnectError(taskProviderErrorMessage(result))
    }
  }

  const handleTest = async (): Promise<void> => {
    setTesting(true)
    setTestResult(null)
    const result = await testDartConnection()
    if (!mountedRef.current) {
      return
    }
    setTestResult(
      result.ok ? { state: 'ok' } : { state: 'error', error: taskProviderErrorMessage(result) }
    )
    setTesting(false)
  }

  return (
    <IntegrationCardShell
      settingsSectionId={DART_INTEGRATION_SECTION_ID}
      icon={<DartIcon className="size-5" />}
      name="Dart"
      description={
        checking
          ? translate(
              'auto.components.settings.dart.integration.card.descriptionChecking',
              'Checking Dart access before showing setup actions.'
            )
          : translate(
              'auto.components.settings.dart.integration.card.description',
              'Browse Dart tasks and start workspaces from them.'
            )
      }
      checking={checking}
      statusTone={connected && !credentialError ? 'connected' : 'attention'}
      statusLabel={
        credentialError
          ? translate(
              'auto.components.settings.dart.integration.card.statusNeedsAttention',
              'Needs attention'
            )
          : connected
            ? translate(
                'auto.components.settings.dart.integration.card.statusConnected',
                'Connected'
              )
            : updateRequired
              ? translate(
                  'auto.components.settings.dart.integration.card.statusUpdateRequired',
                  'Update required'
                )
              : translate(
                  'auto.components.settings.dart.integration.card.statusNotConnected',
                  'Not connected'
                )
      }
      actions={
        !checking && !updateRequired ? (
          <Button
            variant={connected && !credentialError ? 'outline' : 'default'}
            size="sm"
            onClick={() => setDialogOpen(true)}
          >
            {credentialError
              ? translate('auto.components.settings.dart.integration.card.reconnect', 'Reconnect')
              : connected
                ? translate(
                    'auto.components.settings.dart.integration.card.replaceToken',
                    'Replace token'
                  )
                : translate(
                    'auto.components.settings.dart.integration.card.connect',
                    'Connect Dart'
                  )}
          </Button>
        ) : null
      }
    >
      <IntegrationCardDetails>
        <UnsealedCredentialNotice
          protection={contextMatches ? (dartStatus.credentialProtection ?? null) : null}
          credentialName={translate(
            'auto.components.settings.dart.integration.card.dartTokenName',
            'Your Dart token'
          )}
        />
        <ProviderHostScopeControl
          labelPrefix={translate(
            'auto.components.settings.task.tracker.integration.cards.account_scope_prefix',
            'Account scope'
          )}
          scope={accountScope}
          className={accountScopeRowClass}
        />
        {updateRequired ? (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-lg border border-status-warning-border bg-status-warning-background px-3 py-2 text-status-warning"
          >
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            <p className="min-w-0 text-xs leading-snug">
              {translate(
                'auto.components.settings.dart.integration.card.updateRequiredBody',
                '{{message}} Dart stays off for this host; nothing falls back to this computer.',
                { message: dartUpdateRequiredMessage() }
              )}
            </p>
          </div>
        ) : null}
        {credentialError ? (
          <p role="alert" className="flex items-start gap-1.5 text-xs text-destructive">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
            <span className="min-w-0">{taskProviderErrorText(credentialError)}</span>
          </p>
        ) : null}
        {disconnectError ? (
          <p role="alert" className="text-xs text-destructive">
            {disconnectError}
          </p>
        ) : null}
        {connected && viewer ? (
          <div className={subordinateRowClass}>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {viewer.email ? `${viewer.name} (${viewer.email})` : viewer.name}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {translate(
                  'auto.components.settings.dart.integration.card.connectedAs',
                  'Connected with an authorization token'
                )}
              </p>
            </div>
            {testResult?.state === 'ok' ? (
              <span className="flex shrink-0 items-center gap-1 text-xs text-status-success">
                <CheckCircle2 className="size-3.5" />
                {translate(
                  'auto.components.settings.task.tracker.integration.cards.a2c0015fb8',
                  'Verified'
                )}
              </span>
            ) : null}
            {testResult?.state === 'error' ? (
              <span className="flex min-w-0 max-w-[220px] shrink items-center gap-1 truncate text-xs text-destructive">
                <AlertCircle className="size-3.5 shrink-0" />
                <span className="truncate">{testResult.error}</span>
              </span>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleTest()}
              disabled={testing}
            >
              {testing ? (
                <>
                  <LoaderCircle className="size-3.5 mr-1.5 animate-spin" />
                  {translate(
                    'auto.components.settings.task.tracker.integration.cards.3e7c10d286',
                    'Testing...'
                  )}
                </>
              ) : (
                translate(
                  'auto.components.settings.task.tracker.integration.cards.c24e56c532',
                  'Test'
                )
              )}
            </Button>
            <button
              type="button"
              onClick={() => void handleDisconnect()}
              aria-label={translate(
                'auto.components.settings.dart.integration.card.disconnect',
                'Disconnect Dart'
              )}
              className="rounded-md p-1 text-muted-foreground/50 transition-colors hover:text-destructive"
            >
              <Unlink className="size-3.5" />
            </button>
          </div>
        ) : connected ? (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => void checkDartConnection()}>
              {translate(
                'auto.components.settings.task.tracker.integration.cards.c90f2ef419',
                'Re-check'
              )}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void handleDisconnect()}>
              {translate(
                'auto.components.settings.task.tracker.integration.cards.disconnect_all',
                'Disconnect'
              )}
            </Button>
          </div>
        ) : !checking && !updateRequired ? (
          <>
            <p className="text-xs text-muted-foreground">
              {translate(
                'auto.components.settings.dart.integration.card.connectHelp',
                'Connect with your Dart authorization token. API access needs a Dart Premium plan or above.'
              )}
            </p>
            <Button variant="ghost" size="sm" onClick={() => void checkDartConnection()}>
              {translate(
                'auto.components.settings.task.tracker.integration.cards.c90f2ef419',
                'Re-check'
              )}
            </Button>
          </>
        ) : null}
        {!checking && !updateRequired ? (
          <p className="text-2xs text-muted-foreground/70">{dartCredentialStorageCopy(remote)}</p>
        ) : null}
        {!updateRequired ? <DartAgentSkillInstallCta settings={settings} /> : null}
      </IntegrationCardDetails>

      <DartConnectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onConnected={() => setTestResult(null)}
        elevated
      />
    </IntegrationCardShell>
  )
}
