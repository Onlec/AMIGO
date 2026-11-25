import React, { useEffect, useState } from 'react';
import { copyToClipboard } from '../utils/clipboard.js';

export default function CopyButton({ text, label = 'Kopiëren', icon, iconOnly = false }) {
  const [attempt, setAttempt] = useState(null);
  const [feedback, setFeedback] = useState('');
  useEffect(() => {
    if (!attempt) return;
    let live = true;
    let timer;
    attempt.then(ok => {
      if (!live) return;
      setFeedback(ok ? 'Gekopieerd ✓' : 'Kopiëren mislukt');
      timer = setTimeout(() => setFeedback(''), 2500);
    });
    return () => { live = false; clearTimeout(timer); };
  }, [attempt]);
  return (
    <button type="button" className={'copy-button' + (iconOnly ? ' copy-button--icon' : '')}
      aria-label={iconOnly ? feedback || label : undefined} title={iconOnly ? feedback || label : undefined}
      onClick={() => setAttempt(copyToClipboard(text))}>
      {iconOnly && <span aria-hidden="true">
        {feedback === 'Gekopieerd ✓' ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m5 12 4 4L19 6" /></svg>
        ) : icon}
      </span>}
      <span aria-live="polite">{feedback || label}</span>
    </button>
  );
}
