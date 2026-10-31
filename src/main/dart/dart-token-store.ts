import { createEncryptedApiKeyFileStore } from '../credentials/encrypted-api-key-file-store'

const store = createEncryptedApiKeyFileStore({
  fileName: 'dart-api-key.enc',
  envelopePrefix: 'orca-dart-api-key:v1:',
  providerLabel: 'Dart',
  logScope: 'dart'
})

export const hasDartApiToken = store.has
export const getDartApiTokenProtection = store.protection
export const saveDartApiToken = store.save
export const readDartApiToken = store.read
export const clearDartApiToken = store.clear
export const dartApiKeyEnvelopeFile = store.envelopeFile
