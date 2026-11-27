import { t } from '../i18n/index.js';
import React from 'react';
import DateChoices from './DateChoices.jsx';
import SegmentedControl from './SegmentedControl.jsx';
import { VOTE_ICONS, voteLabel, nextVoteValue } from '../utils/votes.js';

import { formatDay, formatTime } from '../utils/dates.js';
const getAnswerOptions = () => ['yes', 'maybe', 'no'].map(value => ({
  value, label: voteLabel(value), icon: VOTE_ICONS[value], status: value,
}));

export default function VoteCalendar({ dates, myVotes, onVote, disabled = false, feedback, remaining, complete = false }) {
  const answerOptions = getAnswerOptions();
  const unanswered = Object.keys(dates).sort().find(day => !myVotes[day] || myVotes[day] === 'none');
  const legend = (
    <ul className="vote-legend" aria-label={t('vote.legend')}>
        {answerOptions.map(option => <li key={option.value}>
          <span className={'vote-legend__swatch vote-legend__swatch--' + option.value} aria-hidden="true" />
          {option.label}
        </li>)}
        <li><span className="vote-legend__swatch vote-legend__swatch--none" aria-hidden="true" />{t('vote.unanswered')}</li>
        {remaining !== undefined && <li className="voting-progress">{remaining>0?t('vote.remaining',{count:remaining}):complete?t('vote.complete'):<span role="img" aria-label={t('vote.complete')} title={t('vote.complete')}>✓</span>}</li>}
    </ul>
  );
  return (
      <DateChoices dates={dates} firstUnanswered={unanswered} legend={legend} showUnansweredJump renderCard={day => (
        <SegmentedControl label={t('vote.forDate', { date: formatDay(day) })} variant="status" allowDeselect iconOnly disabled={disabled}
          options={answerOptions} value={myVotes[day] || 'none'} onChange={value => onVote(day, value || 'none')} />
      )} renderCardMeta={day=>feedback?.day===day?<span className="vote-local-feedback">{feedback.phase==='saving'?t('action.saving'):'✓'}</span>:null} renderDay={(day, number) => {
        const value = myVotes[day] || 'none';
        return (
          <button type="button" disabled={disabled} className={'calendar-day-button calendar-day-button--vote vote-' + value}
            aria-label={[formatDay(day), formatTime(dates[day].time), value === 'none' ? t('vote.unanswered') : voteLabel(value)].filter(Boolean).join(' ')}
            onClick={() => onVote(day, nextVoteValue(value))}>
            <span>{number}</span>
            {dates[day].time && <small>{formatTime(dates[day].time)}</small>}
            <span className="calendar-day-vote" aria-hidden="true">{VOTE_ICONS[value]}</span>
            {feedback?.day===day&&<span className="calendar-vote-feedback" aria-hidden="true">{feedback.phase==='saving'?'…':'✓'}</span>}
          </button>
        );
      }} />
  );
}
