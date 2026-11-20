import React, { useState } from 'react';
import MonthCalendar from './MonthCalendar.jsx';

export default function EditPollPanel({ poll, dates, onSave, onToggleDate }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(poll.title);
  const [description, setDescription] = useState(poll.description || '');

  function handleSave(event) {
    event.preventDefault();
    onSave({ title: title.trim(), description: description.trim() });
    setEditing(false);
  }

  if (!editing) {
    return (
      <button type="button" onClick={() => setEditing(true)}>
        Prikker bewerken
      </button>
    );
  }

  const sortedDateKeys = Object.keys(dates).sort();

  return (
    <div className="organizer-panel">
      <h2>Prikker bewerken</h2>
      <form onSubmit={handleSave} className="form">
        <label>
          Titel
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label>
          Omschrijving
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </label>

        <p className="selected-dates-label">
          Datums aanpassen — klik een dag aan om toe te voegen of te verwijderen (meteen van toepassing):
        </p>
        <MonthCalendar
          initialMonthFrom={sortedDateKeys[0]}
          renderDay={(dateKey, dayNum) => (
            <button
              type="button"
              className={`calendar-day-button ${dates[dateKey] ? 'is-selected' : ''}`}
              onClick={() => onToggleDate(dateKey)}
            >
              {dayNum}
            </button>
          )}
        />

        <div className="edit-actions">
          <button type="submit">Titel/omschrijving opslaan</button>
          <button type="button" onClick={() => setEditing(false)}>
            Sluiten
          </button>
        </div>
      </form>
    </div>
  );
}
