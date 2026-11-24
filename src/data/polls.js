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
    if (kind === 'create' || kind === 'createPoll') {
      poll = { title: body.title, description: body.description, status: 'open', finalDateId: null,
        organizer: true, dates: structuredClone(body.dates), votes: {}, ownVoter: null };
      if (body.voter) poll.votes[body.voter] = { name: body.organizerName, votesJson: '{}' };
      continue;
    }
    if (!poll) continue;
    switch (kind) {
      case 'join':
        if (poll.status === 'open') poll.votes[body.voter] = { name: body.name, votesJson: '{}' };
        break;
      case 'castVote':
      case 'vote': {
        if (poll.status === 'closed' || !poll.dates[body.day]) break;
        if (kind === 'castVote' && !poll.votes[body.voter]) break;
        const choices = JSON.parse(poll.votes[body.voter]?.votesJson || '{}');
        choices[body.day] = body.value;
        const participant = poll.votes[body.voter] || { name: body.name };
        participant.votesJson = JSON.stringify(choices);
        poll.votes[body.voter] = participant;
        if (kind === 'vote') poll.ownVoter = body.voter;
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

// Keep offline votes from the old client until their voter has a password.
export async function deferLegacyVote(id, operation) {
  await updateLocal(id, row => {
    const command = row.queue.find(item => item.operation === operation);
    if (command?.kind !== 'vote') return;
    (row.legacyVotes ??= []).push(command);
    row.queue = row.queue.filter(item => item !== command);
  });
}

export async function activateVoter(id, session, name) {
  await updateLocal(id, row => {
    const belongsToVoter = item => item.kind === 'vote' && item.body.voter === session.voter;
    const pending = [...(row.legacyVotes || []), ...row.queue].filter(belongsToVoter);
    row.legacyVotes = (row.legacyVotes || []).filter(item => !belongsToVoter(item));
    row.queue = row.queue.filter(item => !belongsToVoter(item));
    if (name) row.queue.push({ operation: crypto.randomUUID(), kind: 'join', body: { ...session, name } });
    // Keep the original receipt in case the server already processed an offline vote.
    for (const { operation, body } of pending) {
      row.queue.push({ operation, kind: 'castVote', body: { ...session, day: body.day, value: body.value } });
    }
  });
  window.dispatchEvent(new CustomEvent('amigo-queued', { detail: id }));
}

export async function enqueue(id, kind, body) {
  await updateLocal(id, row => {
    row.queue.push({ operation: crypto.randomUUID(), kind, body });
  });
  window.dispatchEvent(new CustomEvent('amigo-queued', { detail: id }));
}
