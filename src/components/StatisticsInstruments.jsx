import React, { useLayoutEffect, useRef } from 'react';
import { formatNumber, t } from '../i18n/index.js';

export function MasterCounter({ value, status }) {
  const display = useRef(null);
  const played = useRef(false);
  const available = value !== null;
  const digits = available ? String(value).padStart(6, '0').split('') : [];

  useLayoutEffect(() => {
    if (value === null || played.current) return;
    played.current = true;
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    if (media.matches || value === 0) return;
    const animations = [...display.current.querySelectorAll('.office-counter__roll')].map((node, index) =>
      node.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-20em)' }], {
        duration: Math.min(900 + index * 45, 1200), easing: 'cubic-bezier(.65, 0, .35, 1)',
      }));
    const stop = () => { if (media.matches) animations.forEach(animation => animation.cancel()); };
    media.addEventListener('change', stop);
    return () => { media.removeEventListener('change', stop); animations.forEach(animation => animation.cancel()); };
  }, [value]);

  return (
    <section className="office-master" aria-labelledby="office-master-title">
      <div className="office-instrument-label">
        <h2 id="office-master-title">{t('statistics.master')}</h2>
        <span>{t('statistics.counterNumber')}</span>
      </div>
      <div className="office-counter" ref={display}>
        <span className="office-sr-only">{t('statistics.answers.label')}: {available ? formatNumber(value) : t('statistics.state.' + (status === 'error' ? 'unavailable' : 'reading'))}</span>
        {available ? <div className="office-counter__digits" aria-hidden="true" style={{ '--counter-digits': digits.length }}>
          {digits.map((digit, index) => <span className="office-counter__window" key={index}>
            <span className="office-counter__roll">
              {Array.from({ length: 21 }, (_, step) => <span key={step}>{step === 20 ? digit : step % 10}</span>)}
            </span>
          </span>)}
        </div> : <div className="office-counter__empty" aria-hidden="true">— — — — — —</div>}
      </div>
      <div className="office-master__caption">
        <span>{t('statistics.totalAnswers')}</span>
        <span className={'office-registration office-registration--' + (available ? 'ready' : 'pending')}>
          <i aria-hidden="true" />{t(available ? 'statistics.recorded' : 'statistics.state.' + (status === 'error' ? 'unavailable' : 'reading'))}
        </span>
      </div>
    </section>
  );
}

export function MeasurementStatus({ measurement }) {
  const { state, observations, threshold } = measurement;
  if (state === 'measured' || state === 'notApplicable') return null;
  return <div className="office-measurement" data-state={state}>
    {state !== 'collecting' && <span>{t('statistics.state.' + state)}</span>}
    {state === 'collecting' && <div className="office-collection">
      <span className="office-collection__label">{t('statistics.collecting')}</span>
      <div className="office-progress" role="progressbar" aria-label={t('statistics.observationProgress')}
        aria-valuemin={0} aria-valuemax={threshold} aria-valuenow={observations}
        aria-valuetext={t('statistics.observations', { count: formatNumber(observations, { minimumIntegerDigits: 2 }), threshold })}>
        {Array.from({ length: threshold }, (_, index) => <span key={index} className={index < observations ? 'is-filled' : ''} />)}
      </div>
      <span className="office-observations">{t('statistics.observations', {
        count: formatNumber(observations, { minimumIntegerDigits: 2 }), threshold,
      })}</span>
    </div>}
  </div>;
}
