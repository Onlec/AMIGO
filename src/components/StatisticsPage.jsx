import React from 'react';
import { getLocale, t } from '../i18n/index.js';
import { loadStatistics, useStatistics } from '../data/statistics.js';
import { STATISTIC_TOTALS, STATISTIC_RATIOS, STATISTIC_JOKES, statisticValue } from '../utils/statistics.js';

function StatisticGroup({ title, items, data, status }) {
  return (
    <fieldset className="statistics-section">
      <legend>{title}</legend>
      <dl className="statistics-grid">
        {items.map(id => (
          <div className="statistic-card" key={id} data-statistic={id}>
            <dt>{t('statistics.' + id + '.label')}</dt>
            <dd className="statistic-card__value">{statisticValue(id, data)}</dd>
            <dd className="statistic-card__description">{t('statistics.' + id + '.description')}</dd>
          </div>
        ))}
      </dl>
      {status === 'loading' && <p className="statistics-section__loading">{t('statistics.loading')}</p>}
    </fieldset>
  );
}

export default function StatisticsPage() {
  const { data, status, fetchedAt } = useStatistics();
  return (
    <main className="planner-page statistics-page">
      <div className="eyebrow">{t('statistics.eyebrow')}</div>
      <h1>{t('statistics.title')}</h1>
      <p className="description">{t('statistics.intro')}</p>
      <div className="statistics-sections" aria-busy={status === 'loading' || status === 'idle'}>
        {status === 'error' && <div className="statistics-error" role="alert">
          <p>{t('statistics.error')}</p>
          <button type="button" className="btn-secondary" onClick={() => loadStatistics(true)}>{t('statistics.retry')}</button>
        </div>}
        <StatisticGroup title={t('statistics.totals')} items={STATISTIC_TOTALS} data={data} status={status} />
        <StatisticGroup title={t('statistics.human')} items={STATISTIC_RATIOS} data={data} />
        <StatisticGroup title={t('statistics.nonsense')} items={STATISTIC_JOKES} />
      </div>
      <p className="statistics-note">{t('statistics.jokeNote')}</p>
      <p className="statistics-note">{t('statistics.privacy')}</p>
      {data && <p className="statistics-note">{t('statistics.baseline', {
        date: new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium', timeZone: 'Europe/Amsterdam' }).format(new Date(data.startedAt)),
      })}</p>}
      {fetchedAt && <p className="statistics-note">{t('statistics.fetchedAt', {
        time: new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium', timeStyle: 'short', hour12: false }).format(fetchedAt),
      })}</p>}
    </main>
  );
}
