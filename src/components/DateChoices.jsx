import React, { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import MonthCalendar from './MonthCalendar.jsx';

const dateLabel = new Intl.DateTimeFormat('nl-NL', { dateStyle: 'full' });

function watchView(notify) {
  window.addEventListener('storage', notify);
  window.addEventListener('amigo-view-change', notify);
  return () => {
    window.removeEventListener('storage', notify);
    window.removeEventListener('amigo-view-change', notify);
  };
}

function readView() {
  return localStorage.getItem('amigo-date-view') === 'calendar' ? 'calendar' : 'cards';
}

export default function DateChoices({ dates, firstUnanswered, renderCard, renderDay }) {
  const days = Object.keys(dates).sort();
  const view = useSyncExternalStore(watchView, readView);
  const [jump, setJump] = useState(null);
  const root = useRef(null);
  useLayoutEffect(() => {
    if (jump) root.current?.querySelector(`[data-day="${jump.day}"] button`)?.focus();
  }, [jump]);

  function changeView(next) {
    setJump(null);
    localStorage.setItem('amigo-date-view', next);
    window.dispatchEvent(new Event('amigo-view-change'));
  }

  return (
    <div ref={root}>
      <div className="date-view-actions">
        <div className="date-view-toggle" role="group" aria-label="Weergave">
          <button type="button" aria-pressed={view === 'cards'} onClick={() => changeView('cards')}>Kaarten</button>
          <button type="button" aria-pressed={view === 'calendar'} onClick={() => changeView('calendar')}>Agenda</button>
        </div>
        {firstUnanswered && <button type="button" className="btn-secondary" onClick={() =>
          setJump({ day: firstUnanswered, count: (jump?.count || 0) + 1 })
        }>Naar eerste onbeantwoorde datum</button>}
      </div>
      {view === 'cards' ? (
        <ul className="date-cards">
          {days.map(day => (
            <li key={day} data-day={day}>
              <strong>{dateLabel.format(new Date(day + 'T12:00:00'))}{dates[day].time && ' · ' + dates[day].time}</strong>
              {renderCard(day)}
            </li>
          ))}
        </ul>
      ) : (
        <MonthCalendar key={jump?.count || 0} proposedDays={days} initialMonthFrom={jump?.day || firstUnanswered || days[0]}
          renderDay={(day, number) => dates[day] ? renderDay(day, number) : <span className="calendar-day-plain">{number}</span>} />
      )}
    </div>
  );
}
