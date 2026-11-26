// UI regression transport only. Real HTTP/offline behavior is tested separately.
import { updateLocal, project } from '../../src/data/polls.js';
window.fixtureOnlineVotes = [];
export const votingStatus = () => navigator.onLine ? 'ready' : 'offline';
export const setVotingStatus = () => {};
export function watchVoting(id,listener) {
  window.addEventListener('online',listener); window.addEventListener('offline',listener);
  return () => {window.removeEventListener('online',listener);window.removeEventListener('offline',listener);};
}
export async function submitVote(id,body) {
  if (!navigator.onLine) throw Error('Offline fixture vote');
  await updateLocal(id,row => {
    const current = project(row);
    const voter = current.votes[body.voter];
    if (current.status !== 'open' || !voter) throw Error('Unavailable fixture voter');
    const choices = JSON.parse(voter.votesJson || '{}');
    for (const [day,value] of Object.entries(body.changes)) {
      if (value === 'none') delete choices[day]; else choices[day]=value;
    }
    row.base.votes[body.voter]={...voter,votesJson:JSON.stringify(choices)};
  });
  window.fixtureOnlineVotes.push(body);
}
