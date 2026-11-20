import React, { useState } from 'react';
import { copyToClipboard } from '../utils/clipboard.js';

export default function CopyButton({ text, label = 'Kopiëren' }) {
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <button type="button" className="copy-button" onClick={handleClick}>
      {copied ? 'Gekopieerd ✓' : label}
    </button>
  );
}
