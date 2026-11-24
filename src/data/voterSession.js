import { hashPassword } from '../utils/password.js';

export async function voterSession(pollId, voter, password) {
  const proof = await hashPassword(pollId + '/voter/' + voter, password);
  return { voter, proof };
}

export function readVoterSession(id) {
  return JSON.parse(sessionStorage.getItem('amigo-voter:' + id) || 'null');
}

export function rememberVoterSession(id, session) {
  const key = 'amigo-voter:' + id;
  if (session) sessionStorage.setItem(key, JSON.stringify(session));
  else sessionStorage.removeItem(key);
}
