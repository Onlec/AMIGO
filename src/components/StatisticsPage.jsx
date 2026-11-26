import React from 'react';
import { getLocale, t } from '../i18n/index.js';
import { loadStatistics, useStatistics } from '../data/statistics.js';
import { STATISTIC_TOTALS, STATISTIC_RATIOS, statisticMeasurement } from '../utils/statistics.js';
import { MasterCounter, MeasurementStatus } from './StatisticsInstruments.jsx';
import StatisticIcon from './StatisticIcon.jsx';

function StatisticGroup({ title, number, items, data, status }) {
  return (
    <fieldset className="statistics-section">
      <legend>{number} — {title}</legend>
      <dl className="statistics-grid">
        {items.map(id => {
          const measurement = statisticMeasurement(id, data, status);
          const collecting = measurement.state === 'collecting';
          const showStatus = !['measured', 'notApplicable'].includes(measurement.state);
          return <div className="statistic-card" key={id} data-statistic={id} data-state={measurement.state}>
            <dt><StatisticIcon id={id} />{t('statistics.' + id + '.label')}</dt>
            <dd className={'statistic-card__value' + (collecting ? ' statistic-card__value--collecting' : '')}>
              {collecting ? <span aria-hidden="true">—</span> : measurement.value}
            </dd>
            {showStatus && <dd className="office-card-instrument"><MeasurementStatus measurement={measurement} /></dd>}
            <dd className="statistic-card__description">{t('statistics.' + id + '.description')}</dd>
          </div>;
        })}
      </dl>
    </fieldset>
  );
}

export default function StatisticsPage() {
  const { data, status, fetchedAt } = useStatistics();
  return (
    <main className="planner-page statistics-page counting-office">
      <div className="lab eyebrow">{t('statistics.eyebrow')}</div>
      <h1>{t('statistics.title')}</h1>
      <p className="description">{t('statistics.intro')}</p>
      {status === 'error' && <div className="statistics-error" role="alert">
        <p>{t('statistics.error')}</p>
        <div className="edit-actions">
          <button type="button" className="btn-secondary" onClick={() => loadStatistics(true)}>{t('statistics.retry')}</button>
        </div>
      </div>}
      <MasterCounter value={data?.answers ?? null} status={status} />
      <div className="form statistics-sections" aria-busy={status === 'loading' || status === 'idle'}>
        <StatisticGroup title={t('statistics.totals')} number="01" items={STATISTIC_TOTALS} data={data} status={status} />
        <StatisticGroup title={t('statistics.human')} number="02" items={STATISTIC_RATIOS} data={data} status={status} />
        <fieldset className="office-nameplate">
          <legend>03 — {t('statistics.nameplate')}</legend>
          <dl>
            <div><dt>{t('statistics.notePrivacy')}</dt><dd>{t('statistics.privacy')}</dd></div>
            <div><dt>{t('statistics.noteBaseline')}</dt><dd>{data ? t('statistics.baseline', {
              date: new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium', timeZone: 'Europe/Amsterdam' }).format(new Date(data.startedAt)),
            }) : '—'}</dd></div>
            <div><dt>{t('statistics.noteFetched')}</dt><dd>{fetchedAt ? t('statistics.fetchedAt', {
              time: new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium', timeStyle: 'short', hour12: false }).format(fetchedAt),
            }) : '—'}</dd></div>
          </dl>
        </fieldset>
      </div>
    </main>
  );
}
