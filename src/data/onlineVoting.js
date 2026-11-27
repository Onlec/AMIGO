import { client, connect, rpc } from './backend.js';
import { updateLocal } from './polls.js';

const states = new Map();
const listeners = new EventTarget();
const active = new Map();
export function votingStatus(id) {
  return !navigator.onLine ? 'offline' : states.get(id) || 'checking';
}
export function watchVoting(id, listener) {
  listeners.addEventListener(id,listener);
  return () => listeners.removeEventListener(id,listener);
}
export function setVotingStatus(id,state) {
  if (state === 'ready' && active.has(id)) return;
  states.set(id,state);
  listeners.dispatchEvent(new Event(id));
}
const failure = key => Object.assign(new Error(key), {localizationKey:key});
const businessErrors = new Set(['P0001','23503','23505','23514','23502','22007','22P02']);

window.addEventListener('offline', () => {
  for (const controller of active.values()) controller.abort();
  for (const id of states.keys()) setVotingStatus(id,'offline');
});
window.addEventListener('online', () => {
  for (const id of states.keys()) setVotingStatus(id,'checking');
});

export async function submitVote(id,body) {
  if (!client || votingStatus(id) !== 'ready' || active.has(id)) throw failure('vote.connectionRequired');
  const controller = new AbortController();
  active.set(id,controller);
  setVotingStatus(id,'saving');
  let timer, confirmed = false, writeStarted = false;
  const check = () => {
    if (controller.signal.aborted || !navigator.onLine) throw failure(writeStarted ? 'vote.unconfirmed' : 'vote.connectionRequired');
  };
  const read = async () => {
    check();
    const base = await rpc('amigo_read',{p:id},controller.signal);
    check();
    await updateLocal(id,row => { row.base=base; row.missing=base===null; });
    return base;
  };
  const work = async () => {
    await connect();
    // Read the current server state immediately before every online vote.
    const base = await read();
    if (!base || base.status !== 'open' || !base.votes[body.voter]) throw failure('vote.refreshRequired');
    check();
    writeStarted = true;
    await rpc('amigo_submit_ballot',{p:id,operation:crypto.randomUUID(),body:{...body,submissionMode:'online'}},controller.signal);
    const result = await read();
    confirmed = true;
    return result;
  };
  try {
    const deadline = new Promise((_,reject) => {
      timer=setTimeout(() => {
        controller.abort();
        reject(failure(writeStarted ? 'vote.unconfirmed' : 'vote.connectionRequired'));
      },10000);
    });
    const request = navigator.locks
      ? navigator.locks.request('amigo-sync-'+id,{signal:controller.signal},work) : work();
    return await Promise.race([request,deadline]);
  } catch (error) {
    if (businessErrors.has(error.code) || error.localizationKey) throw error;
    throw failure(writeStarted ? 'vote.unconfirmed' : 'vote.connectionRequired');
  } finally {
    clearTimeout(timer);
    controller.abort();
    active.delete(id);
    setVotingStatus(id,confirmed ? 'ready' : navigator.onLine ? 'unavailable' : 'offline');
  }
}
