import { useCallback, useEffect, useRef } from 'react'

/** Where focus goes after the editor opens or closes; a dialog closing on that change asks through `restoreFocus`. */
export function useDartDescriptionFocus(editing: boolean) {
  const editButtonRef = useRef<HTMLButtonElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const focusNextRef = useRef<'edit' | 'textarea' | null>(null)
  const restoreFocus = useCallback((): boolean => {
    const target = focusNextRef.current === 'edit' ? editButtonRef : textareaRef
    if (focusNextRef.current && target.current) {
      focusNextRef.current = null
      target.current.focus()
      return true
    }
    return false
  }, [])
  useEffect(() => {
    restoreFocus()
  }, [editing, restoreFocus])
  return { editButtonRef, textareaRef, focusNextRef, restoreFocus }
}
