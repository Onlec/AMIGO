import { formatNumber, t } from '../i18n/index.js';

export const STATISTIC_TOTALS = ['planners', 'registrations', 'answers', 'finalizedPlanners'];
export const STATISTIC_RATIOS = ['doubt', 'monday', 'weekend', 'agreement'];
export const STATISTIC_PLANNING = ['singleOption','timeless','sameTime','choiceStress'];
export const STATISTIC_JOKES = ['goats', 'meetings'];
export const STATISTIC_MINIMUM = 10;
const ratioFields = {
  doubt: ['maybeAnswers', 'answers'], monday: ['mondayNoAnswers', 'mondayAnswers'],
  weekend: ['weekendDates', 'finalizedPlanners'], agreement: ['unanimousDates', 'finalizedPlanners'],
  singleOption:['singleDatePlanners','newPlanners'],timeless:['untimedPlanners','newPlanners'],
  sameTime:['uniformTimePlanners','multiDateTimedPlanners'],choiceStress:['initialDateOptions','newPlanners'],
};

export function statisticValue(id, data) {
  if (STATISTIC_JOKES.includes(id)) return '0';
  if (!data) return '—';
  if (ratioFields[id]) {
    const [numerator, denominator] = ratioFields[id];
    if ((data[denominator] || 0) < STATISTIC_MINIMUM) return t('statistics.collecting');
    return formatNumber(data[numerator] / data[denominator], id==='choiceStress'?{maximumFractionDigits:1}:{ style: 'percent', maximumFractionDigits: 0 });
  }
  return formatNumber(data[id]);
}

// Presentation metadata uses exactly the same fields and threshold as the values.
export function statisticMeasurement(id, data, status = 'ready') {
  if (STATISTIC_JOKES.includes(id)) return { state: 'notApplicable', value: '0', ratio: null };
  if (!data) return { state: status === 'error' ? 'unavailable' : 'reading', value: '—', ratio: null };
  if (!ratioFields[id]) return { state: 'measured', value: statisticValue(id, data), ratio: null };
  const [numerator, denominator] = ratioFields[id];
  const observations = data[denominator] || 0;
  const measured = observations >= STATISTIC_MINIMUM;
  return { state: measured ? 'measured' : 'collecting', value: statisticValue(id, data),
    observations, threshold: STATISTIC_MINIMUM, ratio: measured ? data[numerator] / observations : null };
}

export function footerStatistics(data) {
  return [
    ...(data ? [...STATISTIC_TOTALS, ...STATISTIC_RATIOS.filter(id => data[ratioFields[id][1]] >= STATISTIC_MINIMUM)] : []),
    ...STATISTIC_JOKES,
    ...(data ? STATISTIC_PLANNING.filter(id => (data[ratioFields[id][1]] || 0) >= STATISTIC_MINIMUM) : []),
  ];
}
