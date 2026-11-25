import React, { useEffect, useRef, useState } from 'react';
import { enqueue } from '../data/polls.js';
import { ballotStorageKey, voterSession } from '../data/voterSession.js';
import { hashPassword } from '../utils/password.js';
import { parseVotes } from '../utils/votes.js';
import VoteCalendar from './VoteCalendar.jsx';
import CollapsibleSegment from './CollapsibleSegment.jsx';

const normalize = name => name.trim().toLowerCase();

export default function VoterForm({ pollId, dates, participants, loginResults, session, onSelect, active = true, votingOpen = true, readOnly = false }) {
  const storageKey = ballotStorageKey(pollId);
  const [submission, setSubmission] = useState(() => JSON.parse(sessionStorage.getItem(storageKey) || 'null'));
  const [name, setName] = useState(() => submission?.name || session?.name || '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(0);
  const [error, setError] = useState('');
  const segment = useRef(null);
  const availability = useRef(null);
  const handledLogin = useRef(null);

  const [id] = Object.entries(participants).find(([, person]) => normalize(person.name) === normalize(name)) || [];
  const activePerson = participants[session?.voter];
  const votingSignedIn = Boolean(session && activePerson);
  const signedIn = votingSignedIn || Boolean(session?.organizer);
  const availabilityOpen = active && votingOpen && votingSignedIn && !readOnly;
  const outcome = submission && loginResults?.[submission.operation];
  const pending = Boolean(submission && !outcome);
  const locked = busy || pending;

  useEffect(() => {
    if (!submission || !outcome?.session || outcome.rejection || handledLogin.current === submission.operation) return;
    const verified = outcome.session;
    const authenticated = {
      ...verified, ...(verified.voter && { proof: verified.proof || submission.session.proof }),
    };
    const accepted = segment.current.transitionContent(() => {
      onSelect(authenticated);
      setName(authenticated.name);
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
    if (!password) return setError('Vul je wachtwoord in.');
    setBusy(true);
    try {
      const credentials = await voterSession(pollId, id || crypto.randomUUID(), password);
      const organizerProof = await hashPassword(pollId, password);
      const operation = await enqueue(pollId, 'signIn', {
        ...credentials, name: name.trim(), organizerProof,
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
        voter: session.voter, proof: session.proof,
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
        <form onSubmit={signIn} aria-busy={locked || undefined}>
          <fieldset className="voter-credentials" disabled={busy}>
            <div className={'access-row' + (!signedIn ? ' access-row--login' : '')}>
              <div className="access-fields">
                {signedIn ? (
                  <p>Aangemeld als <strong>{activePerson?.name || session.name}</strong>{session.organizer ? ' (organisator)' : ''}.</p>
                ) : (
                  <>
                    <label><span className="access-field-caption">Naam</span><input value={name} required disabled={locked} onChange={e => {
                      setName(e.target.value);
                      setPassword('');
                      setError('');
                      clearSubmission();
                    }} /></label>
                    <label><span className="access-field-caption">Wachtwoord</span>
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
            {outcome?.rejection && <p role="alert" className="error">{outcome.rejection}</p>}
          </fieldset>
        </form>
        {!signedIn && error && <p role="alert" className="error">{error}</p>}
      </CollapsibleSegment>
      <div ref={availability} className="voter-availability" data-open={availabilityOpen}>
        <CollapsibleSegment title="02 — Jouw beschikbaarheid" open={availabilityOpen}>
          <div className="voter-ballot" role="region" aria-label="Jouw beschikbaarheid" tabIndex={availabilityOpen ? 0 : undefined}>
            <VoteCalendar key={session?.voter || 'guest'} dates={dates} myVotes={parseVotes(activePerson?.votesJson)} onVote={castVote} disabled={readOnly} />
            <p className="description" role="status">{saving > 0 ? 'Stem bewaren…' : 'Je keuzes worden automatisch opgeslagen.'}</p>
          </div>
          {signedIn && error && <p role="alert" className="error">{error}</p>}
        </CollapsibleSegment>
      </div>
    </div>
  );
}
