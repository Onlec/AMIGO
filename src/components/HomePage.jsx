import { t } from '../i18n/index.js';
import React, { useEffect, useRef } from 'react';
import ThemeToggle from './ThemeToggle.jsx';
import LanguageSelect from './LanguageSelect.jsx';
import { initializeHome } from '../home/initialize.js';

// The animated tool index keeps its existing DOM-based renderer.
export default function HomePage() {
  const containerRef = useRef(null);

  useEffect(() => initializeHome(containerRef.current), []);

  return (
    <div ref={containerRef}>
      <header className="top">
        <div className="wrap">
          <a className="logo" href="#home">
            AMIGO
          </a>
          <nav aria-label={t('nav.main')}>
            <a href="#home">{t('nav.index')}</a>
            <a href="#alle-tools">{t('nav.allTools')}</a>
            <LanguageSelect />
            <ThemeToggle />
          </nav>
        </div>
      </header>

      <div id="home">
        <main className="wrap">
          <section className="hero" aria-label={t('home.start')}>
            <div className="intro">
              <div className="lab" style={{ color: 'var(--muted)', marginBottom: '14px' }}>{t('home.eyebrow')}</div>
              <h1>{t('home.tagline')}</h1>
              <p>{t('home.intro')}</p>
            </div>
            <div className="frame">
              <div className="bar">
                <span className="lab">{t('nav.index')}</span>
                <span className="lab" id="rn">
                  00 / 00
                </span>
              </div>
              <svg
                id="sv"
                viewBox="0 50 360 220"
                tabIndex={0}
                role="listbox"
                aria-label={t('home.indexHelp')}
              />
              <div className="ctl">
                <button type="button" id="pv">{t('home.previous')}</button>
                <button type="button" id="nx">{t('home.next')}</button>
              </div>
            </div>
            <div className="now">
              <span className="lab" style={{ color: 'var(--muted)' }}>{t('home.selected')}</span>
              <div className="row">
                <b id="rb">07</b>
                <h2 id="rt" />
              </div>
              <p id="rd" />
              <button className="go" type="button" id="open">{t('home.openTool')}</button>
            </div>
          </section>
          <section className="all" id="alle-tools">
            <h2>{t('nav.allTools')}</h2>
            <nav className="grid" id="grid" aria-label={t('nav.allTools')} />
          </section>
        </main>
      </div>
      <div id="tool" hidden />
      <p id="live" aria-live="polite" style={{ position: 'absolute', left: '-9999px' }} />
    </div>
  );
}
