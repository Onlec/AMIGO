import React, { useState } from 'react';
import gun from '../gun.js';
import { generateId } from '../utils/id.js';
import MonthCalendar from './MonthCalendar.jsx';

export default function CreatePollPage() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [organizerName, setOrganizerName] = useState('');
  const [organizerEmail, setOrganizerEmail] = useState('');
  // { [dateKey]: { time: '' } } — dateKey is bv. '2026-12-05', en dient
  // meteen als id van de datum verderop in Gun.
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
    if (!organizerName.trim()) return 'Vul je naam in.';
    if (!/^\S+@\S+\.\S+$/.test(organizerEmail)) return 'Vul een geldig e-mailadres in.';
    if (Object.keys(selectedDates).length < 2) return 'Selecteer minstens 2 datums in de kalender.';
    return '';
  }

  function handleSubmit(event) {
    event.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError('');
    setSubmitting(true);

    const pollId = generateId('poll-');
    const pollNode = gun.get('polls').get(pollId);

    pollNode.put({
      title: title.trim(),
      description: description.trim(),
      organizerName: organizerName.trim(),
      organizerEmail: organizerEmail.trim().toLowerCase(),
      createdAt: Date.now(),
      status: 'open',
      finalDateId: null,
    });

    Object.entries(selectedDates).forEach(([dateKey, info]) => {
      pollNode.get('dates').get(dateKey).put({
        date: dateKey,
        time: info.time,
      });
    });

    window.location.href = `${window.location.pathname}?poll=${pollId}`;
  }

  const sortedSelectedDates = Object.entries(selectedDates).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="page">
      <h1>Nieuwe datumprikker</h1>
      <form onSubmit={handleSubmit} className="form">
        <label>
          Titel
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Teamuitje december" />
        </label>

        <label>
          Omschrijving (optioneel)
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </label>

        <fieldset>
          <legend>Jij (organisator)</legend>
          <label>
            Naam
            <input value={organizerName} onChange={(e) => setOrganizerName(e.target.value)} />
          </label>
          <label>
            E-mail
            <input type="email" value={organizerEmail} onChange={(e) => setOrganizerEmail(e.target.value)} />
          </label>
        </fieldset>

        <fieldset>
          <legend>Mogelijke datums — klik dagen aan in de kalender</legend>

          <MonthCalendar
            renderDay={(dateKey, dayNum) => (
              <button
                type="button"
                className={`calendar-day-button ${selectedDates[dateKey] ? 'is-selected' : ''}`}
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
                    value={info.time}
                    onChange={(e) => updateTime(dateKey, e.target.value)}
                  />
                  <button type="button" onClick={() => removeDate(dateKey)} aria-label="Verwijder datum">
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
