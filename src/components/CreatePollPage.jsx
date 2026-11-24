import React, { useState } from 'react';
import { enqueue } from '../data/polls.js';
import { hashPassword } from '../utils/password.js';
import MonthCalendar from './MonthCalendar.jsx';

export default function CreatePollPage() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
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
    if (!password) return 'Kies een wachtwoord voor jezelf als organisator.';
    if (password !== passwordConfirm) return 'De twee wachtwoorden komen niet overeen.';
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
      await enqueue(pollId, 'create', { title: title.trim(), description: description.trim(), proof, dates });
      window.location.href = window.location.pathname + '?poll=' + pollId;
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
        <span className="lab section-number">01 — Prikker instellen</span>
        <label>
          Titel
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Teamuitje december" />
        </label>

        <label>
          Omschrijving (optioneel)
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </label>

        <fieldset>
          <legend>02 — Organisator-wachtwoord</legend>
          <p className="description">
            Hiermee kan je nadien de prikker bewerken, deelnemers verwijderen en de uiteindelijke datum kiezen.
          </p>
          <label>
            Wachtwoord
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <label>
            Bevestig wachtwoord
            <input
              type="password"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
            />
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
                  <span>{dateKey}</span>
                  <input
                    type="time"
                    aria-label={`Tijdstip voor ${dateKey}`}
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
