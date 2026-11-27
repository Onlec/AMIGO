import React from 'react';
import { t, translateMessage } from '../i18n/index.js';
import { errorMessage } from '../i18n/errors.js';

export default function ActionFeedback({ action, login = false }) {
  if (!action.error) return null;
  const error = action.error;
  return <div className="action-feedback">
    <p role="alert" className="error">{error.localizationKey ? t(error.localizationKey)
      : login && ['P0001','23505'].includes(error.code) && /wachtwoord|naam.*gebruik/i.test(error.message)
        ? t('login.credentialsMismatch') : translateMessage(errorMessage(error))}</p>
    {action.status === 'unknown' && <div className="edit-actions">
      <button type="button" className="btn-secondary" onClick={action.check}>{t('action.check')}</button>
      {action.retryAllowed && <button type="button" onClick={action.retry}>{t('action.retry')}</button>}
    </div>}
  </div>;
}
