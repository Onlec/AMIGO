import React, { useEffect, useState } from 'react';
import { enqueue } from '../data/polls.js';
import { voterSession } from '../data/voterSession.js';
import { parseVotes } from '../utils/votes.js';
import VoteCalendar from './VoteCalendar.jsx';

const normalize = name => name.trim().toLowerCase();

export default function VoterForm({ pollId, dates, participants, legacyVoter, deferred, results, session, onSelect }) {
  const storageKey = 'amigo-ballot:' + pollId;
  const [submission, setSubmission] = useState(() => JSON.parse(sessionStorage.getItem(storageKey) || 'null'));
  const [name, setName] = useState(() => submission?.name || participants[session?.voter]?.name || '');
  const [password, setPassword] = useState('');
  const [picked, setPicked] = useState(submission?.session.voter || session?.voter || '');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(0);
  const [error, setError] = useState('');

  const matches = Object.entries(participants).filter(([, person]) => normalize(person.name) === normalize(name));
  const id = matches.length === 1 ? matches[0][0] : matches.find(([key]) => key === picked)?.[0];
  const person = participants[id];
  const activePerson = participants[session?.voter];
  const signedIn = Boolean(session && activePerson && !activePerson.needsPassword && !activePerson.localOnly);
  const outcome = submission && results?.[submission.operation];
  const pending = Boolean(submission && !outcome);
  const locked = busy || pending;

  useEffect(() => {
    if (!submission || !outcome || outcome.rejection) return;
    onSelect(submission.session);
    setName(submission.name);
    setPicked(submission.session.voter);
    setPassword('');
    sessionStorage.removeItem(storageKey);
    setSubmission(null);
  }, [outcome, submission, onSelect, storageKey]);

  function clearSubmission() {
    sessionStorage.removeItem(storageKey);
    setSubmission(null);
  }

  function reset() {
    onSelect(null);
    setName('');
    setPicked('');
    setPassword('');
    clearSubmission();
    setError('');
  }

  async function signIn(event) {
    event.preventDefault();
    if (locked) return;
    setError('');
    if (!navigator.onLine) return setError('Ga online om je aan te melden.');
    if (!name.trim()) return setError('Vul je naam in.');
    if (matches.length > 1 && !id) return setError('Kies welke deelnemer je bent.');
    if (person?.needsPassword && legacyVoter !== id) return setError('Stel je wachtwoord eerst in op het oorspronkelijke toestel.');
    if (!password) return setError('Vul je stemwachtwoord in.');
    setBusy(true);
    try {
      const credentials = await voterSession(pollId, id || crypto.randomUUID(), password);
      const oldVotes = deferred.filter(item => item.body.voter === id);
      const changes = Object.fromEntries(oldVotes
        .filter(({ body }) => dates[body.day])
        .map(({ body }) => [body.day, body.value]));
      const operation = await enqueue(pollId, 'ballot', {
        ...credentials, name: name.trim(), register: !person || Boolean(person.localOnly),
        claim: Boolean(id && id === legacyVoter), changes,
        legacyOperations: oldVotes.map(item => item.operation),
      });
      const receipt = { operation, session: credentials, name: name.trim() };
      sessionStorage.setItem(storageKey, JSON.stringify(receipt));
      setSubmission(receipt);
    } catch (err) {
      setError('Aanmelden mislukt. ' + err.message);
    } finally {
      setBusy(false);
    }
  }

  async function castVote(day, value) {
    if (!signedIn) return;
    setError('');
    setSaving(count => count + 1);
    try {
      await enqueue(pollId, 'ballot', {
        ...session, name: activePerson.name, register: false, claim: false,
        changes: { [day]: value },
      });
    } catch (err) {
      setError('Stem bewaren mislukt. Probeer opnieuw. ' + err.message);
    } finally {
      setSaving(count => count - 1);
    }
  }

  return (
    <div className="form">
      <form onSubmit={signIn}>
        <fieldset disabled={busy}>
          <legend>01 — Jouw gegevens</legend>
          {signedIn ? (
            <p>Je stemt als <strong>{activePerson.name}</strong>.</p>
          ) : (
            <>
              <label>Jouw naam<input value={name} required disabled={locked} onChange={e => {
                setName(e.target.value);
                setPicked('');
                setPassword('');
                setError('');
                clearSubmission();
              }} /></label>
              {matches.length > 1 && <label>Welke deelnemer ben je?
                <select value={id || ''} required disabled={locked} onChange={e => {
                  setPicked(e.target.value);
                  setPassword('');
                  setError('');
                  clearSubmission();
                }}>
                  <option value="">Kies je deelnemer</option>
                  {matches.map(([key, participant]) => <option key={key} value={key}>{participant.name} ({key.slice(0, 8)})</option>)}
                </select>
              </label>}
              <label>Stemwachtwoord
                <input type="password" value={password} required disabled={locked}
                  autoComplete={person && !person.needsPassword ? 'current-password' : 'new-password'}
                  onChange={e => { setPassword(e.target.value); setError(''); clearSubmission(); }} />
              </label>
              <p className="description">{person && !person.needsPassword && !person.localOnly
                ? 'Meld je aan met je stemwachtwoord om je antwoorden te bekijken en aan te passen.'
                : 'Kies een stemwachtwoord om je later opnieuw aan te melden.'}</p>
            </>
          )}
          <div className="edit-actions">
            {!signedIn && <button type="submit" disabled={locked}>{locked ? 'Aanmelden…' : 'Aanmelden'}</button>}
            {(name || session || pending) && <button type="button" className="btn-secondary" disabled={busy || saving > 0} onClick={reset}>Van stemmer wisselen</button>}
          </div>
          {pending && <p role="status" className="description">Je aanmelding wordt gecontroleerd. Wacht op verbinding met de database.</p>}
          {outcome?.rejection && <p role="alert" className="error">{outcome.rejection}</p>}
        </fieldset>
      </form>
      {signedIn && (
        <fieldset>
          <legend>02 — Jouw beschikbaarheid</legend>
          <VoteCalendar key={session.voter} dates={dates} myVotes={parseVotes(activePerson.votesJson)} onVote={castVote} />
          <p className="description" role="status">{saving > 0 ? 'Stem bewaren…' : 'Je keuzes worden automatisch opgeslagen.'}</p>
        </fieldset>
      )}
      {error && <p role="alert" className="error">{error}</p>}
    </div>
  );
}
