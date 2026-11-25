import React, { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import MonthCalendar from './MonthCalendar.jsx';
import SegmentedControl from './SegmentedControl.jsx';

import { formatProposal } from '../utils/dates.js';

const viewOptions = [
  {
    value: 'cards', label: 'Kaarten',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" />
    </svg>,
  },
  {
    value: 'calendar', label: 'Kalender',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="5" width="18" height="16" rx="1" /><path d="M3 11h18M8 3v5M16 3v5" />
    </svg>,
  },
];

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

export default function DateChoices({ dates, firstUnanswered, renderCard, renderDay, legend }) {
  const days = Object.keys(dates).sort();
  const view = useSyncExternalStore(watchView, readView);
  const [jump, setJump] = useState(null);
  const root = useRef(null);
  useLayoutEffect(() => {
    if (jump) root.current?.querySelector(`[data-day="${jump.day}"] button`)?.focus();
  }, [jump]);

  function changeView(next) {
    setJump(null);
    const scroller = root.current?.closest('.voter-ballot')
      || root.current?.closest('.collapsible-segment--scrollable')?.querySelector('.collapsible-segment__body');
    if (scroller) scroller.scrollTop = 0;
    localStorage.setItem('amigo-date-view', next);
    window.dispatchEvent(new Event('amigo-view-change'));
  }

  return (
    <div ref={root}>
      <div className="date-choices__toolbar">
        {legend}
        <div className="date-view-actions">
          <SegmentedControl label="Weergave" options={viewOptions} value={view} onChange={changeView} iconOnly size="small" />
        </div>
      </div>
      {view === 'cards' ? (
        <ul className="date-cards">
          {days.map(day => (
            <li key={day} data-day={day}>
              <strong>{formatProposal(day, dates[day].time, true)}</strong>
              {renderCard(day)}
            </li>
          ))}
        </ul>
      ) : (
        <MonthCalendar key={jump?.count || 0} proposedDays={days} initialMonthFrom={jump?.day || firstUnanswered || days[0]}
          renderDay={(day, number) => dates[day] ? renderDay(day, number) : <span className="calendar-day-plain">{number}</span>} />
      )}
      {view === 'calendar' && firstUnanswered && (
        <div className="date-view-actions date-jump-actions">
          <button type="button" className="btn-secondary" aria-label="Ga naar de eerste onbeantwoorde datum" onClick={() =>
            setJump({ day: firstUnanswered, count: (jump?.count || 0) + 1 })
          }>Nog invullen</button>
        </div>
      )}
    </div>
  );
}
