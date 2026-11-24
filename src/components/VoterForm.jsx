import React, { useState } from 'react';
import { activateVoter } from '../data/polls.js';
import { unlockVoter } from '../data/sync.js';
import { voterSession } from '../data/voterSession.js';

export default function VoterForm({ pollId, votes, legacyVoter, onSelect }) {
  const [mode, setMode] = useState(null);
  const [name, setName] = useState('');
  const [selected, setSelected] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const returning = mode === 'existing';
  const localOnly = returning && Boolean(votes[selected]?.localOnly);
  const claim = returning && (selected === legacyVoter || localOnly);
  const blocked = returning && votes[selected]?.needsPassword && !claim;
  const participants = Object.entries(votes).sort(([, a], [, b]) => a.name.localeCompare(b.name));

  async function submit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const trimmed = name.trim();
      if (!returning && !trimmed) throw new Error('Vul je naam in.');
      if (!returning && participants.some(([, person]) => person.name.trim().toLowerCase() === trimmed.toLowerCase())) {
        throw new Error('Deze naam is al in gebruik. Kies je bestaande stem of gebruik een andere naam.');
      }
      const session = await voterSession(pollId, returning ? selected : crypto.randomUUID(), password);
      if (returning && !localOnly) await unlockVoter(pollId, session, claim);
      await activateVoter(pollId, session, localOnly ? votes[selected].name : returning ? null : trimmed);
      onSelect(session);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!mode) return (
    <div className="edit-actions">
      <button type="button" onClick={() => setMode('new')}>Nieuwe stem uitbrengen</button>
      {participants.length > 0 && (
        <button type="button" className="btn-secondary" onClick={() => {
          setSelected(legacyVoter || '');
          setMode('existing');
        }}>Eerdere stem aanpassen</button>
      )}
    </div>
  );

  return (
    <form className="form voter-form" onSubmit={submit}>
      {returning ? (
        <div>
          <label htmlFor="voter-choice">Stemmer</label>
          <select id="voter-choice" required value={selected} onChange={e => {
            setSelected(e.target.value);
            setPassword('');
            setError('');
          }}>
            <option value="">Kies je naam</option>
            {participants.map(([id, person]) => <option key={id} value={id}>{person.name}</option>)}
          </select>
        </div>
      ) : <label>Jouw naam<input required autoFocus value={name} onChange={e => setName(e.target.value)} /></label>}
      {blocked ? <p>Stel eerst een stemwachtwoord in op het toestel waarop je oorspronkelijk hebt gestemd.</p> : (
        <label>{returning && !claim ? 'Stemwachtwoord' : 'Kies een stemwachtwoord'}
          <input required type="password" autoComplete={returning && !claim ? 'current-password' : 'new-password'}
            value={password} onChange={e => setPassword(e.target.value)} />
        </label>
      )}
      {error && <p role="alert" className="error">{error}</p>}
      <div className="edit-actions">
        <button type="submit" disabled={busy || blocked || (returning && !selected)}>
          {busy ? 'Even geduld...' : 'Stemmen'}
        </button>
        <button type="button" className="btn-secondary" disabled={busy} onClick={() => {
          setMode(null);
          setPassword('');
          setError('');
        }}>Annuleren</button>
      </div>
    </form>
  );
}
