import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import type { DartDescriptionDraft } from './dart-draft-store'

/** What the user typed, unresolved hunks included, so a copy holds everything a discard would lose. */
export function descriptionLineageText(lineage: DartDescriptionDraft): string {
  return [lineage.draft, ...lineage.unresolved.map((hunk) => hunk.userText)]
    .filter((text) => text !== '')
    .join('\n\n')
}

export async function copyDescriptionText(text: string): Promise<void> {
  try {
    await window.api.ui.writeClipboardText(text)
    toast.success(translate('auto.components.task.page.dart.DartDescription.copied', 'Copied'))
  } catch {
    toast.error(
      translate(
        'auto.components.task.page.dart.DartDescription.copyFailed',
        "Couldn't copy the text."
      )
    )
  }
}
