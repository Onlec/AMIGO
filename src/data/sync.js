import { createClient } from '@supabase/supabase-js';
import { deferLegacyVote, pendingPolls, readLocal, updateLocal } from './polls.js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const client = url && key ? createClient(url, key) : null;
let signingIn;

async function connect() {
  if (!client) throw new Error('Supabase is nog niet ingesteld.');
  async function ensureSession() {
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    if (data.session) return;
    const result = await client.auth.signInAnonymously();
    if (result.error) throw result.error;
  }
  signingIn ??= (navigator.locks
    ? navigator.locks.request('amigo-session', ensureSession)
    : ensureSession()).finally(() => { signingIn = null; });
  await signingIn;
}
async function rpc(name, params) {
  const { data, error } = await client.rpc(name, params);
  if (error) throw error;
  return data;
}

const statuses = new Map();
const events = new EventTarget();
export function syncStatus(id) { return statuses.get(id) || ''; }
function status(id, message) {
  statuses.set(id, message);
  events.dispatchEvent(new Event(id));
}
export function watchStatus(id, listener) {
  events.addEventListener(id, listener);
  return () => events.removeEventListener(id, listener);
}

const supportedId = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const labels = { signIn: 'Aanmelden', lockOrganizer: 'Afmelden als organisator', ballot: 'Stem opslaan', join: 'Nieuwe stemmer', castVote: 'Stem', createPoll: 'Aanmaken', edit: 'Prikker bewerken', create: 'Aanmaken', vote: 'Stem', details: 'Titel of omschrijving', addDate: 'Datum toevoegen',
  removeDate: 'Datum verwijderen', close: 'Datum bevestigen', removeVoter: 'Deelnemer verwijderen' };

async function synchronize(id) {
  if (!supportedId.test(id)) return status(id, 'Prikker niet gevonden.');
  if (!navigator.onLine) return status(id, 'Offline');
  await connect();
  let row = await readLocal(id);
  while (row?.queue.length) {
    const command = row.queue[0];
    if (command.kind === 'vote') {
      await deferLegacyVote(id, command.operation);
      row = await readLocal(id);
      continue;
    }
    let rejection;
    let loginSession;
    try {
      if (command.kind === 'signIn') {
        loginSession = await rpc('amigo_sign_in', { p: id, operation: command.operation, body: command.body });
      } else if (command.kind === 'lockOrganizer') {
        await rpc('amigo_lock_organizer', { p: id, operation: command.operation });
      } else if (command.kind === 'ballot') {
        await rpc('amigo_submit_ballot', { p: id, operation: command.operation, body: command.body });
      } else if (command.kind === 'edit') {
        await rpc('amigo_edit', { p: id, operation: command.operation, body: command.body });
      } else {
        await rpc('amigo_apply', { p: id, ...command });
      }
    } catch (error) {
      if (!['P0001','23503','23505','23514','23502','22007','22P02'].includes(error.code)) throw error;
      rejection = labels[command.kind] + (command.body.day ? ' (' + command.body.day + ')' : '') + ': ' + error.message;
    }
    // Keep the command until both its receipt and the new snapshot can be read.
    const base = await rpc('amigo_read', { p: id });
    await updateLocal(id, current => {
      current.base = base;
      current.queue = current.queue.filter(item => item.operation !== command.operation);
      if (command.kind === 'signIn') {
        (current.loginResults ??= {})[command.operation] = { session: loginSession, rejection };
      }
      if (command.kind === 'ballot' || command.kind === 'signIn') {
        (current.ballotResults ??= {})[command.operation] = { rejection };
        if (!rejection && (command.kind === 'ballot' || (loginSession?.voter && base?.status === 'open'))) {
          const used = new Set(command.body.legacyOperations || []);
          current.legacyVotes = (current.legacyVotes || []).filter(item => !used.has(item.operation));
        }
      }
      if (rejection) current.notices.push(rejection);
    });
    row = await readLocal(id);
  }
  const base = await rpc('amigo_read', { p: id });
  await updateLocal(id, current => { current.base = base; });
  status(id, base ? 'Gesynchroniseerd' : 'Prikker niet gevonden.');
}

const running = new Map();
export function sync(id) {
  const active = running.get(id);
  if (active) { active.again = true; return active.promise; }
  const job = { again: false };
  running.set(id, job);
  const work = async () => {
    do {
      job.again = false;
      await synchronize(id);
    } while (job.again);
  };
  job.promise = Promise.resolve().then(() => navigator.locks
    ? navigator.locks.request('amigo-sync-' + id, work) : work())
    .catch(error => status(id, client ? 'Synchronisatie uitgesteld. ' + error.message : error.message))
    .finally(() => running.delete(id));
  return job.promise;
}

export async function unlock(id, proof) {
  if (!navigator.onLine) throw new Error('Ga online om het organisatorwachtwoord te controleren.');
  await connect();
  // An older offline logout must finish before granting a fresh session.
  if ((await readLocal(id))?.queue.some(command => command.kind === 'lockOrganizer')) {
    await sync(id);
    if ((await readLocal(id))?.queue.some(command => command.kind === 'lockOrganizer')) {
      throw new Error('Je vorige afmelding is nog niet gesynchroniseerd. Probeer opnieuw zodra de verbinding is hersteld.');
    }
  }
  if (!await rpc('amigo_unlock', { p: id, proof })) throw new Error('Wachtwoord klopt niet.');
  await sync(id);
}

export function follow(id) {
  let subscription;
  let stopped = false;
  let joining = false;
  async function refresh() {
    await sync(id);
    if (stopped || joining || subscription || !client || syncStatus(id) !== 'Gesynchroniseerd') return;
    joining = true;
    try {
      await client.realtime.setAuth();
      if (stopped) return;
      subscription = client.channel('amigo:' + id, { config: { private: true } })
        .on('broadcast', { event: 'changed' }, () => sync(id))
        .subscribe(state => { if (state === 'SUBSCRIBED') sync(id); });
    } catch (error) { status(id, 'Liveverbinding uitgesteld. ' + error.message); }
    finally { joining = false; }
  }
  refresh();
  const timer = setInterval(refresh, 30000);
  window.addEventListener('online', refresh);
  window.addEventListener('offline', refresh);
  return () => {
    stopped = true;
    clearInterval(timer);
    window.removeEventListener('online', refresh);
    window.removeEventListener('offline', refresh);
    if (subscription) client.removeChannel(subscription);
  };
}

export function startSync() {
  async function flush() {
    if (navigator.onLine) {
      for (const id of await pendingPolls()) await sync(id);
    }
  }
  const retry = () => flush().catch(error => console.warn('Lokale synchronisatie:', error.message));
  window.addEventListener('amigo-queued', event => sync(event.detail));
  window.addEventListener('online', retry);
  setInterval(retry, 30000);
  retry();
}
