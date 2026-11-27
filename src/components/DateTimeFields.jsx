import React, { useState } from 'react';
import { t } from '../i18n/index.js';
import { formatDay } from '../utils/dates.js';

export default function DateTimeFields({ dates, onChange, enabled, onEnabled, defaultTime, onDefaultTime, disabled = false }) {
  const [bulk, setBulk] = useState(defaultTime || '');
  function apply() {
    onDefaultTime(bulk);
    onChange(Object.fromEntries(Object.entries(dates).map(([day, info]) => [day, { ...info, time: bulk }])));
  }
  return <div className="date-time-fields">
    <label className="participation-choice"><input type="checkbox" checked={enabled} disabled={disabled} onChange={e => onEnabled(e.target.checked)} />{t('times.enable')}</label>
    {enabled && <div className="time-bulk-row">
      <label>{t('times.shared')}<input type="time" value={bulk} disabled={disabled} onChange={e => setBulk(e.target.value)} /></label>
      <div className="edit-actions"><button type="button" className="btn-secondary" disabled={disabled || !bulk || !Object.keys(dates).length} onClick={apply}>{t('times.apply')}</button></div>
    </div>}
    {Object.keys(dates).sort().map(day => <div className={'date-row' + (!enabled ? ' date-row--untimed' : '')} key={day}>
      <span>{formatDay(day)}</span>
      {enabled && <input id={'time-' + day} type="time" value={dates[day].time || ''} disabled={disabled} aria-label={t('create.timeForDate', { date: formatDay(day) })}
        onChange={e => onChange({ ...dates, [day]: { ...dates[day], time: e.target.value } })} />}
      <button type="button" className="btn-danger" disabled={disabled} aria-label={t('create.removeDate')}
        onClick={() => { const next = { ...dates }; delete next[day]; onChange(next); }}>×</button>
    </div>)}
  </div>;
}
