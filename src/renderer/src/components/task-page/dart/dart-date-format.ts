const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/

/** The calendar date as Dart wrote it: a datetime is never shifted into the viewer's zone, so no zone shows the previous day. */
export function dartCalendarDate(value: string | null | undefined): string | null {
  const match = value ? CALENDAR_DATE.exec(value.trim()) : null
  if (!match) {
    return null
  }
  const [, year, month, day] = match
  const probe = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  const real =
    probe.getUTCFullYear() === Number(year) &&
    probe.getUTCMonth() === Number(month) - 1 &&
    probe.getUTCDate() === Number(day)
  return real ? `${year}-${month}-${day}` : null
}

export function formatDartDate(value: string | null | undefined, locale?: string): string | null {
  const date = dartCalendarDate(value)
  if (!date) {
    return null
  }
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString(locale)
}

/** A date input emits partial years while typing ("0002"); only a four-digit year is a finished entry. */
export function isFinishedDateInput(value: string): boolean {
  return dartCalendarDate(value) !== null && Number(value.slice(0, 4)) >= 1000
}
