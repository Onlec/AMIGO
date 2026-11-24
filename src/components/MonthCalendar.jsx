import React, { useEffect, useMemo, useState } from 'react';

const WEEKDAYS = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];
const MONTH_NAMES = [
  'Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni',
  'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December',
];

function pad(n) {
  return String(n).padStart(2, '0');
}

export function toDateKey(year, month, day) {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

function getMonthGrid(year, month) {
  // month is 0-based (0 = januari). Weken beginnen op maandag.
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = (firstOfMonth.getDay() + 6) % 7; // 0 = maandag
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < startOffset; i += 1) {
    cells.push(null);
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(day);
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }
  return cells;
}

function monthFromDateKey(dateKey) {
  const [year, month] = dateKey.split('-').map(Number);
  return { year, month: month - 1 };
}

// Generieke maandkalender. `renderDay(dateKey, dayNumber)` bepaalt wat in elke
// daguitje komt te staan (bv. een selecteerbare knop of een stem-knop).
// `initialMonthFrom` (een 'YYYY-MM-DD' string) laat de kalender één keer
// automatisch naar die maand springen zodra ze gekend is (bv. de eerst
// voorgestelde datum van een poll, die pas na het laden van de prikker binnenkomt).
export default function MonthCalendar({ renderDay, initialMonthFrom }) {
  const [view, setView] = useState(() => {
    const today = new Date();
    return { year: today.getFullYear(), month: today.getMonth() };
  });
  const [flipClass, setFlipClass] = useState('');
  const [hasAutoJumped, setHasAutoJumped] = useState(false);

  useEffect(() => {
    if (initialMonthFrom && !hasAutoJumped) {
      setView(monthFromDateKey(initialMonthFrom));
      setHasAutoJumped(true);
    }
  }, [initialMonthFrom, hasAutoJumped]);

  function changeMonth(delta) {
    setFlipClass(delta > 0 ? 'flip-next' : 'flip-prev');
    setView((prev) => {
      const date = new Date(prev.year, prev.month + delta, 1);
      return { year: date.getFullYear(), month: date.getMonth() };
    });
  }

  const now = new Date();
  const todayKey = toDateKey(now.getFullYear(), now.getMonth(), now.getDate());
  const cells = useMemo(() => getMonthGrid(view.year, view.month), [view]);

  return (
    <div className="calendar">
      <div className="calendar-header">
        <button type="button" onClick={() => changeMonth(-1)} aria-label="Vorige maand">
          ‹
        </button>
        <span className="calendar-title">
          {MONTH_NAMES[view.month]} {view.year}
        </span>
        <button type="button" onClick={() => changeMonth(1)} aria-label="Volgende maand">
          ›
        </button>
      </div>

      <div className="calendar-flip-stage">
        <div
          key={`${view.year}-${view.month}`}
          className={`calendar-page ${flipClass}`}
          onAnimationEnd={() => setFlipClass('')}
        >
          <div className="calendar-weekdays">
            {WEEKDAYS.map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="calendar-grid">
            {cells.map((day, idx) => {
              if (day === null) {
                return <div key={`empty-${idx}`} className="calendar-cell calendar-cell--empty" />;
              }
              const dateKey = toDateKey(view.year, view.month, day);
              return (
                <div key={dateKey} className="calendar-cell" aria-current={dateKey === todayKey ? 'date' : undefined}>
                  {renderDay(dateKey, day)}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
