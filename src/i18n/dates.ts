import { useLocale, type Locale } from './index'

/**
 * A date and time in the interface language (#137): "10 Oct 2026, 14:05" or
 * "2026年10月10日 14:05". Empty for a missing or unreadable date.
 */
export function formatDateTime(
  value: string | number | Date | null | undefined,
  locale: Locale = useLocale.getState().locale,
): string {
  if (value === null || value === undefined || value === '') return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })
}
