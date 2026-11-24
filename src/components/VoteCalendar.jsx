import React from 'react';
import DateChoices from './DateChoices.jsx';
import SegmentedControl from './SegmentedControl.jsx';
import { VOTE_LABELS, nextVoteValue } from '../utils/votes.js';

const answerOptions = ['yes', 'maybe', 'no'].map(value => ({
  value, label: VOTE_LABELS[value], status: value,
}));

export default function VoteCalendar({ dates, myVotes, onVote }) {
  const unanswered = Object.keys(dates).sort().find(day => !myVotes[day] || myVotes[day] === 'none');
  return (
    <>
      <ul className="vote-legend" aria-label="Legenda beschikbaarheid">
        {answerOptions.map(option => <li key={option.value}>
          <span className={'vote-legend__swatch vote-legend__swatch--' + option.value} aria-hidden="true" />
          {option.label}
        </li>)}
        <li><span className="vote-legend__swatch vote-legend__swatch--none" aria-hidden="true" />Onbeantwoord</li>
      </ul>
      <DateChoices dates={dates} firstUnanswered={unanswered} renderCard={day => (
        <SegmentedControl label={'Beschikbaarheid op ' + day} variant="status" allowDeselect
          options={answerOptions} value={myVotes[day] || 'none'} onChange={value => onVote(day, value || 'none')} />
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
    </>
  );
}
