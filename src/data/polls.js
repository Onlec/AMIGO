import { openDB } from 'idb';
import { PLANNER_STORAGE_NAMESPACE } from '../config.js';
import { message } from '../i18n/index.js';
import { saveDraft } from './draft.js';

let database;
const updates = new EventTarget();
const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(PLANNER_STORAGE_NAMESPACE) : null;
function notify(id) {
  updates.dispatchEvent(new CustomEvent('change', { detail: id }));
}
if (channel) channel.onmessage = ({ data }) => notify(data);

function db() {
  database ??= openDB(PLANNER_STORAGE_NAMESPACE, 1, {
    upgrade(connection) { connection.createObjectStore('polls', { keyPath: 'id' }); },
  });
  return database;
}

export function watchPoll(id, callback) {
  const listener = event => { if (event.detail === id) callback(); };
  updates.addEventListener('change', listener);
  return () => updates.removeEventListener('change', listener);
}

export async function readLocal(id) { return (await db()).get('polls', id); }
export async function pendingPolls() {
  return (await (await db()).getAll('polls')).filter(row => row.queue.length).map(row => row.id);
}

export async function discardPendingActions(id) {
  const row = await readLocal(id);
  if (!row?.queue.length) return;
  const draft = row.queue.find(item => item.kind === 'createPoll')?.body;
  if (draft) saveDraft({ ...draft, selectedDates: draft.dates });
  const key = row.queue.every(item => item.kind === 'ballot') ? 'vote.discarded' : 'action.discarded';
  await updateLocal(id,current => {
    current.queue = [];
    if (!current.notices.some(notice => notice?.key === key)) current.notices.push(message(key));
  });
}

export async function updateLocal(id, change) {
  const tx = (await db()).transaction('polls', 'readwrite');
  const row = await tx.store.get(id) ?? { id, base: null, queue: [], notices: [] };
  change(row);
  await tx.store.put(row);
  await tx.done;
  notify(id);
  channel?.postMessage(id);
}

// Display only confirmed server data. Old queued changes must never appear as saved.
export function project(row) { return row?.base ? structuredClone(row.base) : null; }
export async function enqueue() {
  throw Object.assign(new Error('Online confirmation required'), {localizationKey:'action.onlineRequired'});
}
