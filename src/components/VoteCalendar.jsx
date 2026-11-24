import React from 'react';
import DateChoices from './DateChoices.jsx';
import { VOTE_LABELS, nextVoteValue } from '../utils/votes.js';

export default function VoteCalendar({ dates, myVotes, onVote }) {
  const unanswered = Object.keys(dates).sort().find(day => !myVotes[day] || myVotes[day] === 'none');
  return (
    <DateChoices dates={dates} firstUnanswered={unanswered} renderCard={day => (
      <div className="answer-options" role="group" aria-label={'Beschikbaarheid op ' + day}>
        {['yes', 'maybe', 'no'].map(value => (
          <button key={value} type="button" aria-pressed={myVotes[day] === value}
            onClick={() => onVote(day, myVotes[day] === value ? 'none' : value)}>
            {VOTE_LABELS[value]}
          </button>
        ))}
      </div>
    )} renderDay={(day, number) => {
      const value = myVotes[day] || 'none';
      return (
        <button type="button" className={'calendar-day-button calendar-day-button--vote vote-' + value}
          aria-label={[day, dates[day].time, VOTE_LABELS[value]].filter(Boolean).join(' ')}
          onClick={() => onVote(day, nextVoteValue(value))}>
          <span>{number}</span>
          {dates[day].time && <small>{dates[day].time}</small>}
          <span className="calendar-day-vote">{VOTE_LABELS[value]}</span>
        </button>
      );
    }} />
  );
}
