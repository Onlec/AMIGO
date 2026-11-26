import { t, message, translateMessage } from '../i18n/index.js';
import { errorMessage } from '../i18n/errors.js';
import { formatDay, formatTime, formatProposal } from '../utils/dates.js';
import React, { useMemo, useState } from 'react';
import DateChoices from './DateChoices.jsx';
import SegmentedControl from './SegmentedControl.jsx';
import { parseVotes, VOTE_ICONS, voteLabel } from '../utils/votes.js';

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

export default function OrganizerPanel({ dates, votes, finalDateId = '', onConfirm, onCancel }) {
  const [selectedDateId, setSelectedDateId] = useState(finalDateId || '');
  const [sort, setSort] = useState('date');
  const tally = useMemo(() => computeTally(dates, votes), [dates, votes]);
  const cardOrder = Object.keys(dates).sort((a, b) =>
    (sort === 'attendance' ? tally[b].yes - tally[a].yes : 0) || a.localeCompare(b));

  const selected = dates[selectedDateId];
  const counts = tally[selectedDateId];
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleConfirm() {
    setSaving(true);
    try {
      await onConfirm(selectedDateId);
      onCancel();
    } catch (err) {
      setError(message('error.localSave', { detail: errorMessage(err) }));
      setSaving(false);
    }
  }

  return (
    <section className="organizer-panel organizer-panel--final">
      <h2>{finalDateId ? t('organizer.changeFinal') : t('organizer.chooseFinal')}</h2>
      <DateChoices dates={dates} cardOrder={cardOrder} cardToolbar={
        <div className="organizer-card-sort">
          <span>{t('organizer.sort')}</span>
          <SegmentedControl label={t('organizer.sort')} size="small" value={sort} onChange={setSort}
            options={[{ value: 'date', label: t('common.date') }, { value: 'attendance', label: t('organizer.mostYes') }]} />
        </div>
      } renderCard={day => (
          <button type="button" aria-pressed={day === selectedDateId} onClick={() => setSelectedDateId(day)}>
            {day === selectedDateId ? t('common.selected') : t('common.select')}
          </button>
      )} renderCardSummary={day => (
        <span className="date-card-tally" role="img" aria-label={t('organizer.tally', tally[day])}>
          {['yes', 'maybe', 'no'].map(value => (
            <span key={value} title={voteLabel(value)} aria-hidden="true">
              {tally[day][value]} {VOTE_ICONS[value]}
            </span>
          ))}
        </span>
      )} renderDay={(day, number) => (
        <button type="button" aria-label={formatDay(day)} aria-pressed={day === selectedDateId}
          className={'calendar-day-button ' + (day === selectedDateId ? 'is-selected' : '')}
          onClick={() => setSelectedDateId(day)}>
          {number}<small>{formatTime(dates[day].time)}</small>
        </button>
      )} />
      {error && <p className="error" role="alert">{translateMessage(error)}</p>}
      <div className="edit-actions">
        {selected && <p className="organizer-selection-summary" role="status">
          <span className="date-selection-badge">{formatProposal(selected.date, selected.time)}</span>
          <span className="organizer-selection-tally">{t('organizer.tally', counts)}</span>
        </p>}
        <button type="button" onClick={handleConfirm} disabled={!selected || selectedDateId === finalDateId || saving}>{t('common.confirm')}</button>
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={saving}>{t('common.cancel')}</button>
      </div>
    </section>
  );
}
