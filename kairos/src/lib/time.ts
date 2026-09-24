import {
  addMinutes,
  differenceInMinutes,
  format,
  isSameDay,
  parseISO,
  setHours,
  setMinutes,
  startOfDay,
  startOfWeek,
} from 'date-fns'
import { fr } from 'date-fns/locale'

export const LOCALE = { locale: fr }

export const toDate = (iso: string) => parseISO(iso)

export const fmtTime = (iso: string) => format(parseISO(iso), 'HH:mm')

export const fmtDay = (iso: string | Date) =>
  format(typeof iso === 'string' ? parseISO(iso) : iso, 'EEEE d MMMM', LOCALE)

export const fmtDayShort = (iso: string | Date) =>
  format(typeof iso === 'string' ? parseISO(iso) : iso, 'EEE d', LOCALE)

export const fmtRelativeDate = (iso: string) => format(parseISO(iso), "d MMM 'à' HH:mm", LOCALE)

export function durationMinutes(start: string, end: string) {
  return differenceInMinutes(parseISO(end), parseISO(start))
}

export function humanDuration(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} h`
  return `${h} h ${String(m).padStart(2, '0')}`
}

/** Minutes ecoulees depuis minuit — sert a positionner les blocs sur la grille. */
export function minutesFromDayStart(iso: string) {
  const d = parseISO(iso)
  return d.getHours() * 60 + d.getMinutes()
}

export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return parseISO(aStart) < parseISO(bEnd) && parseISO(bStart) < parseISO(aEnd)
}

export function atTime(day: Date, hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number)
  return setMinutes(setHours(startOfDay(day), h), m)
}

export function weekDays(reference: Date) {
  const start = startOfWeek(reference, { weekStartsOn: 1 })
  return Array.from({ length: 7 }, (_, i) => addMinutes(start, i * 24 * 60))
}

export { addMinutes, isSameDay, startOfDay, startOfWeek, format, differenceInMinutes, parseISO }
