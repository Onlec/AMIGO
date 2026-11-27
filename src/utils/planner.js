import { parseVotes } from './votes.js';
export function normalizedDates(dates, enabled) {
  return Object.fromEntries(Object.entries(dates).map(([day, info]) => [day, { date: day, time: enabled ? info.time || '' : '' }]));
}
export function hasMissingTimes(dates, enabled) { return enabled && Object.values(dates).some(info => !/^([01]\d|2[0-3]):[0-5]\d$/.test(info.time || '')); }
export function affectedAnswers(poll, removed, changedTimes, removeOwn = false) {
  const days = new Set([...removed, ...changedTimes]);
  return Object.entries(poll.votes).reduce((sum, [id, person]) => sum + Object.entries(parseVotes(person.votesJson))
    .filter(([day, value]) => value !== 'none' && (days.has(day) || (removeOwn && id === poll.organizerVoter))).length, 0);
}
