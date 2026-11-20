import React, { useState } from 'react';
import { hashPassword } from '../utils/password.js';

export default function OrganizerUnlock({ pollId, expectedHash, onUnlock }) {
  const [expanded, setExpanded] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setChecking(true);
    setError('');
    const hash = await hashPassword(pollId, password);
    setChecking(false);

    if (hash === expectedHash) {
      onUnlock();
    } else {
      setError('Wachtwoord klopt niet.');
    }
  }

  if (!expanded) {
    return (
      <button type="button" onClick={() => setExpanded(true)}>
        Ben je de organisator?
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="form unlock-form">
      <label>
        Wachtwoord van de organisator
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
        />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={checking}>
        {checking ? 'Controleren...' : 'Ontgrendelen'}
      </button>
    </form>
  );
}
