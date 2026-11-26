import { formatNumber, t } from '../i18n/index.js';

export const STATISTIC_TOTALS = ['planners', 'registrations', 'answers', 'finalizedPlanners'];
export const STATISTIC_RATIOS = ['doubt', 'monday', 'weekend', 'agreement'];
export const STATISTIC_JOKES = ['goats', 'meetings'];
const ratioFields = {
  doubt: ['maybeAnswers', 'answers'], monday: ['mondayNoAnswers', 'mondayAnswers'],
  weekend: ['weekendDates', 'finalizedPlanners'], agreement: ['unanimousDates', 'finalizedPlanners'],
};

export function statisticValue(id, data) {
  if (STATISTIC_JOKES.includes(id)) return '0';
  if (!data) return '—';
  if (ratioFields[id]) {
    const [numerator, denominator] = ratioFields[id];
    if (data[denominator] < 10) return t('statistics.collecting');
    return formatNumber(data[numerator] / data[denominator], { style: 'percent', maximumFractionDigits: 0 });
  }
  return formatNumber(data[id]);
}

export function footerStatistics(data) {
  return [
    ...(data ? [...STATISTIC_TOTALS, ...STATISTIC_RATIOS.filter(id => data[ratioFields[id][1]] >= 10)] : []),
    ...STATISTIC_JOKES,
  ];
}
