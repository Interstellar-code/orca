import { translate } from '@/i18n/i18n'
import type { DartDescriptionDraftHunk } from './dart-draft-store'

function HunkText({ label, text, empty }: { label: string; text: string; empty: string }) {
  return (
    <div className="min-w-0 space-y-0.5">
      <p className="text-2xs text-muted-foreground">{label}</p>
      <div className="whitespace-pre-wrap break-words rounded-md border border-border/60 bg-muted/35 px-2 py-1 font-mono text-xs text-foreground">
        {text || <span className="text-muted-foreground">{empty}</span>}
      </div>
    </div>
  )
}

/** One hunk Orca did not apply: the Dart text the user started from, and what they wanted there. */
export function DartDescriptionHunkTexts({
  hunk
}: {
  hunk: DartDescriptionDraftHunk
}): React.JSX.Element {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <HunkText
        label={translate(
          'auto.components.task.page.dart.DartDescriptionHunk.dartVersion',
          "Dart's version when you started"
        )}
        text={hunk.baseText}
        empty={translate(
          'auto.components.task.page.dart.DartDescriptionHunk.noText',
          '(no text here)'
        )}
      />
      <HunkText
        label={translate(
          'auto.components.task.page.dart.DartDescriptionHunk.yourVersion',
          'Your version'
        )}
        text={hunk.userText}
        empty={translate(
          'auto.components.task.page.dart.DartDescriptionHunk.removed',
          '(you removed this text)'
        )}
      />
    </div>
  )
}
