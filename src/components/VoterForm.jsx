import { formatDay } from '../utils/dates.js';
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
  const [edits, setEdits] = useState(submission?.changes || {});
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const matches = Object.entries(participants).filter(([, person]) => normalize(person.name) === normalize(name));
  const id = matches.length === 1 ? matches[0][0] : matches.find(([key]) => key === picked)?.[0];
  const person = participants[id];
  const remembered = id && id === session?.voter;
  const oldVotes = deferred.filter(item => item.body.voter === id);
  const base = parseVotes(person?.votesJson);
  const oldAnswers = Object.fromEntries(oldVotes.map(({ body }) => [body.day, body.value]));
  const answers = { ...base, ...oldAnswers, ...edits };
  const count = Object.keys(dates).filter(day => answers[day] && answers[day] !== 'none').length;
  const outcome = submission && results?.[submission.operation];
  const processed = Boolean(outcome);
  const pending = submission && !processed;
  const locked = busy || Boolean(pending);
  const saved = processed && !outcome.rejection;
  const removed = Object.keys(edits).filter(day => !dates[day]);

  useEffect(() => {
    if (!saved) return;
    onSelect(submission.session);
    setPassword('');
    setEdits({});
    setEditingId(null);
    sessionStorage.removeItem(storageKey);
  }, [saved, submission, onSelect, storageKey]);

  function clearSubmission() {
    sessionStorage.removeItem(storageKey);
    setSubmission(null);
  }

  function discardAllowed() {
    return pending || !Object.keys(edits).length || window.confirm('Je hebt onopgeslagen antwoorden. Wil je die verwerpen?');
  }

  function reset() {
    if (!discardAllowed()) return;
    onSelect(null);
    setName('');
    setPicked('');
    setPassword('');
    setEdits({});
    setEditingId(null);
    clearSubmission();
    setError('');
  }

  function changeName(next) {
    if (id && normalize(next) !== normalize(name)) {
      if (!discardAllowed()) return;
      setEdits({});
      setEditingId(null);
      setPassword('');
      setPicked('');
    }
    clearSubmission();
    setError('');
    setName(next);
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (!name.trim()) return setError('Vul je naam in.');
    if (editingId && !participants[editingId]) return setError('Deze deelnemer is verwijderd. Wissel van stemmer om opnieuw te beginnen.');
    if (matches.length > 1 && !id) return setError('Kies welke deelnemer je bent.');
    if (person?.needsPassword && legacyVoter !== id) return setError('Stel je wachtwoord eerst in op het oorspronkelijke toestel.');
    if (!count) return setError('Beantwoord minstens één datum.');
    if (!password && !remembered) return setError('Vul je stemwachtwoord in.');
    setBusy(true);
    try {
      const credentials = password ? await voterSession(pollId, id || crypto.randomUUID(), password) : session;
      const changes = {};
      for (const [day, value] of Object.entries({ ...oldAnswers, ...edits })) {
        if (dates[day] && value !== (base[day] || 'none')) changes[day] = value;
      }
      const operation = await enqueue(pollId, 'ballot', {
        ...credentials, name: name.trim(), register: !person || Boolean(person.localOnly),
        claim: Boolean(id && id === legacyVoter), changes, legacyOperations: oldVotes.map(item => item.operation),
      });
      const receipt = { operation, session: credentials, name: name.trim(), count, changes };
      sessionStorage.setItem(storageKey, JSON.stringify(receipt));
      setSubmission(receipt);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <fieldset disabled={busy}>
        <legend>01 — Jouw gegevens</legend>
        {remembered ? (
          <p>Je stemt als <strong>{person.name}</strong>.</p>
        ) : (
          <>
            <label>Jouw naam<input value={name} required disabled={locked} onChange={e => changeName(e.target.value)} /></label>
            {matches.length > 1 && <label>Welke deelnemer ben je?
              <select value={id || ''} required disabled={locked} onChange={e => {
                if (id && !discardAllowed()) return;
                setPicked(e.target.value);
                if (id) { setEdits({}); setPassword(''); }
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
              ? 'Je eerdere antwoorden staan hieronder. Gebruik je wachtwoord om ze aan te passen.'
              : 'Kies een wachtwoord om je antwoorden later te kunnen aanpassen.'}</p>
          </>
        )}
        {(name || session) && (
          <div className="edit-actions">
            <button type="button" className="btn-secondary" disabled={busy} onClick={reset}>Van stemmer wisselen</button>
          </div>
        )}
      </fieldset>
      <fieldset disabled={locked}>
        <legend>02 — Jouw beschikbaarheid</legend>
        <VoteCalendar key={id || 'new'} dates={dates} myVotes={answers} onVote={(day, value) => {
          clearSubmission();
          setEditingId(id || null);
          setError('');
          setEdits(previous => ({ ...previous, [day]: value }));
        }} />
      </fieldset>
      {removed.length > 0 && <p role="status">Verwijderd uit deze prikker: {removed.map(day => formatDay(day)).join(', ')}. Bij opslaan tellen alleen de overige datums mee.</p>}
      {outcome?.rejection && <p role="alert" className="error">{outcome.rejection}</p>}
      {error && <p role="alert" className="error">{error}</p>}
      {submission && !outcome?.rejection && <p role="status">
        {submission.name} · {submission.count} van {Object.keys(dates).length} datums beantwoord · {saved ? 'Gesynchroniseerd' : 'Lokaal bewaard'}
      </p>}
      <div className="edit-actions">
        <button type="submit" disabled={locked}>Stem opslaan</button>
      </div>
    </form>
  );
}
