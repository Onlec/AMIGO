const shortDate = new Intl.DateTimeFormat(undefined, { dateStyle: 'short' });
const longDate = new Intl.DateTimeFormat(undefined, { dateStyle: 'full' });
const clock = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
export const monthHeading = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });
const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
// The calendar grid starts on Monday.
export const weekdays = Array.from({ length: 7 }, (_, i) => weekday.format(new Date(2024, 0, 1 + i, 12)));

export function formatDay(key, full = false) {
  const [year, month, day] = key.split('-').map(Number);
  return (full ? longDate : shortDate).format(new Date(year, month - 1, day, 12));
}

export function formatTime(time) {
  if (!time) return '';
  const [hour, minute] = time.split(':').map(Number);
  return clock.format(new Date(2000, 0, 1, hour, minute));
}

export function formatProposal(day, time, full = false) {
  return [formatDay(day, full), formatTime(time)].filter(Boolean).join(' · ');
}
