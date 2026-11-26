import assert from 'node:assert/strict';
import test from 'node:test';
import { setLocale, t } from '../src/i18n/index.js';
import { footerStatistics, statisticValue } from '../src/utils/statistics.js';

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
