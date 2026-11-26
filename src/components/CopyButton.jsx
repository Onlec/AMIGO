import { t } from '../i18n/index.js';
import React, { useEffect, useState } from 'react';
import { copyToClipboard } from '../utils/clipboard.js';

export default function CopyButton({ text, label = t('common.copy'), icon, iconOnly = false, secondary = false }) {
  const [attempt, setAttempt] = useState(null);
  const [feedback, setFeedback] = useState('');
  useEffect(() => {
    if (!attempt) return;
    let live = true;
    let timer;
    attempt.then(ok => {
      if (!live) return;
      setFeedback(ok ? 'common.copied' : 'common.copyFailed');
      timer = setTimeout(() => setFeedback(''), 2500);
    });
    return () => { live = false; clearTimeout(timer); };
  }, [attempt]);
  const feedbackText = feedback ? t(feedback) : '';
  return (
    <button type="button" className={'copy-button' + (iconOnly ? ' copy-button--icon' : '') + (secondary ? ' btn-secondary' : '')}
      aria-label={iconOnly ? feedbackText || label : undefined} title={iconOnly ? feedbackText || label : undefined}
      onClick={() => setAttempt(copyToClipboard(text))}>
      {iconOnly && <span aria-hidden="true">
        {feedback === 'common.copied' ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m5 12 4 4L19 6" /></svg>
        ) : icon}
      </span>}
      <span aria-live="polite">{feedbackText || label}</span>
    </button>
  );
}
