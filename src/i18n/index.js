import dutch from './nl-BE.js';

export const DEFAULT_LOCALE = 'nl-BE';
export const LOCALE_STORAGE_KEY = 'amigo-locale';
export const availableLocales = Object.freeze([
  { code: 'nl-BE', language: 'nl', shortLabel: 'NL', labelKey: 'language.dutchBelgium', messages: dutch },
]);

export function detectLocale(saved, browserLanguages = []) {
  const supported = code => availableLocales.find(item => item.code.toLowerCase() === String(code).toLowerCase())
    || availableLocales.find(item => item.language === String(code).toLowerCase().split('-')[0]);
  return supported(saved)?.code || browserLanguages.map(supported).find(Boolean)?.code || DEFAULT_LOCALE;
}
function initialLocale() {
  let saved;
  try { saved = globalThis.localStorage?.getItem(LOCALE_STORAGE_KEY); } catch { /* Storage may be blocked. */ }
  return detectLocale(saved, globalThis.navigator?.languages || []);
}
let locale = initialLocale();
const listeners = new Set();
export const getLocale = () => locale;
export function watchLocale(listener) { listeners.add(listener); return () => listeners.delete(listener); }
function applyLocale() {
  if (globalThis.document) document.documentElement.lang = locale;
}
export function setLocale(next) {
  const normalized = detectLocale(next);
  try { globalThis.localStorage?.setItem(LOCALE_STORAGE_KEY, normalized); } catch { /* Keep the in-memory preference. */ }
  if (locale === normalized) { applyLocale(); return; }
  locale = normalized;
  applyLocale();
  for (const listener of listeners) listener();
}
applyLocale();
globalThis.window?.addEventListener('storage', event => {
  if (event.key === LOCALE_STORAGE_KEY || event.key === null) setLocale(initialLocale());
});

export function t(key, params = {}, requestedLocale = locale) {
  const selected = availableLocales.find(item => item.code === requestedLocale)
    || availableLocales.find(item => item.code === DEFAULT_LOCALE);
  const catalog = selected.messages;
  let value = catalog[key] ?? dutch[key];
  if (value === undefined) throw new Error('Missing translation: ' + key);
  if (typeof value === 'object') {
    const sourceLocale = key in catalog ? selected.code : DEFAULT_LOCALE;
    value = value[new Intl.PluralRules(sourceLocale).select(params.count)] ?? value.other;
  }
  return value.replace(/\{(\w+)\}/g, (_, name) => {
    if (!(name in params)) throw new Error('Missing translation parameter: ' + key + '.' + name);
    return String(params[name]);
  });
}
export const message = (key, params = {}) => ({ key, params });
// Existing cached notices are strings; keep reading them without resetting the offline queue.
export function translateMessage(value) {
  if (!value) return '';
  return typeof value === 'string' ? value : t(value.key, Object.fromEntries(
    Object.entries(value.params || {}).map(([key, param]) => [key, param?.key ? translateMessage(param) : param]),
  ));
}

export function formatNumber(value, options = {}) { return new Intl.NumberFormat(locale, options).format(value); }
export function formatCurrency(value) { return formatNumber(value, { style: 'currency', currency: 'EUR' }); }
export function parseNumber(value) {
  const parts = new Intl.NumberFormat(locale).formatToParts(12345.6);
  const group = parts.find(part => part.type === 'group')?.value;
  const decimal = parts.find(part => part.type === 'decimal')?.value || '.';
  let input = String(value).trim().replace(/[\s\u00a0\u202f]/g, '');
  if (group) input = input.split(group).join('');
  input = input.split(decimal).join('.');
  return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(input) ? Number(input) : NaN;
}
