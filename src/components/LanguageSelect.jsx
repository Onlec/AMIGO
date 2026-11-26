import React from 'react';
import { availableLocales, setLocale, t } from '../i18n/index.js';
import { useLocale } from '../i18n/react.js';

export default function LanguageSelect() {
  const locale = useLocale();
  return <select className="language-select" aria-label={t('language.label')}
    title={t(availableLocales.find(item => item.code === locale).labelKey)}
    value={locale} onChange={event => setLocale(event.target.value)}>
    {availableLocales.map(item => <option key={item.code} value={item.code} label={item.shortLabel}
      aria-label={t(item.labelKey)} title={t(item.labelKey)}>{t(item.labelKey)}</option>)}
  </select>;
}
