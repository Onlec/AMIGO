import { formatDay } from '../utils/dates.js';
import React, { useState } from 'react';
import MonthCalendar from './MonthCalendar.jsx';

export default function EditPollPanel({ poll, initiallyParticipating = false, onSave, onCancel }) {
  const [original] = useState(poll);
  const [originalParticipation] = useState(initiallyParticipating);
  const [title, setTitle] = useState(original.title);
  const [description, setDescription] = useState(original.description);
  const [days, setDays] = useState(() => new Set(Object.keys(original.dates)));
  const [participating, setParticipating] = useState(initiallyParticipating);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const datesLocked = poll.status === 'closed';
  const added = [...days].filter(day => !original.dates[day]);
  const removed = Object.keys(original.dates).filter(day => !days.has(day));
  const changes = { added, removed };
  if (title.trim() !== original.title) changes.title = title.trim();
  if (description.trim() !== original.description) changes.description = description.trim();
  if (participating !== originalParticipation) changes.participating = participating;
  const dirty = added.length || removed.length || 'title' in changes || 'description' in changes || 'participating' in changes;

  function toggle(day) {
    if (datesLocked) return;
    const next = new Set(days);
    if (next.has(day)) next.delete(day);
    else next.add(day);
    setDays(next);
  }

  async function submit(event) {
    event.preventDefault();
    if (!title.trim()) return setError('Geef de prikker een titel.');
    if (datesLocked && (added.length || removed.length)) return setError('Heropen de poll om datums aan te passen.');
    if (removed.includes(poll.finalDateId)) return setError('De gekozen einddatum blijft behouden.');
    setSaving(true);
    try {
      if (dirty) await onSave(changes);
      onCancel();
    } catch (err) {
      setError('Lokaal opslaan mislukt. ' + err.message);
      setSaving(false);
    }
  }

  return (
    <section className="organizer-panel">
      <h2>Prikker bewerken</h2>
      <form className="form" onSubmit={submit}>
        <label>Titel<input required value={title} onChange={e => setTitle(e.target.value)} /></label>
        <label>Omschrijving<textarea rows={3} value={description} onChange={e => setDescription(e.target.value)} /></label>
        <label className="participation-choice">
          <input type="checkbox" checked={participating} disabled={saving} onChange={e => setParticipating(e.target.checked)} />
          Zelf meestemmen
        </label>
        {originalParticipation && !participating && <p className="description">Bij opslaan worden je eigen deelname en stemmen verwijderd.</p>}
        {datesLocked && <p className="description">De datums zijn vergrendeld omdat er een einddatum gekozen is. Heropen de poll om datums aan te passen.</p>}
        <fieldset disabled={saving || datesLocked}>
          <legend>Mogelijke datums</legend>
          <MonthCalendar initialMonthFrom={Object.keys(original.dates).sort()[0]} renderDay={(day, number) => (
            <button type="button" className={`calendar-day-button ${days.has(day) ? 'is-selected' : ''}`}
              aria-label={formatDay(day)} aria-pressed={days.has(day)} disabled={day === poll.finalDateId}
              onClick={() => toggle(day)}>{number}</button>
          )} />
        </fieldset>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="edit-actions">
          <button type="submit" disabled={saving}>Opslaan</button>
          <button type="button" className="btn-secondary" disabled={saving} onClick={onCancel}>Annuleren</button>
        </div>
      </form>
    </section>
  );
}
