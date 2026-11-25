import React, { useEffect, useRef, useState } from 'react';
import { enqueue } from '../data/polls.js';
import { voterSession } from '../data/voterSession.js';
import { hashPassword } from '../utils/password.js';
import { parseVotes } from '../utils/votes.js';
import VoteCalendar from './VoteCalendar.jsx';
import CollapsibleSegment from './CollapsibleSegment.jsx';

const normalize = name => name.trim().toLowerCase();

export default function VoterForm({ pollId, dates, participants, legacyVoter, deferred, results, loginResults, session, onSelect, active = true, votingOpen = true, readOnly = false }) {
  const storageKey = 'amigo-ballot:' + pollId;
  const [submission, setSubmission] = useState(() => JSON.parse(sessionStorage.getItem(storageKey) || 'null'));
  const [name, setName] = useState(() => submission?.name || session?.name || participants[session?.voter]?.name || '');
  const [password, setPassword] = useState('');
  const [picked, setPicked] = useState(submission?.session.voter || session?.voter || '');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(0);
  const [error, setError] = useState('');
  const segment = useRef(null);
  const availability = useRef(null);
  const handledLogin = useRef(null);

  const matches = Object.entries(participants).filter(([, person]) => normalize(person.name) === normalize(name));
  const id = matches.length === 1 ? matches[0][0] : matches.find(([key]) => key === picked)?.[0];
  const person = participants[id];
  const activePerson = participants[session?.voter];
  const votingSignedIn = Boolean(session && activePerson && !activePerson.needsPassword && !activePerson.localOnly);
  const signedIn = votingSignedIn || Boolean(session?.organizer);
  const outcome = submission && (loginResults?.[submission.operation] || results?.[submission.operation]);
  const pending = Boolean(submission && !outcome);
  const locked = busy || pending;

  useEffect(() => {
    if (!submission || !outcome || outcome.rejection || handledLogin.current === submission.operation) return;
    const verified = outcome.session;
    const authenticated = verified ? {
      ...verified, ...(verified.voter && { proof: verified.proof || submission.session.proof }),
    } : submission.session;
    const accepted = segment.current.transitionContent(() => {
      onSelect(authenticated);
      setName(authenticated.name || submission.name);
      setPicked(authenticated.voter || '');
      setPassword('');
      sessionStorage.removeItem(storageKey);
      setSubmission(null);
    }, () => authenticated.voter && votingOpen
      ? availability.current?.querySelector('.voter-ballot')
      : document.querySelector('.voter-credentials button'));
    if (accepted) handledLogin.current = submission.operation;
  }, [outcome, submission, onSelect, storageKey, votingOpen]);

  function clearSubmission() {
    sessionStorage.removeItem(storageKey);
    setSubmission(null);
  }

  function reset() {
    segment.current.transitionContent(() => {
      onSelect(null);
      setName('');
      setPicked('');
      setPassword('');
      clearSubmission();
      setError('');
    }, '.voter-credentials input');
  }

  async function signIn(event) {
    event.preventDefault();
    if (locked) return;
    setError('');
    if (!navigator.onLine) return setError('Ga online om je aan te melden.');
    if (!name.trim()) return setError('Vul je naam in.');
    if (matches.length > 1 && !id) return setError('Kies welke deelnemer je bent.');
    if (!password) return setError('Vul je wachtwoord in.');
    setBusy(true);
    try {
      const credentials = await voterSession(pollId, id || crypto.randomUUID(), password);
      const oldVotes = deferred.filter(item => item.body.voter === id);
      const changes = Object.fromEntries(oldVotes
        .filter(({ body }) => dates[body.day])
        .map(({ body }) => [body.day, body.value]));
      const organizerProof = await hashPassword(pollId, password);
      const operation = await enqueue(pollId, 'signIn', {
        ...credentials, name: name.trim(), register: !person || Boolean(person.localOnly),
        organizerProof,
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
    if (!votingSignedIn || !votingOpen || readOnly) return;
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
      <CollapsibleSegment ref={segment} title="01 — Jouw gegevens" open={active}>
        <form onSubmit={signIn}>
          <fieldset className="voter-credentials" disabled={busy}>
            <div className="access-row">
              <div className="access-fields">
                {signedIn ? (
                  <p>Aangemeld als <strong>{activePerson?.name || session.name}</strong>{session.organizer ? ' (organisator)' : ''}.</p>
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
                    <label>Wachtwoord
                      <input type="password" value={password} required disabled={locked}
                        autoComplete="current-password"
                        onChange={e => { setPassword(e.target.value); setError(''); clearSubmission(); }} />
                    </label>
                  </>
                )}
              </div>
              <div className="edit-actions access-actions">
                {!signedIn && <button type="submit" disabled={locked}>{locked ? 'Aanmelden…' : 'Aanmelden'}</button>}
                {signedIn && <button type="button" className="btn-secondary" disabled={busy || saving > 0} onClick={reset}>Afmelden</button>}
              </div>
            </div>
            {!signedIn && <p className="description access-hint">{person && !person.needsPassword && !person.localOnly
              ? 'Meld je aan met je wachtwoord om je antwoorden te bekijken en aan te passen.'
              : 'Gebruik je bestaande wachtwoord of kies als nieuwe deelnemer een wachtwoord.'}</p>}
            {pending && <p role="status" className="description">Je aanmelding wordt gecontroleerd. Wacht op verbinding met de database.</p>}
            {outcome?.rejection && <p role="alert" className="error">{outcome.rejection}</p>}
          </fieldset>
        </form>
        {!signedIn && error && <p role="alert" className="error">{error}</p>}
      </CollapsibleSegment>
      <div ref={availability} className="voter-availability" data-open={votingSignedIn && votingOpen}>
        <CollapsibleSegment title="02 — Jouw beschikbaarheid" open={active && votingOpen && votingSignedIn}>
          <div className="voter-ballot" role="region" aria-label="Jouw beschikbaarheid" tabIndex={votingSignedIn && active && votingOpen ? 0 : undefined}>
            <VoteCalendar key={session?.voter || 'guest'} dates={dates} myVotes={parseVotes(activePerson?.votesJson)} onVote={castVote} disabled={readOnly} />
            <p className="description" role="status">{readOnly ? 'Je stemmen zijn alleen-lezen tijdens het beheren van de prikker.'
              : saving > 0 ? 'Stem bewaren…' : 'Je keuzes worden automatisch opgeslagen.'}</p>
          </div>
          {signedIn && error && <p role="alert" className="error">{error}</p>}
        </CollapsibleSegment>
      </div>
    </div>
  );
}
