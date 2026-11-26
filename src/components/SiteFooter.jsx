import React, { useEffect, useState } from 'react';
import { t } from '../i18n/index.js';
import { useStatistics } from '../data/statistics.js';
import { STATISTIC_JOKES, footerStatistics, statisticValue } from '../utils/statistics.js';

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setReduced(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  return reduced;
}

export default function SiteFooter() {
  const { data, status } = useStatistics();
  const items = footerStatistics(data);
  const [offset, setOffset] = useState(() => Math.floor(Math.random() * 1000000));
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(() => !document.hidden);
  const reduced = useReducedMotion();
  const stopped = paused || hovered || focused || !visible || reduced;
  const id = items[offset % items.length];
  const joke = STATISTIC_JOKES.includes(id);

  useEffect(() => {
    const change = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', change);
    return () => document.removeEventListener('visibilitychange', change);
  }, []);
  useEffect(() => {
    if (stopped || status === 'loading' || status === 'idle') return;
    const timer = setInterval(() => setOffset(value => value + 1), 7000);
    return () => clearInterval(timer);
  }, [stopped, status]);

  return (
    <footer className="site-footer">
      <div className="site-footer__inner" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
        onFocusCapture={() => setFocused(true)}
        onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
        <div className="footer-statistic" aria-live="off">
          {status === 'loading' || status === 'idle' ? <span className="footer-statistic__loading">{t('statistics.loading')}</span> : (
            <div className="footer-statistic__slide" key={id} data-statistic={id}>
              <span className="footer-statistic__kind lab">{t(joke ? 'statistics.justForFun' : 'statistics.realFigure')}</span>
              <span className="footer-statistic__text">{t('statistics.' + id + '.label')}: <strong>{statisticValue(id, data)}</strong></span>
            </div>
          )}
        </div>
        <div className="site-footer__actions">
          {!reduced && <button type="button" className="footer-statistic__pause" aria-pressed={paused}
            aria-label={t(paused ? 'statistics.resume' : 'statistics.pause')} title={t(paused ? 'statistics.resume' : 'statistics.pause')}
            onClick={() => setPaused(value => !value)}><span aria-hidden="true">{paused ? '▶' : 'Ⅱ'}</span></button>}
          <a href="?page=statistics">{t('statistics.footerLink')} <span aria-hidden="true">↗</span></a>
        </div>
      </div>
    </footer>
  );
}
