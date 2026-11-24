import React, { useMemo, useState } from 'react';

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
  while (cells.length < 42) {
    cells.push(null);
  }
  return cells;
}

export default function MonthCalendar({ renderDay, initialMonthFrom, proposedDays }) {
  const now = new Date();
  const todayKey = toDateKey(now.getFullYear(), now.getMonth(), now.getDate());
  const first = proposedDays?.[0]?.slice(0, 7);
  const last = proposedDays?.at(-1)?.slice(0, 7);
  const [requested, setRequested] = useState(() => (initialMonthFrom || first || todayKey).slice(0, 7));
  const monthKey = first && requested < first ? first : last && requested > last ? last : requested;
  const [year, monthNumber] = monthKey.split('-').map(Number);
  const month = monthNumber - 1;

  function changeMonth(delta) {
    const date = new Date(year, month + delta, 1);
    setRequested(toDateKey(date.getFullYear(), date.getMonth(), 1).slice(0, 7));
  }

  const cells = useMemo(() => getMonthGrid(year, month), [year, month]);
  const arrows = !first || first !== last;

  return (
    <div className="calendar">
      <div className="calendar-header">
        {arrows && <button type="button" disabled={monthKey === first} onClick={() => changeMonth(-1)} aria-label="Vorige maand">
          ‹
        </button>}
        <span className="calendar-title">
          {MONTH_NAMES[month]} {year}
        </span>
        {arrows && <button type="button" disabled={monthKey === last} onClick={() => changeMonth(1)} aria-label="Volgende maand">
          ›
        </button>}
      </div>

      {proposedDays && <p className="month-status" role="status">
        {proposedDays.some(day => day.startsWith(monthKey)) ? '' : 'Deze maand zijn er geen voorgestelde datums.'}
      </p>}
      <div className="calendar-page">
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
            const dateKey = toDateKey(year, month, day);
            return (
              <div key={dateKey} data-day={dateKey} className="calendar-cell" aria-current={dateKey === todayKey ? 'date' : undefined}>
                {renderDay(dateKey, day)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
