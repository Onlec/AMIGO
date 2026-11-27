import assert from 'node:assert/strict';
import test from 'node:test';
import { setLocale, t } from '../src/i18n/index.js';
import { footerStatistics, statisticValue, statisticMeasurement } from '../src/utils/statistics.js';

const data = { planners: 1234, registrations: 2000, answers: 100, maybeAnswers: 25,
  mondayAnswers: 10, mondayNoAnswers: 4, finalizedPlanners: 10, weekendDates: 8, unanimousDates: 3 };

test('statistics use localized counts, explicit thresholds and known denominators', () => {
  for (const locale of ['en-GB', 'nl-BE']) {
    setLocale(locale);
    assert.equal(statisticValue('planners', data), new Intl.NumberFormat(locale).format(1234));
    for (const [id, ratio] of [['doubt', .25], ['monday', .4], ['weekend', .8], ['agreement', .3]]) {
      assert.equal(statisticValue(id, data), new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(ratio));
    }
    assert.equal(statisticValue('monday', { ...data, mondayAnswers: 9 }), t('statistics.collecting'));
    assert.equal(statisticValue('doubt', { ...data, answers: 0 }), t('statistics.collecting'));
    assert.equal(statisticValue('planners', null), '—');
    assert.equal(statisticValue('goats', null), '0');
  }
});

test('footer never turns unavailable measurements into zero or insufficient samples into a fact', () => {
  assert.deepEqual(footerStatistics(null), ['goats', 'meetings']);
  assert.equal(footerStatistics(data).length, 10);
  assert.deepEqual(footerStatistics({ ...data, answers: 0, mondayAnswers: 0, finalizedPlanners: 0 }),
    ['planners', 'registrations', 'answers', 'finalizedPlanners', 'goats', 'meetings']);
});

test('instrument metadata preserves real zeros, threshold boundaries and unavailable versus unmeasured states', () => {
  assert.equal(statisticMeasurement('planners', { ...data, planners: 0 }).state, 'measured');
  assert.equal(statisticMeasurement('planners', { ...data, planners: 0 }).value, '0');
  assert.equal(statisticMeasurement('answers', null, 'loading').state, 'reading');
  assert.equal(statisticMeasurement('answers', null, 'error').state, 'unavailable');
  assert.equal(statisticMeasurement('goats', null, 'error').state, 'notApplicable');
  for (const [id, denominator, numerator] of [['doubt','answers','maybeAnswers'], ['monday','mondayAnswers','mondayNoAnswers'],
    ['weekend','finalizedPlanners','weekendDates'], ['agreement','finalizedPlanners','unanimousDates']]) {
    const collecting = statisticMeasurement(id, { ...data, [denominator]: 9 });
    assert.equal(collecting.state, 'collecting');
    assert.equal(collecting.ratio, null);
    assert.equal(collecting.observations, 9);
    assert.equal(collecting.threshold, 10);
    for (const count of [0, 5, 10]) {
      const measured = statisticMeasurement(id, { ...data, [denominator]: 10, [numerator]: count });
      assert.equal(measured.state, 'measured');
      assert.equal(measured.ratio, count / 10);
      assert.equal(measured.value, statisticValue(id, { ...data, [denominator]: 10, [numerator]: count }));
    }
  }
});

test('planning habits use the creation cohort, timed multi-date denominator and a numeric average',()=>{
  setLocale('en-GB');
  const planning={...data,newPlanners:20,singleDatePlanners:5,untimedPlanners:10,multiDateTimedPlanners:10,uniformTimePlanners:8,initialDateOptions:55};
  assert.equal(statisticValue('singleOption',planning),'25%');
  assert.equal(statisticValue('timeless',planning),'50%');
  assert.equal(statisticValue('sameTime',planning),'80%');
  assert.equal(statisticValue('choiceStress',planning),'2.8');
  assert.equal(statisticMeasurement('sameTime',{...planning,multiDateTimedPlanners:9}).state,'collecting');
  assert.equal(statisticMeasurement('singleOption',data).state,'collecting');
  assert.ok(footerStatistics(planning).includes('sameTime'));
});
