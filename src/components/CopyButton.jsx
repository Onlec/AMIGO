import React, { useEffect, useState } from 'react';
import { copyToClipboard } from '../utils/clipboard.js';

export default function CopyButton({ text, label = 'Kopiëren' }) {
  const [attempt, setAttempt] = useState(null);
  const [feedback, setFeedback] = useState('');
  useEffect(() => {
    if (!attempt) return;
    let live = true;
    attempt.then(ok => {
      if (!live) return;
      setFeedback(ok ? 'Gekopieerd ✓' : 'Kopiëren mislukt');
    });
    return () => { live = false; };
  }, [attempt]);
  return (
    <button type="button" className="copy-button" onClick={() => setAttempt(copyToClipboard(text))}>
      <span aria-live="polite">{feedback || label}</span>
    </button>
  );
}
