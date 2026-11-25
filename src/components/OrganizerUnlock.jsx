import React, { useState } from 'react';
import { hashPassword } from '../utils/password.js';
import CollapsibleSegment from './CollapsibleSegment.jsx';

export default function OrganizerUnlock({ pollId, onUnlock, active = true }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
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
        <label>
          Pollwachtwoord
          <input
            type="password" autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="edit-actions">
          <button type="submit" disabled={checking || !password}>
            {checking ? 'Controleren...' : 'Bewerken'}
          </button>
        </div>
      </CollapsibleSegment>
    </form>
  );
}
