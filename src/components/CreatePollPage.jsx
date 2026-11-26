import { t, message, translateMessage } from '../i18n/index.js';
import { errorMessage } from '../i18n/errors.js';
import { formatDay } from '../utils/dates.js';
import React, { useState } from 'react';
import { enqueue } from '../data/polls.js';
import { hashPassword } from '../utils/password.js';
import { rememberVoterSession, voterSession } from '../data/voterSession.js';
import MonthCalendar from './MonthCalendar.jsx';

export default function CreatePollPage({ onCreated }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [organizerName, setOrganizerName] = useState('');
  const [participating, setParticipating] = useState(true);
  const [password, setPassword] = useState('');
  const [selectedDates, setSelectedDates] = useState({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function toggleDate(dateKey) {
    setSelectedDates((prev) => {
      if (prev[dateKey]) {
        const next = { ...prev };
        delete next[dateKey];
        return next;
      }
      return { ...prev, [dateKey]: { time: '' } };
    });
  }

  function updateTime(dateKey, time) {
    setSelectedDates((prev) => ({ ...prev, [dateKey]: { ...prev[dateKey], time } }));
  }

  function removeDate(dateKey) {
    setSelectedDates((prev) => {
      const next = { ...prev };
      delete next[dateKey];
      return next;
    });
  }

  function validate() {
    if (!title.trim()) return message('validation.titleRequired');
    if (!organizerName.trim()) return message('validation.organizerRequired');
    if (!password) return message('validation.organizerPassword');
    if (Object.keys(selectedDates).length < 2) return message('validation.twoDates');
    return '';
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError('');
    setSubmitting(true);

    try {
      const pollId = crypto.randomUUID();
      const proof = await hashPassword(pollId, password);
      const dates = Object.fromEntries(Object.entries(selectedDates).map(([date, info]) => [date, { date, ...info }]));
      const session = participating ? await voterSession(pollId, crypto.randomUUID(), password) : null;
      await enqueue(pollId, 'createPoll', {
        title: title.trim(), description: description.trim(), organizerName: organizerName.trim(), proof, dates,
        ...(session && { voter: session.voter, voterProof: session.proof }),
      });
      rememberVoterSession(pollId, { ...(session || { voter: null }), name: organizerName.trim(), organizer: true });
      const link = new URL('?poll=' + pollId, window.location.href).href;
      onCreated(pollId, link);
    } catch (err) {
      setError(message('error.localSave', { detail: errorMessage(err) }));
      setSubmitting(false);
    }
  }

  const sortedSelectedDates = Object.entries(selectedDates).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="page planner-page">
      <div className="lab eyebrow">{t('create.eyebrow')}</div>
      <h1>{t('create.heading')}</h1>
      <form onSubmit={handleSubmit} className="form">
        <fieldset>
          <legend>{t('create.settings')}</legend>
          <div className="planner-fields">
            <label className="planner-field"><span className="field-caption">{t('common.title')}</span><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('create.exampleTitle')} />
            </label>

            <label className="planner-field"><span className="field-caption">{t('create.descriptionOptional')}</span><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>{t('create.organizer')}</legend>
          <div className="planner-fields">
            <label className="planner-field"><span className="field-caption">{t('create.organizerName')}</span><input value={organizerName} onChange={e => setOrganizerName(e.target.value)} /></label>
            <label className="planner-field"><span className="field-caption">{t('common.password')}</span><input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            <label className="participation-choice">
              <input type="checkbox" checked={participating} onChange={e => setParticipating(e.target.checked)} />{t('create.participate')}</label>
          </div>
        </fieldset>

        <fieldset>
          <legend>{t('create.dates')}</legend>

          <MonthCalendar
            renderDay={(dateKey, dayNum) => (
              <button
                type="button"
                className={`calendar-day-button ${selectedDates[dateKey] ? 'is-selected' : ''}`}
                aria-pressed={Boolean(selectedDates[dateKey])}
                onClick={() => toggleDate(dateKey)}
              >
                {dayNum}
              </button>
            )}
          />

          {sortedSelectedDates.length > 0 && (
            <>
              <p className="selected-dates-label">
                {t('create.selectedDates', { count: sortedSelectedDates.length })}
              </p>
              {sortedSelectedDates.map(([dateKey, info]) => (
                <div key={dateKey} className="date-row">
                  <span>{formatDay(dateKey)}</span>
                  <input
                    type="time"
                    aria-label={t('create.timeForDate', { date: formatDay(dateKey) })}
                    value={info.time}
                    onChange={(e) => updateTime(dateKey, e.target.value)}
                  />
                  <button type="button" className="btn-danger" onClick={() => removeDate(dateKey)} aria-label={t('create.removeDate')}>
                    ✕
                  </button>
                </div>
              ))}
            </>
          )}
        </fieldset>

        {error && <p className="error">{translateMessage(error)}</p>}

        <div className="edit-actions planner-page-actions">
          <button type="submit" disabled={submitting}>
            {submitting ? t('common.creating') : t('common.create')}
          </button>
        </div>
      </form>
    </div>
  );
}
