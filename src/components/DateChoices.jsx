import { t } from '../i18n/index.js';
import React, { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import MonthCalendar from './MonthCalendar.jsx';
import SegmentedControl from './SegmentedControl.jsx';
import { useSegmentTransition } from './CollapsibleSegment.jsx';

import { formatDay, formatTime } from '../utils/dates.js';

const viewOptions = () => [
  {
    value: 'cards', label: t('view.cards'),
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" />
    </svg>,
  },
  {
    value: 'calendar', label: t('view.calendar'),
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

export default function DateChoices({ dates, firstUnanswered, renderCard, renderCardMeta, renderDay, legend, showUnansweredJump = false, cardOrder, cardToolbar }) {
  const days = Object.keys(dates).sort();
  const cardDays = cardOrder || days;
  const view = useSyncExternalStore(watchView, readView);
  const [jump, setJump] = useState(null);
  const calendar = useRef(null);
  const transitionContent = useSegmentTransition();
  useLayoutEffect(() => {
    if (jump) calendar.current?.querySelector(`[data-day="${jump.day}"] button`)?.focus();
  }, [jump]);

  function changeView(next) {
    if (next === view) return;
    const commit = () => {
      setJump(null);
      localStorage.setItem('amigo-date-view', next);
      window.dispatchEvent(new Event('amigo-view-change'));
    };
    if (transitionContent) transitionContent(commit, '.date-view-actions [aria-checked="true"]');
    else commit();
  }

  return (
    <div className="date-choices" data-view={view}>
      <div className="date-choices__toolbar">
        {legend}
        <div className="date-view-actions">
          <SegmentedControl label={t('view.label')} options={viewOptions()} value={view} onChange={changeView} iconOnly size="small" />
        </div>
      </div>
      {view === 'cards' && cardToolbar}
      <div className="date-choices__panels">
        {view === 'calendar' ? (
          <div ref={calendar} className="date-choices__calendar">
            <MonthCalendar key={jump?.count || 0} proposedDays={days}
              initialMonthFrom={jump?.day || firstUnanswered || days[0]}
              renderDay={(day, number) => dates[day] ? renderDay(day, number) : <span className="calendar-day-plain">{number}</span>} />
            {showUnansweredJump && firstUnanswered && (
              <div className="date-view-actions date-jump-actions">
                <button type="button" className="btn-secondary" aria-label={t('view.firstUnanswered')} onClick={() =>
                  setJump({ day: firstUnanswered, count: (jump?.count || 0) + 1 })
                }>{t('view.jump')}</button>
              </div>
            )}
          </div>
        ) : (
          <div className="date-choices__cards">
            <ul className="date-cards">
              {cardDays.map(day => (
                <li key={day} data-day={day}>
                  <strong>{formatDay(day, true)}</strong>
                  {renderCard(day)}
                  {(dates[day].time || renderCardMeta) && <div className="date-card-meta">
                    {dates[day].time && <span>{formatTime(dates[day].time)}</span>}
                    {renderCardMeta?.(day)}
                  </div>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
