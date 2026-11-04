import { taskProviderErrorMessage, taskProviderErrorText } from '@/lib/task-provider-error-copy'
import { UnsealedCredentialNotice } from './UnsealedCredentialNotice'
import { useState } from 'react'
import { AlertCircle, TriangleAlert } from 'lucide-react'
import { DartConnectDialog } from '@/components/dart/dart-connect-dialog'
import { dartCredentialStorageCopy } from '@/components/dart/dart-credential-storage-copy'
import { DartIcon } from '@/components/icons/DartIcon'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { useMountedRef } from '@/hooks/useMountedRef'
import {
  getProviderRuntimeContextKey,
  isEnvironmentRuntimeContextKey
} from '@/lib/provider-runtime-context'
import { dartUpdateRequiredMessage } from '@/runtime/runtime-dart-client'
import { useAppStore } from '@/store'
import { getDartReadScope } from '@/store/slices/dart/dart-read-coordination'
import { dartScopeHostKey } from '@/store/slices/dart/dart-task-identity'
import {
  dirtyDraftCount,
  dirtyDraftTexts,
  discardDirtyDrafts
} from '../task-page/dart/dart-draft-store'
import { clearDartCommentSendStatesForHost } from '../task-page/dart/dart-comment-send-state'
import { clearDartReplyTargetsForHost } from '../task-page/dart/dart-reply-target-store'
import { DartAgentSkillInstallCta } from './dart-agent-skill-install-cta'
import { IntegrationCardDetails, IntegrationCardShell } from './integration-card-shell'
import { useIntegrationSubordinateRowClass } from './integration-card-presentation'
import { getProviderAccountScope } from './provider-account-scope'
import { ProviderHostScopeControl } from './ProviderHostScopeControl'
import { DART_INTEGRATION_SECTION_ID } from './task-provider-integration-section-ids'
import { DartConnectedAccountRow } from './dart-connected-account-row'
import { translate } from '@/i18n/i18n'

type VerificationResult = { state: 'ok' | 'error'; error?: string }

function DartDisconnectDraftsDialog({
  count,
  hostKey,
  onCancel,
  onDiscardAndDisconnect
}: {
  count: number
  hostKey: string
  onCancel: () => void
  onDiscardAndDisconnect: () => void
}): React.JSX.Element {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const copyAll = (): void => {
    void window.api.ui.writeClipboardText(dirtyDraftTexts(hostKey).join('\n\n---\n\n')).then(
      () => setCopyState('copied'),
      () => setCopyState('failed')
    )
  }
  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent showCloseButton={false} overlayClassName="z-[110]" className="z-[120]">
        <DialogHeader>
          <DialogTitle>
            {count === 1
              ? translate(
                  'auto.components.settings.dart.integration.card.unsavedDraftsTitleOne',
                  'You have 1 unsaved Dart draft'
                )
              : translate(
                  'auto.components.settings.dart.integration.card.unsavedDraftsTitle',
                  'You have {{count}} unsaved Dart drafts',
                  { count }
                )}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.settings.dart.integration.card.unsavedDraftsBody',
              'Drafts are kept only in memory. Disconnecting discards the ones made on this host.'
            )}
          </DialogDescription>
        </DialogHeader>
        {copyState === 'failed' ? (
          <p role="alert" className="text-xs text-destructive">
            {translate(
              'auto.components.settings.dart.integration.card.copyDraftsFailed',
              'Could not copy the drafts. They are still saved here.'
            )}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            {translate('auto.components.settings.dart.integration.card.cancelDisconnect', 'Cancel')}
          </Button>
          <Button variant="outline" onClick={copyAll}>
            {copyState === 'copied'
              ? translate('auto.components.settings.dart.integration.card.draftsCopied', 'Copied')
              : translate(
                  'auto.components.settings.dart.integration.card.copyAllDrafts',
                  'Copy all'
                )}
          </Button>
          <Button variant="destructive" onClick={onDiscardAndDisconnect}>
            {translate(
              'auto.components.settings.dart.integration.card.discardAndDisconnect',
              'Discard and disconnect'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

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
  const [draftPrompt, setDraftPrompt] = useState<{ hostKey: string; count: number } | null>(null)

  const providerRuntimeContextKey = getProviderRuntimeContextKey(settings)
  const contextMatches = dartStatusContextKey === providerRuntimeContextKey
  const checking = !contextMatches || !dartStatusChecked
  const updateRequired = contextMatches && dartUpdateRequired
  const connected = contextMatches && !updateRequired && dartStatus.connected
  const credentialError = contextMatches ? dartStatus.credentialError : undefined
  const viewer = connected ? dartStatus.viewer : null
  const accountScope = getProviderAccountScope(settings)
  const remote = isEnvironmentRuntimeContextKey(providerRuntimeContextKey)
  const subordinateRowClass = useIntegrationSubordinateRowClass('flex items-center gap-3')
  const accountScopeRowClass = useIntegrationSubordinateRowClass('text-xs')

  // The same host `disconnectDart` acts on, so another host's drafts neither ask nor get discarded.
  const disconnectHostKey = dartScopeHostKey(getDartReadScope(settings))

  const handleDisconnect = async (discardDraftsOfHost?: string): Promise<void> => {
    setDisconnectError(null)
    setDraftPrompt(null)
    const result = await disconnectDart()
    // A failed disconnect keeps the connection, so the drafts stay too.
    if (result.ok) {
      if (discardDraftsOfHost) {
        discardDirtyDrafts(discardDraftsOfHost)
      }
      clearDartCommentSendStatesForHost(disconnectHostKey)
      clearDartReplyTargetsForHost(disconnectHostKey)
    }
    if (!mountedRef.current) {
      return
    }
    setTestResult(null)
    if (!result.ok) {
      setDisconnectError(taskProviderErrorMessage(result))
    }
  }

  const requestDisconnect = (): void => {
    const count = dirtyDraftCount(disconnectHostKey)
    if (count > 0) {
      setDraftPrompt({ hostKey: disconnectHostKey, count })
      return
    }
    void handleDisconnect()
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
          <DartConnectedAccountRow
            viewer={viewer}
            testResult={testResult}
            testing={testing}
            onTest={() => void handleTest()}
            onDisconnect={requestDisconnect}
            className={subordinateRowClass}
          />
        ) : connected ? (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => void checkDartConnection()}>
              {translate(
                'auto.components.settings.task.tracker.integration.cards.c90f2ef419',
                'Re-check'
              )}
            </Button>
            <Button variant="ghost" size="sm" onClick={requestDisconnect}>
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
      {draftPrompt?.hostKey === disconnectHostKey ? (
        <DartDisconnectDraftsDialog
          count={draftPrompt.count}
          hostKey={draftPrompt.hostKey}
          onCancel={() => setDraftPrompt(null)}
          onDiscardAndDisconnect={() => void handleDisconnect(draftPrompt.hostKey)}
        />
      ) : null}
    </IntegrationCardShell>
  )
}
