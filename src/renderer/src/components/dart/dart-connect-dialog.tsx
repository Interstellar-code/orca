import { useId, useLayoutEffect, useState } from 'react'
import { LoaderCircle, Lock } from 'lucide-react'
import { useAppStore } from '@/store'
import { useMountedRef } from '@/hooks/useMountedRef'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  getProviderRuntimeContextKey,
  isEnvironmentRuntimeContextKey
} from '@/lib/provider-runtime-context'
import { preventOutsideDismissWhenDirty } from '@/lib/outside-dismiss-guard'
import { taskProviderErrorMessage, taskProviderErrorText } from '@/lib/task-provider-error-copy'
import { translate } from '@/i18n/i18n'
import { dartCredentialStorageCopy } from './dart-credential-storage-copy'

type DartConnectDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConnected?: () => void
  /** Opens above the Settings overlay. */
  elevated?: boolean
}

type ConnectState = 'idle' | 'connecting' | 'error'

export function DartConnectDialog({
  open,
  onOpenChange,
  onConnected,
  elevated
}: DartConnectDialogProps): React.JSX.Element {
  const connectDart = useAppStore((s) => s.connectDart)
  const settings = useAppStore((s) => s.settings)
  const remoteRuntime = isEnvironmentRuntimeContextKey(getProviderRuntimeContextKey(settings))
  const mountedRef = useMountedRef()
  const tokenId = useId()
  const errorId = useId()

  const [apiToken, setApiToken] = useState('')
  const [connectState, setConnectState] = useState<ConnectState>('idle')
  const [connectError, setConnectError] = useState<string | null>(null)

  // Clear the secret on close and before paint on each open so a prior token cannot flash or persist.
  useLayoutEffect(() => {
    setApiToken('')
    if (!open) {
      return
    }
    setConnectState('idle')
    setConnectError(null)
  }, [open])

  const canSubmit = Boolean(apiToken.trim()) && connectState !== 'connecting'

  const clearErrorOnEdit = (): void => {
    if (connectState === 'error') {
      setConnectState('idle')
      setConnectError(null)
    }
  }

  const closeAndClear = (nextOpen: boolean): void => {
    if (!nextOpen) {
      setApiToken('')
    }
    onOpenChange(nextOpen)
  }

  const handleOpenChange = (nextOpen: boolean): void => {
    if (connectState !== 'connecting') {
      closeAndClear(nextOpen)
    }
  }

  // Keep a typed token on backdrop clicks; explicit Cancel, Escape and the close button still dismiss.
  const guardOutsideDismiss = preventOutsideDismissWhenDirty(() => apiToken !== '')

  const handleConnect = async (): Promise<void> => {
    const trimmedToken = apiToken.trim()
    if (!trimmedToken || connectState === 'connecting') {
      return
    }
    setConnectState('connecting')
    setConnectError(null)
    try {
      const result = await connectDart({ apiToken: trimmedToken })
      if (!mountedRef.current) {
        return
      }
      if (result.ok) {
        setApiToken('')
        setConnectState('idle')
        onOpenChange(false)
        onConnected?.()
        return
      }
      setConnectState('error')
      setConnectError(taskProviderErrorMessage(result))
    } catch (error) {
      if (mountedRef.current) {
        setConnectState('error')
        setConnectError(
          error instanceof Error
            ? taskProviderErrorText(error.message)
            : translate(
                'auto.components.dart.dart.connect.dialog.connectionFailed',
                'Connection failed'
              )
        )
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        overlayClassName={elevated ? 'z-[110]' : undefined}
        className={elevated ? 'z-[120] sm:max-w-md' : 'sm:max-w-md'}
        onPointerDownOutside={guardOutsideDismiss}
        onInteractOutside={guardOutsideDismiss}
      >
        <DialogHeader>
          <DialogTitle>
            {translate('auto.components.dart.dart.connect.dialog.title', 'Connect Dart')}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.dart.dart.connect.dialog.description',
              'Paste your Dart authorization token. Orca checks it before saving.'
            )}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            void handleConnect()
          }}
        >
          <div className="flex flex-col gap-3">
            <div className="space-y-2">
              <Label htmlFor={tokenId}>
                {translate(
                  'auto.components.dart.dart.connect.dialog.tokenLabel',
                  'Authorization token'
                )}
              </Label>
              <Input
                id={tokenId}
                type="password"
                autoFocus
                autoComplete="off"
                spellCheck={false}
                placeholder={translate(
                  'auto.components.dart.dart.connect.dialog.tokenPlaceholder',
                  'dsa_...'
                )}
                value={apiToken}
                onChange={(event) => {
                  setApiToken(event.target.value)
                  clearErrorOnEdit()
                }}
                disabled={connectState === 'connecting'}
                aria-invalid={connectState === 'error' || undefined}
                aria-describedby={connectState === 'error' ? errorId : undefined}
              />
            </div>
            {connectState === 'error' && connectError ? (
              <p id={errorId} role="alert" className="text-xs text-destructive">
                {connectError}
              </p>
            ) : null}
            <div className="space-y-2 text-xs text-muted-foreground">
              <p>
                {translate(
                  'auto.components.dart.dart.connect.dialog.tokenHelp',
                  'In Dart, open Settings > Account (your profile icon at the top left, then Account), scroll down and copy your Authorization token. It starts with dsa_.'
                )}
              </p>
              <p>
                {translate(
                  'auto.components.dart.dart.connect.dialog.premiumNote',
                  'API access needs a Dart Premium plan or above.'
                )}
              </p>
            </div>
            <p className="flex items-center gap-1.5 text-2xs text-muted-foreground/70">
              <Lock className="size-3 shrink-0" />
              {dartCredentialStorageCopy(remoteRuntime)}
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => closeAndClear(false)}
              disabled={connectState === 'connecting'}
            >
              {translate('auto.components.dart.dart.connect.dialog.cancel', 'Cancel')}
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {connectState === 'connecting' ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" />
                  {translate('auto.components.dart.dart.connect.dialog.verifying', 'Verifying…')}
                </>
              ) : (
                translate('auto.components.dart.dart.connect.dialog.connect', 'Connect')
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
