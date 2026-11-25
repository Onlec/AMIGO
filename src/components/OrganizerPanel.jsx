import { formatDay, formatTime, formatProposal } from '../utils/dates.js';
import React, { useMemo, useState } from 'react';
import DateChoices from './DateChoices.jsx';
import SegmentedControl from './SegmentedControl.jsx';
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
      setError('Lokaal opslaan mislukt. ' + err.message);
      setSaving(false);
    }
  }

  return (
    <section className="organizer-panel organizer-panel--final">
      <h2>{finalDateId ? 'Einddatum wijzigen' : 'Einddatum kiezen'}</h2>
      <DateChoices dates={dates} cardOrder={cardOrder} cardToolbar={
        <div className="organizer-card-sort">
          <span>Sorteer kaarten</span>
          <SegmentedControl label="Sorteer kaarten" size="small" value={sort} onChange={setSort}
            options={[{ value: 'date', label: 'Datum' }, { value: 'attendance', label: 'Meeste ja' }]} />
        </div>
      } renderCard={day => (
        <>
          <p>{tally[day].yes} ja, {tally[day].maybe} misschien, {tally[day].no} nee</p>
          <button type="button" aria-pressed={day === selectedDateId} onClick={() => setSelectedDateId(day)}>
            {day === selectedDateId ? 'Geselecteerd' : 'Kies deze datum'}
          </button>
        </>
      )} renderDay={(day, number) => (
        <button type="button" aria-label={formatDay(day)} aria-pressed={day === selectedDateId}
          className={'calendar-day-button ' + (day === selectedDateId ? 'is-selected' : '')}
          onClick={() => setSelectedDateId(day)}>
          {number}<small>{formatTime(dates[day].time)}</small>
        </button>
      )} />
      {selected && <p role="status">{formatProposal(selected.date, selected.time)} — {counts.yes} ja, {counts.maybe} misschien, {counts.no} nee</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="edit-actions">
        <button type="button" onClick={handleConfirm} disabled={!selected || selectedDateId === finalDateId || saving}>Bevestig deze datum</button>
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={saving}>Annuleren</button>
      </div>
    </section>
  );
}
