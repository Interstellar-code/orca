import { useCallback, useEffect, useState } from 'react'
import { translate } from '@/i18n/i18n'
import type { DartNoticeApi } from './dart-detail-contracts'

/** The section's view of the task notice. While a save's outcome is unknown, each read is evidence: it can show the text the save intended, or an edit that opens the conflict dialog. */
export function useDartDescriptionUnknownNotice(args: {
  notice: DartNoticeApi
  shownText: string | null
  base: string | null
  onConflict: (latest: string) => void
  onAcceptedIntended: (intended: string) => void
}) {
  const { notice, shownText, base, onConflict, onAcceptedIntended } = args
  const [intended, setIntended] = useState<string | null>(null)
  const unknown =
    notice.notice?.field === 'description' && notice.notice.kind === 'unknown'
      ? notice.notice
      : null
  const checkedAt = unknown?.checkedAt

  useEffect(() => {
    if (
      checkedAt !== undefined &&
      intended !== null &&
      base !== null &&
      shownText !== null &&
      shownText !== base &&
      shownText !== intended
    ) {
      onConflict(shownText)
    }
  }, [base, checkedAt, intended, onConflict, shownText])

  const dismissNotice = useCallback<DartNoticeApi['dismissNotice']>(() => {
    notice.dismissNotice()
    if (intended !== null) {
      setIntended(null)
      if (shownText === intended) {
        onAcceptedIntended(intended)
      }
    }
  }, [intended, notice, onAcceptedIntended, shownText])

  const sectionNotice: DartNoticeApi | null =
    notice.notice?.field === 'description'
      ? {
          ...notice,
          dismissNotice,
          notice:
            unknown && intended !== null && shownText === intended
              ? {
                  ...unknown,
                  message: translate(
                    'auto.components.task.page.dart.DartDescription.nowShowsYourText',
                    'Dart now shows your text.'
                  )
                }
              : notice.notice
        }
      : null

  return { sectionNotice, setIntended }
}
