import { hashPassword } from '../utils/password.js';
import { PLANNER_STORAGE_NAMESPACE } from '../config.js';

export const voterStorageKey = id => PLANNER_STORAGE_NAMESPACE + ':voter:' + id;
export const ballotStorageKey = id => PLANNER_STORAGE_NAMESPACE + ':ballot:' + id;

export async function voterSession(pollId, voter, password) {
  const proof = await hashPassword(pollId + '/voter/' + voter, password);
  return { voter, proof };
}

export function readVoterSession(id) {
  return JSON.parse(sessionStorage.getItem(voterStorageKey(id)) || 'null');
}

export function rememberVoterSession(id, session) {
  const key = voterStorageKey(id);
  if (session) sessionStorage.setItem(key, JSON.stringify(session));
  else sessionStorage.removeItem(key);
}
