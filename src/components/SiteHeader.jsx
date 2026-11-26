import { t } from '../i18n/index.js';
import React from 'react';
import ThemeToggle from './ThemeToggle.jsx';
import LanguageSelect from './LanguageSelect.jsx';
import { PLANNER_ONLY } from '../config.js';

// Enkel gebruikt op de planner-/stempagina's: de homepage (HomePage.jsx)
// heeft haar eigen koptekst, in dezelfde stijl.
export default function SiteHeader() {
  return (
    <header className="top planner-header">
      <div className="wrap">
        <a className="logo" href="?">
          AMIGO
        </a>
        <nav aria-label={t('nav.main')}>
          {!PLANNER_ONLY && <a href="?">{t('nav.index')}</a>}
          <a href="?page=planner">{t('nav.newPoll')}</a>
          <LanguageSelect />
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
