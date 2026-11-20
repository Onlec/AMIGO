import React, { useState } from 'react';

export default function VoterForm({ onJoin }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  function handleSubmit(event) {
    event.preventDefault();
    if (!name.trim()) {
      setError('Vul je naam in.');
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError('Vul een geldig e-mailadres in.');
      return;
    }
    setError('');
    onJoin(name.trim(), email.trim().toLowerCase());
  }

  return (
    <form onSubmit={handleSubmit} className="form">
      <label>
        Naam
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </label>
      <label>
        E-mail
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit">Deelnemen</button>
    </form>
  );
}
