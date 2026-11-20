import React, { useMemo } from 'react';
import MonthCalendar from './MonthCalendar.jsx';
import { VOTE_LABELS, nextVoteValue } from '../utils/votes.js';

export default function VoteCalendar({ dates, myVotes, onVote }) {
  const earliestDateKey = useMemo(() => {
    const keys = Object.keys(dates).sort();
    return keys[0];
  }, [dates]);

  return (
    <MonthCalendar
      initialMonthFrom={earliestDateKey}
      renderDay={(dateKey, dayNum) => {
        const candidate = dates[dateKey];
        if (!candidate) {
          return <span className="calendar-day-plain">{dayNum}</span>;
        }
        const value = myVotes[dateKey] || 'none';
        return (
          <button
            type="button"
            className={`calendar-day-button calendar-day-button--vote vote-${value}`}
            onClick={() => onVote(dateKey, nextVoteValue(value))}
            title={candidate.time ? `${dateKey} ${candidate.time}` : dateKey}
          >
            <span className="calendar-day-number">{dayNum}</span>
            <span className="calendar-day-vote">{VOTE_LABELS[value]}</span>
          </button>
        );
      }}
    />
  );
}
