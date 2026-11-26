import { useEffect, useSyncExternalStore } from 'react';
import { client, rpc } from './backend.js';

let snapshot = { status: 'idle', data: null, fetchedAt: null };
let request;
const listeners = new Set();
const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
const read = () => snapshot;
function publish(next) {
  snapshot = next;
  for (const listener of listeners) listener();
}

export function loadStatistics(retry = false) {
  if (request) return request;
  if (!retry && snapshot.status !== 'idle') return Promise.resolve();
  publish({ status: 'loading', data: null, fetchedAt: null });
  // This RPC is public and aggregate-only. Reading it does not create a login.
  request = Promise.resolve().then(async () => {
    if (!client || !navigator.onLine) throw new Error('Statistics unavailable');
    const data = await rpc('amigo_statistics', {});
    if (!data || !Number.isFinite(Date.parse(data.startedAt)) || !['planners','registrations','answers','maybeAnswers','mondayAnswers',
      'mondayNoAnswers','finalizedPlanners','weekendDates','unanimousDates'].every(key =>
      Number.isSafeInteger(data[key]) && data[key] >= 0)) throw new Error('Invalid statistics');
    publish({ status: 'ready', data, fetchedAt: new Date() });
  }).catch(() => publish({ status: 'error', data: null, fetchedAt: null }))
    .finally(() => { request = null; });
  return request;
}

export function useStatistics() {
  const state = useSyncExternalStore(subscribe, read);
  useEffect(() => { loadStatistics(); }, []);
  return state;
}
