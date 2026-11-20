import React from 'react';
import { VOTE_LABELS, parseVotes } from '../utils/votes.js';

function sortDateEntries(dates) {
  return Object.entries(dates).sort(([a], [b]) => a.localeCompare(b));
}

// Alleen-lezen overzicht: wie heeft wat gestemd. Het aanpassen van je eigen
// stem gebeurt via <VoteCalendar>, niet in deze tabel.
export default function VoteGrid({ dates, votes, currentVoterId }) {
  const dateEntries = sortDateEntries(dates);
  const voterEntries = Object.entries(votes);

  return (
    <table className="vote-grid">
      <thead>
        <tr>
          <th>Naam</th>
          {dateEntries.map(([dateId, info]) => (
            <th key={dateId}>
              {info.date}
              {info.time ? ` ${info.time}` : ''}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {voterEntries.map(([voterId, voter]) => {
          const myVotes = parseVotes(voter.votesJson);
          const isMe = voterId === currentVoterId;
          return (
            <tr key={voterId} className={isMe ? 'my-row' : ''}>
              <td>
                {voter.name}
                {isMe ? ' (jij)' : ''}
              </td>
              {dateEntries.map(([dateId]) => {
                const value = myVotes[dateId] || 'none';
                return <td key={dateId}>{VOTE_LABELS[value]}</td>;
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
