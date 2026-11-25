import { openDB } from 'idb';
import { PLANNER_STORAGE_NAMESPACE } from '../config.js';

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
    if (kind === 'createPoll') {
      poll = { title: body.title, description: body.description, status: 'open', finalDateId: null,
        organizer: true, dates: structuredClone(body.dates), votes: {}, organizerVoter: body.voter || null };
      if (body.voter) poll.votes[body.voter] = { name: body.organizerName, votesJson: '{}' };
      continue;
    }
    if (!poll) continue;
    switch (kind) {
      case 'lockOrganizer':
        poll.organizer = false;
        break;
      case 'ballot': {
        // Project automatic saves only for participants confirmed by sign-in.
        const participant = poll.votes[body.voter];
        if (poll.status !== 'open' || !participant) break;
        const choices = JSON.parse(participant.votesJson || '{}');
        for (const [day, value] of Object.entries(body.changes || {})) {
          if (!poll.dates[day]) continue;
          if (value === 'none') delete choices[day];
          else choices[day] = value;
        }
        participant.votesJson = JSON.stringify(choices);
        break;
      }
      case 'edit':
        if (poll.status === 'closed' && (body.added.length || body.removed.length)) break;
        if (body.removed.includes(poll.finalDateId)) break;
        if ('title' in body) poll.title = body.title;
        if ('description' in body) poll.description = body.description;
        for (const day of body.removed) removeDay(poll, day);
        for (const day of body.added) poll.dates[day] ??= { date: day, time: '' };
        if (body.organizerParticipation) {
          const participation = body.organizerParticipation;
          const ownId = poll.organizerVoter || participation.voter;
          if (participation.enabled) {
            poll.votes[ownId] ??= { name: participation.name, votesJson: '{}' };
            poll.organizerVoter = ownId;
          } else {
            delete poll.votes[ownId];
            poll.organizerVoter = null;
          }
        }
        break;
      case 'removeVoter':
        delete poll.votes[body.voter];
        if (poll.organizerVoter === body.voter) poll.organizerVoter = null;
        break;
      case 'close':
        poll.status = 'closed';
        poll.finalDateId = body.day;
        break;
      case 'reopen':
        poll.status = 'open';
        poll.finalDateId = null;
        break;
    }
  }
  return poll;
}

export async function enqueue(id, kind, body) {
  const operation = crypto.randomUUID();
  await updateLocal(id, row => {
    row.queue.push({ operation, kind, body });
  });
  window.dispatchEvent(new CustomEvent('amigo-queued', { detail: id }));
  return operation;
}
