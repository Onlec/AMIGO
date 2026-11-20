import React from 'react';
import { VOTE_LABELS, nextVoteValue, parseVotes } from '../utils/votes.js';

function sortDateEntries(dates) {
  return Object.entries(dates).sort(([, a], [, b]) => {
    const aKey = `${a.date}T${a.time || '00:00'}`;
    const bKey = `${b.date}T${b.time || '00:00'}`;
    return aKey.localeCompare(bKey);
  });
}

export default function VoteGrid({ dates, votes, currentVoterId, onCellClick }) {
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
                return (
                  <td key={dateId}>
                    {isMe ? (
                      <button type="button" onClick={() => onCellClick(dateId, nextVoteValue(value))}>
                        {VOTE_LABELS[value]}
                      </button>
                    ) : (
                      <span>{VOTE_LABELS[value]}</span>
                    )}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
