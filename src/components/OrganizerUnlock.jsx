import React, { useState } from 'react';
import { hashPassword } from '../utils/password.js';
import CollapsibleSegment from './CollapsibleSegment.jsx';

export default function OrganizerUnlock({ pollId, onUnlock, onEdit, authorized = false, active = true }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (authorized) {
      onEdit();
      return;
    }
    setChecking(true);
    setError('');
    try {
      await onUnlock(await hashPassword(pollId, password));
      setPassword('');
    } catch (err) {
      setError(err.message);
    } finally {
      setChecking(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="form unlock-form">
      <CollapsibleSegment title="03 — Prikker beheren" open={active} disabled={checking}>
        <div className="access-row">
          <div className="access-fields">
            {authorized ? <p>Je bent aangemeld als organisator.</p> : (
              <label>
                Pollwachtwoord
                <input
                  type="password" autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
            )}
          </div>
          <div className="edit-actions access-actions">
            <button type={authorized ? 'button' : 'submit'} onClick={authorized ? onEdit : undefined}
              disabled={checking || (!authorized && !password)}>
              {checking ? 'Controleren...' : 'Bewerken'}
            </button>
          </div>
        </div>
        {!authorized && error && <p className="error" role="alert">{error}</p>}
      </CollapsibleSegment>
    </form>
  );
}
