import { translate } from '@/i18n/i18n'

export function dartCredentialStorageCopy(remoteRuntime: boolean): string {
  return remoteRuntime
    ? translate(
        'auto.components.dart.dart.credential.storage.copy.remoteTokenStorage',
        'Your token is sent to the selected remote runtime and stored there with runtime-supported encryption.'
      )
    : translate(
        'auto.components.dart.dart.credential.storage.copy.localTokenStorage',
        'Your token is stored locally and encrypted when local runtime storage supports it.'
      )
}
