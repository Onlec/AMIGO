import { getLocale } from '../i18n/index.js';
const formatter = options => new Intl.DateTimeFormat(getLocale(), options);
export const formatMonth = date => formatter({ month: 'long', year: 'numeric' }).format(date);
// The calendar grid starts on Monday.
export const getWeekdays = () => Array.from({ length: 7 }, (_, i) => formatter({ weekday: 'short' }).format(new Date(2024, 0, 1 + i, 12)));

export function formatDay(key, full = false) {
  const [year, month, day] = key.split('-').map(Number);
  return formatter({ dateStyle: full ? 'full' : 'short' }).format(new Date(year, month - 1, day, 12));
}

export function formatTime(time) {
  if (!time) return '';
  const [hour, minute] = time.split(':').map(Number);
  return formatter({ hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(2000, 0, 1, hour, minute));
}

export function formatProposal(day, time, full = false) {
  return [formatDay(day, full), formatTime(time)].filter(Boolean).join(' · ');
}
