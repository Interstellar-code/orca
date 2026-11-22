import { useEffect, useState } from 'react'
import { Copy, ExternalLink } from 'lucide-react'
import CommentMarkdown from '@/components/comment-markdown/CommentMarkdown'
import { Button } from '@/components/ui/button'
import { useTranslate } from '@/i18n/use-translate'
import { openAppHttpLink } from '@/lib/browser/navigation/app-http-link-open'
import { copyDescriptionText } from './dart-description-copy'

// `supportsWritesV2` is false until the host answers, so a current host must not flash the update hint.
const UPDATE_HINT_DELAY_MS = 400

export function DartDescriptionOpenInDart({
  url
}: {
  url: string | null
}): React.JSX.Element | null {
  const t = useTranslate()
  return url ? (
    <Button
      type="button"
      variant="outline"
      size="xs"
      onClick={(event) => openAppHttpLink(url, { event })}
    >
      <ExternalLink />
      {t('auto.components.task.page.dart.TaskDetail.openInDart', 'Open in Dart')}
    </Button>
  ) : null
}

export function DartDescriptionReadOnly({
  text,
  openUrl,
  supportsWritesV2
}: {
  text: string
  openUrl: string | null
  supportsWritesV2: boolean
}): React.JSX.Element {
  const t = useTranslate()
  const [hintDue, setHintDue] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setHintDue(true), UPDATE_HINT_DELAY_MS)
    return () => clearTimeout(timer)
  }, [])
  return (
    <div className="space-y-2">
      {text.trim() ? (
        <CommentMarkdown content={text} variant="document" />
      ) : (
        <p className="text-xs text-muted-foreground">
          {t(
            'auto.components.task.page.dart.DartDescription.noDescriptionYet',
            'No description yet. Add one in Dart.'
          )}
        </p>
      )}
      {!supportsWritesV2 && hintDue ? (
        <p className="text-xs text-muted-foreground">
          {t(
            'auto.components.task.page.dart.DartDescription.updateServer',
            'Update the remote Orca server to edit descriptions.'
          )}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="xs"
          disabled={!text.trim()}
          onClick={() => void copyDescriptionText(text)}
        >
          <Copy />
          {t('auto.components.task.page.dart.DartDescription.copy', 'Copy')}
        </Button>
        <DartDescriptionOpenInDart url={openUrl} />
      </div>
    </div>
  )
}
