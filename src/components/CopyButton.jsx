import React, { useEffect, useState } from 'react';
import { copyToClipboard } from '../utils/clipboard.js';

export default function CopyButton({ text, label = 'Kopiëren', initialCopy }) {
  const [attempt, setAttempt] = useState(initialCopy);
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
    <button type="button" className="copy-button" onClick={() => setAttempt(copyToClipboard(text))}>
      <span aria-live="polite">{feedback || label}</span>
    </button>
  );
}
