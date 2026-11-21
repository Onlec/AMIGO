import React, { useState } from 'react';
import { hashPassword } from '../utils/password.js';

export default function OrganizerUnlock({ pollId, expectedHash, onUnlock }) {
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

  return (
    <form onSubmit={handleSubmit} className="form unlock-form">
      <label>
        Organisator-wachtwoord
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Vul in om de prikker te bewerken"
        />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={checking || !password}>
        {checking ? 'Controleren...' : 'Ontgrendelen'}
      </button>
    </form>
  );
}
