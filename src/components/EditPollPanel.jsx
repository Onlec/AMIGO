import React, { useState } from 'react';
import MonthCalendar from './MonthCalendar.jsx';

// Zodra je ontgrendeld bent, sta je automatisch in bewerkmodus — geen aparte
// "bewerken"-knop meer nodig. Titel/omschrijving zijn een klad dat je zelf
// opslaat of verwerpt; datums aanklikken past de prikker meteen aan (net
// zoals stemmen), zodat je zonder extra stap ziet wat je wijzigt.
export default function EditPollPanel({ poll, dates, onSave, onToggleDate }) {
  const [draft, setDraft] = useState(null);
  const title = draft?.title ?? poll.title;
  const description = draft?.description ?? (poll.description || '');
  const isDirty = title !== poll.title || description !== (poll.description || '');

  function handleSave(event) {
    event.preventDefault();
    const nextTitle = title.trim() || poll.title;
    setDraft(null);
    onSave({ title: nextTitle, description: description.trim() });
  }

  function handleDiscard() {
    setDraft(null);
  }

  const sortedDateKeys = Object.keys(dates).sort();

  return (
    <div className="organizer-panel edit-mode">
      <h2>🔓 Bewerkmodus — datums aanpassen</h2>

      <form onSubmit={handleSave} className="form">
        <label>
          Titel
          <input value={title} onChange={(e) => setDraft({ title: e.target.value, description })} />
        </label>
        <label>
          Omschrijving
          <textarea value={description} onChange={(e) => setDraft({ title, description: e.target.value })} rows={3} />
        </label>

        {isDirty && (
          <div className="edit-actions">
            <button type="submit">Wijzigingen opslaan</button>
            <button type="button" onClick={handleDiscard}>
              Wijzigingen verwerpen
            </button>
          </div>
        )}
      </form>

      <p className="selected-dates-label">
        Klik een dag aan om toe te voegen of te verwijderen (meteen van toepassing):
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
    </div>
  );
}
