import { t } from '../i18n/index.js';
import React from 'react';
import CopyButton from './CopyButton.jsx';
import { buildShareText } from '../utils/votes.js';

export default function SharePollButton({ poll, dates, votes, label = t('results.share') }) {
  return (
    <CopyButton text={buildShareText(poll, dates, votes, window.location.href)} label={label} iconOnly
      icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
        <path d="m8.6 10.5 6.8-4m-6.8 7 6.8 4" />
      </svg>} />
  );
}
