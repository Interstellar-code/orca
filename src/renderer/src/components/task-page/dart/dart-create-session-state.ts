import type { DartCreateSession } from '@/store/slices/task-creation-drafts'

type DartCreateOwnerRecord = { activeOwner: string | null; keys: Record<string, string> }

export function resolveDartCreateKey(args: {
  hostKey: string
  ownerUserId: string | null
  ownerRecord: DartCreateOwnerRecord | undefined
  hasUnknownSession: boolean
}): string {
  const { hostKey, ownerUserId, ownerRecord, hasUnknownSession } = args
  const unknownKey = JSON.stringify([hostKey, 'create', null])
  if (!ownerUserId) {
    return (ownerRecord?.activeOwner && ownerRecord.keys[ownerRecord.activeOwner]) || unknownKey
  }
  return (
    ownerRecord?.keys[ownerUserId] ??
    (!ownerRecord?.activeOwner && hasUnknownSession
      ? unknownKey
      : JSON.stringify([hostKey, 'create', ownerUserId]))
  )
}

/** An unresolved create may be sent again only once its lookup is checked and no match is pending. */
export function isDartCreateAnywayReady(session: DartCreateSession): boolean {
  return (
    session.unknown &&
    session.listChecked &&
    !session.lookingUp &&
    (session.matchesDismissed || (session.matches.length === 0 && !session.truncated))
  )
}
