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
    if (!title.trim()) return 'Geef de prikker een titel.';
    if (!organizerName.trim()) return 'Vul je naam als organisator in.';
    if (!password) return 'Kies een wachtwoord voor jezelf als organisator.';
    if (Object.keys(selectedDates).length < 2) return 'Selecteer minstens 2 datums in de kalender.';
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
      setError('Lokaal opslaan mislukt. ' + err.message);
      setSubmitting(false);
    }
  }

  const sortedSelectedDates = Object.entries(selectedDates).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="page">
      <div className="lab eyebrow">AMIGO / PLANNER</div>
      <h1>Nieuwe datumprikker</h1>
      <form onSubmit={handleSubmit} className="form">
        <fieldset>
          <legend>01 — Prikker instellen</legend>
          <label>
            Titel
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Teamuitje december" />
          </label>

          <label>
            Omschrijving (optioneel)
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </label>
        </fieldset>

        <fieldset>
          <legend>02 — Organisator</legend>
          <label>Naam organisator<input value={organizerName} onChange={e => setOrganizerName(e.target.value)} /></label>
          <label>
            Wachtwoord
            <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <label className="participation-choice">
            <input type="checkbox" checked={participating} onChange={e => setParticipating(e.target.checked)} />
            Zelf meestemmen
          </label>
        </fieldset>

        <fieldset>
          <legend>03 — Mogelijke datums</legend>

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
                Geselecteerd ({sortedSelectedDates.length}) — optioneel een tijdstip per datum:
              </p>
              {sortedSelectedDates.map(([dateKey, info]) => (
                <div key={dateKey} className="date-row">
                  <span>{formatDay(dateKey)}</span>
                  <input
                    type="time"
                    aria-label={`Tijdstip voor ${formatDay(dateKey)}`}
                    value={info.time}
                    onChange={(e) => updateTime(dateKey, e.target.value)}
                  />
                  <button type="button" className="btn-danger" onClick={() => removeDate(dateKey)} aria-label="Verwijder datum">
                    ✕
                  </button>
                </div>
              ))}
            </>
          )}
        </fieldset>

        {error && <p className="error">{error}</p>}

        <button type="submit" disabled={submitting}>
          {submitting ? 'Bezig...' : 'Prikker aanmaken'}
        </button>
      </form>
    </div>
  );
}
