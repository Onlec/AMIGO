import { t, message, translateMessage } from '../i18n/index.js';
import { errorMessage } from '../i18n/errors.js';
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
    if (!title.trim()) return setError(message('validation.titleRequired'));
    if (datesLocked && (added.length || removed.length)) return setError(message('organizer.reopenForDates'));
    if (removed.includes(poll.finalDateId)) return setError(message('organizer.keepFinalDate'));
    setSaving(true);
    try {
      if (dirty) await onSave(changes);
      onCancel();
    } catch (err) {
      setError(message('error.localSave', { detail: errorMessage(err) }));
      setSaving(false);
    }
  }

  return (
    <section className="organizer-panel">
      <h2>{t('organizer.edit')}</h2>
      <form className="form" onSubmit={submit}>
        <label>{t('common.title')}<input required value={title} onChange={e => setTitle(e.target.value)} /></label>
        <label>{t('common.description')}<textarea rows={3} value={description} onChange={e => setDescription(e.target.value)} /></label>
        <label className="participation-choice">
          <input type="checkbox" checked={participating} disabled={saving} onChange={e => setParticipating(e.target.checked)} />{t('create.participate')}</label>
        {originalParticipation && !participating && <p className="description">{t('organizer.removeOwnVotes')}</p>}
        {datesLocked && <p className="description">{t('organizer.datesLocked')}</p>}
        <div role="group" aria-label={t('organizer.possibleDates')}>
          <MonthCalendar disabled={saving || datesLocked} initialMonthFrom={Object.keys(original.dates).sort()[0]} renderDay={(day, number) => (
            <button type="button" className={`calendar-day-button ${days.has(day) ? 'is-selected' : ''}`}
              aria-label={formatDay(day)} aria-pressed={days.has(day)} disabled={saving || datesLocked || day === poll.finalDateId}
              onClick={() => toggle(day)}>{number}</button>
          )} />
        </div>
        {error && <p className="error" role="alert">{translateMessage(error)}</p>}
        <div className="edit-actions">
          <button type="submit" disabled={saving}>{t('common.save')}</button>
          <button type="button" className="btn-secondary" disabled={saving} onClick={onCancel}>{t('common.cancel')}</button>
        </div>
      </form>
    </section>
  );
}
