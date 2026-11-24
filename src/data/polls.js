import { openDB } from 'idb';

let database;
const updates = new EventTarget();
const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('amigo-polls') : null;
function notify(id) {
  updates.dispatchEvent(new CustomEvent('change', { detail: id }));
}
if (channel) channel.onmessage = ({ data }) => notify(data);

function db() {
  database ??= openDB('amigo-planner', 1, {
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

export async function updateLocal(id, change) {
  const tx = (await db()).transaction('polls', 'readwrite');
  const row = await tx.store.get(id) ?? { id, base: null, queue: [], notices: [] };
  change(row);
  await tx.store.put(row);
  await tx.done;
  notify(id);
  channel?.postMessage(id);
}

function removeDay(poll, day) {
  delete poll.dates[day];
  for (const voter of Object.values(poll.votes)) {
    const choices = JSON.parse(voter.votesJson);
    delete choices[day];
    voter.votesJson = JSON.stringify(choices);
  }
}

// The local view is always the latest confirmed snapshot with unsent edits replayed.
export function project(row) {
  if (!row) return null;
  let poll = structuredClone(row.base);
  for (const { kind, body } of row.queue) {
    if (kind === 'create') {
      poll = { title: body.title, description: body.description, status: 'open', finalDateId: null,
        organizer: true, dates: structuredClone(body.dates), votes: {}, ownVoter: null };
      continue;
    }
    if (!poll) continue;
    switch (kind) {
      case 'vote': {
        if (poll.status === 'closed' || !poll.dates[body.day]) break;
        const choices = JSON.parse(poll.votes[body.voter]?.votesJson || '{}');
        choices[body.day] = body.value;
        poll.votes[body.voter] = { name: body.name, votesJson: JSON.stringify(choices) };
        poll.ownVoter = body.voter;
        break;
      }
      case 'details': Object.assign(poll, body); break;
      case 'addDate': poll.dates[body.day] ??= { date: body.day, time: '' }; break;
      case 'edit':
        if (body.removed.includes(poll.finalDateId)) break;
        if ('title' in body) poll.title = body.title;
        if ('description' in body) poll.description = body.description;
        for (const day of body.removed) removeDay(poll, day);
        for (const day of body.added) poll.dates[day] ??= { date: day, time: '' };
        break;
      case 'removeDate':
        if (body.day !== poll.finalDateId) removeDay(poll, body.day);
        break;
      case 'removeVoter':
        delete poll.votes[body.voter];
        if (poll.ownVoter === body.voter) poll.ownVoter = null;
        break;
      case 'close':
        poll.status = 'closed';
        poll.finalDateId = body.day;
        break;
    }
  }
  return poll;
}

export async function enqueue(id, kind, body) {
  await updateLocal(id, row => {
    if (kind === 'vote') {
      const voter = project(row)?.ownVoter;
      body = { ...body, voter: voter || crypto.randomUUID(), existing: Boolean(voter) };
    }
    row.queue.push({ operation: crypto.randomUUID(), kind, body });
  });
  window.dispatchEvent(new CustomEvent('amigo-queued', { detail: id }));
}
