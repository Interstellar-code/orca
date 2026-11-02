import React from 'react'

export function DartIcon({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="none">
      {/* Neutral target glyph: Dart ships no monochrome mark we may reuse. */}
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="1.25" fill="currentColor" />
    </svg>
  )
}
