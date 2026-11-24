import React from 'react';
import { VOTE_LABELS, parseVotes } from '../utils/votes.js';

function sortDateEntries(dates) {
  return Object.entries(dates).sort(([a], [b]) => a.localeCompare(b));
}

// Alleen-lezen overzicht van wie wat stemde. Het aanpassen van je eigen stem
// gebeurt via <VoteCalendar>; `canManage` (enkel waar voor de ontgrendelde
// organisator) voegt een kolom toe om deelnemers te verwijderen.
export default function VoteGrid({ dates, votes, currentVoterId, canManage, onRemoveVoter }) {
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
          {canManage && <th />}
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
              {canManage && (
                <td>
                  <button
                    type="button"
                    className="btn-danger"
                    onClick={() => onRemoveVoter(voterId)}
                    aria-label={`Verwijder ${voter.name}`}
                  >
                    ✕
                  </button>
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
