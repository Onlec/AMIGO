import assert from 'node:assert/strict';
import test from 'node:test';
import { readdir, readFile } from 'node:fs/promises';
import { parse } from '@babel/parser';
import { availableLocales, detectLocale, getLocale, setLocale, t, message, translateMessage, formatNumber, formatCurrency, parseNumber } from '../src/i18n/index.js';
import { errorMessage } from '../src/i18n/errors.js';
import { formatDay, formatTime, getWeekdays, formatMonth } from '../src/utils/dates.js';

test('supported language detection and fallback', () => {
  assert.equal(availableLocales.length, 1);
  for (const stored of ['nl-BE', 'nl-NL', 'NL-be', 'en-US', 'invalid', null]) {
    assert.equal(detectLocale(stored, ['en-US', 'nl-NL']), 'nl-BE');
  }
  setLocale('not-supported');
  assert.equal(getLocale(), 'nl-BE');
});

test('named parameters, plural forms and missing-key diagnostics', () => {
  assert.equal(t('create.timeForDate', { date: '25/11/2026' }), 'Tijdstip voor 25/11/2026');
  assert.equal(t('count.items', { count: 1 }), '1 item');
  assert.equal(t('count.items', { count: 2 }), '2 items');
  assert.equal(t('common.name', {}, 'fr-FR'), 'Naam');
  assert.throws(() => t('missing.key'), /Missing translation/);
  assert.throws(() => t('create.timeForDate'), /parameter/);
});

test('new notices store keys and parameters while existing notices stay readable', () => {
  const notice = message('sync.rejection', { operation: message('login.signIn'), date: '', detail: errorMessage({ message: 'Wachtwoord klopt niet.' }) });
  const restored = JSON.parse(JSON.stringify(notice));
  assert.equal(translateMessage(restored), 'Aanmelden: Wachtwoord klopt niet.');
  assert.equal(translateMessage('Existing offline notice'), 'Existing offline notice');
  assert.equal(translateMessage(errorMessage({ message: 'Technical error' })), t('error.generic'));
  assert.equal(translateMessage(errorMessage({ message: 'De datum 2026-11-25 is verwijderd. Controleer je keuzes.' })), 'De datum 2026-11-25 is verwijderd. Controleer je keuzes.');
});

test('Belgian dates, 24-hour clock, numbers, currency and strict decimal parsing', () => {
  assert.equal(formatDay('2026-11-25'), new Intl.DateTimeFormat('nl-BE', { dateStyle: 'short' }).format(new Date(2026, 10, 25, 12)));
  assert.equal(formatTime('18:30'), '18:30');
  assert.equal(formatTime('00:00'), '00:00');
  assert.equal(formatTime(''), '');
  assert.equal(formatMonth(new Date(2026, 10, 1)), 'november 2026');
  assert.equal(getWeekdays()[0], new Intl.DateTimeFormat('nl-BE', { weekday: 'short' }).format(new Date(2024, 0, 1, 12)));
  assert.equal(formatNumber(1234.5, { minimumFractionDigits: 2 }), '1.234,50');
  assert.equal(formatCurrency(1234.5), new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR' }).format(1234.5));
  assert.equal(parseNumber('1.234,50'), 1234.5);
  assert.equal(parseNumber('-0,43'), -0.43);
  for (const invalid of ['', '12abc', '1,2,3']) assert.ok(Number.isNaN(parseNumber(invalid)));
});

test('all static translation references and catalog placeholders are valid', async () => {
  const catalog = availableLocales[0].messages;
  for (const [key, value] of Object.entries(catalog)) {
    const text = typeof value === 'string' ? value : Object.values(value).join(' ');
    const params = Object.fromEntries([...text.matchAll(/\{(\w+)\}/g)].map(match => [match[1], match[1] === 'count' ? 2 : 'example']));
    assert.doesNotThrow(() => t(key, params), key);
  }
  for (const dir of ['src/components', 'src/home', 'src/utils']) {
    for (const file of await readdir(dir)) {
      if (!/\.(jsx|js)$/.test(file)) continue;
      const source = await readFile(dir + '/' + file, 'utf8');
      const visit = node => {
        if (!node || typeof node !== 'object') return;
        if (node.type === 'CallExpression' && ['t', 'translate', 'message'].includes(node.callee.name)
            && node.arguments[0]?.type === 'StringLiteral') {
          const key = node.arguments[0].value;
          if (!key.endsWith('.')) assert.ok(key in catalog, file + ': ' + key);
        }
        for (const value of Object.values(node)) {
          if (Array.isArray(value)) value.forEach(visit);
          else if (value?.type) visit(value);
        }
      };
      visit(parse(source, { sourceType: 'module', plugins: ['jsx'] }));
    }
  }
});
