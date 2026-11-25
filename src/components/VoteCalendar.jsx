import React from 'react';
import DateChoices from './DateChoices.jsx';
import SegmentedControl from './SegmentedControl.jsx';
import { VOTE_ICONS, VOTE_LABELS, nextVoteValue } from '../utils/votes.js';

import { formatDay, formatTime } from '../utils/dates.js';
const answerOptions = ['yes', 'maybe', 'no'].map(value => ({
  value, label: VOTE_LABELS[value], icon: VOTE_ICONS[value], status: value,
}));

export default function VoteCalendar({ dates, myVotes, onVote, disabled = false }) {
  const unanswered = Object.keys(dates).sort().find(day => !myVotes[day] || myVotes[day] === 'none');
  const legend = (
    <ul className="vote-legend" aria-label="Legenda beschikbaarheid">
        {answerOptions.map(option => <li key={option.value}>
          <span className={'vote-legend__swatch vote-legend__swatch--' + option.value} aria-hidden="true" />
          {option.label}
        </li>)}
        <li><span className="vote-legend__swatch vote-legend__swatch--none" aria-hidden="true" />Onbeantwoord</li>
    </ul>
  );
  return (
      <DateChoices dates={dates} firstUnanswered={unanswered} legend={legend} showUnansweredJump renderCard={day => (
        <SegmentedControl label={'Beschikbaarheid op ' + formatDay(day)} variant="status" allowDeselect iconOnly disabled={disabled}
          options={answerOptions} value={myVotes[day] || 'none'} onChange={value => onVote(day, value || 'none')} />
      )} renderDay={(day, number) => {
        const value = myVotes[day] || 'none';
        return (
          <button type="button" disabled={disabled} className={'calendar-day-button calendar-day-button--vote vote-' + value}
            aria-label={[formatDay(day), formatTime(dates[day].time), value === 'none' ? 'Onbeantwoord' : VOTE_LABELS[value]].filter(Boolean).join(' ')}
            onClick={() => onVote(day, nextVoteValue(value))}>
            <span>{number}</span>
            {dates[day].time && <small>{formatTime(dates[day].time)}</small>}
            <span className="calendar-day-vote" aria-hidden="true">{VOTE_ICONS[value]}</span>
          </button>
        );
      }} />
  );
}
