import React, { useState } from 'react';
import gun from '../gun.js';
import { generateId } from '../utils/id.js';

const createEmptyDateRow = () => ({ id: generateId('d-'), date: '', time: '' });

export default function CreatePollPage() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [organizerName, setOrganizerName] = useState('');
  const [organizerEmail, setOrganizerEmail] = useState('');
  const [dateRows, setDateRows] = useState([createEmptyDateRow(), createEmptyDateRow()]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function updateRow(id, field, value) {
    setDateRows((rows) => rows.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  }

  function addRow() {
    setDateRows((rows) => [...rows, createEmptyDateRow()]);
  }

  function removeRow(id) {
    setDateRows((rows) => rows.filter((row) => row.id !== id));
  }

  function validate() {
    if (!title.trim()) return 'Geef de prikker een titel.';
    if (!organizerName.trim()) return 'Vul je naam in.';
    if (!/^\S+@\S+\.\S+$/.test(organizerEmail)) return 'Vul een geldig e-mailadres in.';
    const filledRows = dateRows.filter((row) => row.date);
    if (filledRows.length < 2) return 'Voeg minstens 2 datums toe.';
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

    dateRows
      .filter((row) => row.date)
      .forEach((row) => {
        pollNode.get('dates').get(row.id).put({
          date: row.date,
          time: row.time,
        });
      });

    window.location.href = `${window.location.pathname}?poll=${pollId}`;
  }

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
          <legend>Mogelijke datums</legend>
          {dateRows.map((row) => (
            <div key={row.id} className="date-row">
              <input
                type="date"
                value={row.date}
                onChange={(e) => updateRow(row.id, 'date', e.target.value)}
              />
              <input
                type="time"
                value={row.time}
                onChange={(e) => updateRow(row.id, 'time', e.target.value)}
              />
              <button type="button" onClick={() => removeRow(row.id)} aria-label="Verwijder datum">
                ✕
              </button>
            </div>
          ))}
          <button type="button" onClick={addRow}>
            + Datum toevoegen
          </button>
        </fieldset>

        {error && <p className="error">{error}</p>}

        <button type="submit" disabled={submitting}>
          {submitting ? 'Bezig...' : 'Prikker aanmaken'}
        </button>
      </form>
    </div>
  );
}
