import React, { useMemo, useState } from 'react';
import { parseVotes } from '../utils/votes.js';

function computeTally(dates, votes) {
  const counts = {};
  Object.keys(dates).forEach((dateId) => {
    counts[dateId] = { yes: 0, maybe: 0, no: 0 };
  });
  Object.values(votes).forEach((voter) => {
    const myVotes = parseVotes(voter.votesJson);
    Object.entries(myVotes).forEach(([dateId, value]) => {
      if (counts[dateId] && counts[dateId][value] !== undefined) {
        counts[dateId][value] += 1;
      }
    });
  });
  return counts;
}

export default function OrganizerPanel({ dates, votes, onConfirm }) {
  const [selectedDateId, setSelectedDateId] = useState('');
  const tally = useMemo(() => computeTally(dates, votes), [dates, votes]);

  function handleConfirm() {
    if (!selectedDateId) return;
    onConfirm(selectedDateId);
  }

  return (
    <div className="organizer-panel">
      <h2>Organisator: kies de einddatum</h2>
      <ul>
        {Object.entries(dates).map(([dateId, info]) => (
          <li key={dateId}>
            <label>
              <input
                type="radio"
                name="final-date"
                value={dateId}
                checked={selectedDateId === dateId}
                onChange={() => setSelectedDateId(dateId)}
              />{' '}
              {info.date} {info.time} — {tally[dateId]?.yes || 0} ja, {tally[dateId]?.maybe || 0} misschien,{' '}
              {tally[dateId]?.no || 0} nee
            </label>
          </li>
        ))}
      </ul>
      <button type="button" onClick={handleConfirm} disabled={!selectedDateId}>
        Bevestig deze datum
      </button>
    </div>
  );
}
