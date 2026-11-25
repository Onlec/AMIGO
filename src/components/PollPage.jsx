import { formatProposal } from '../utils/dates.js';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { enqueue, project, readLocal, watchPoll } from '../data/polls.js';
import { follow, syncStatus, watchStatus } from '../data/sync.js';
import { readVoterSession, rememberVoterSession } from '../data/voterSession.js';
import VoterForm from './VoterForm.jsx';
import VoteGrid from './VoteGrid.jsx';
import OrganizerPanel from './OrganizerPanel.jsx';
import OrganizerUnlock from './OrganizerUnlock.jsx';
import EditPollPanel from './EditPollPanel.jsx';
import CopyButton from './CopyButton.jsx';
import SharePollButton from './SharePollButton.jsx';
import CollapsibleSegment from './CollapsibleSegment.jsx';

export default function PollPage({ pollId, share }) {
  const [row, setRow] = useState(null);
  const [status, setStatus] = useState('');
  const [storageError, setStorageError] = useState('');
  useEffect(() => {
    let live = true;
    async function refresh() {
      try {
        const next = await readLocal(pollId);
        if (live) setRow(next);
      } catch (err) {
        if (live) setStorageError('Lokale opslag is niet beschikbaar. ' + err.message);
      }
    }
    const stopLocal = watchPoll(pollId, refresh);
    const stopStatus = watchStatus(pollId, () => setStatus(syncStatus(pollId)));
    refresh();
    const stopFollowing = follow(pollId);
    return () => { live = false; stopLocal(); stopStatus(); stopFollowing(); };
  }, [pollId]);

  const poll = useMemo(() => project(row), [row]);
  const dates = poll?.dates || {};
  const votes = poll?.votes || {};
  const [session, setSession] = useState(() => readVoterSession(pollId));
  const voterId = votes[session?.voter] ? session.voter : null;
  const organizerVoterId = poll?.organizerVoter || (session?.organizer && voterId) || null;
  const [mode, setMode] = useState('view');
  const [organizerSignedOut, setOrganizerSignedOut] = useState(false);
  const organizerAuthorized = Boolean(session?.organizer && poll?.organizer) && !organizerSignedOut;
  const editing = mode === 'edit' || mode === 'final';
  const selectVoter = useCallback(next => {
    rememberVoterSession(pollId, next);
    setSession(next);
    if (next?.organizer) setOrganizerSignedOut(false);
    if (!next) {
      setMode('view');
      if (organizerAuthorized || editing) {
        setOrganizerSignedOut(true);
        enqueue(pollId, 'lockOrganizer', {}).catch(err => setStorageError('Afmelden kon niet worden bewaard. ' + err.message));
      }
    }
  }, [pollId, organizerAuthorized, editing]);

  useEffect(() => {
    if (!session?.organizer || !poll || !('organizerVoter' in poll)) return;
    const ownId = poll.organizerVoter;
    const credentials = session.participation;
    if (ownId && credentials?.voter === ownId && session.voter !== ownId) {
      const next = { ...session, ...credentials };
      rememberVoterSession(pollId, next);
      setSession(next);
    } else if (!ownId && session.voter && !poll.votes[session.voter]) {
      const next = { ...session, voter: null, proof: undefined,
        participation: session.participation || { voter: session.voter, proof: session.proof } };
      rememberVoterSession(pollId, next);
      setSession(next);
    }
  }, [poll, session, pollId]);

  async function savePoll(changes) {
    if (!('participating' in changes)) return enqueue(pollId, 'edit', changes);
    const { participating, ...details } = changes;
    let credentials = session.participation || (session.voter && session.proof
      ? { voter: session.voter, proof: session.proof } : null);
    if (!credentials) credentials = {
      voter: crypto.randomUUID(),
      proof: Array.from(crypto.getRandomValues(new Uint8Array(32)), value => value.toString(16).padStart(2, '0')).join(''),
    };
    const next = { ...session, participation: credentials };
    rememberVoterSession(pollId, next);
    setSession(next);
    return enqueue(pollId, 'edit', { ...details, organizerParticipation: {
      ...credentials, voter: participating ? credentials.voter : organizerVoterId || credentials.voter,
      name: session.name || votes[session.voter]?.name, enabled: participating,
    } });
  }

  function save(kind, body) {
    enqueue(pollId, kind, body).catch(err => setStorageError('Lokaal opslaan mislukt. ' + err.message));
  }

  const notices = row?.notices || [];
  if (!poll) {
    const message = status === 'Offline' ? 'Deze prikker is nog niet op dit toestel bewaard. Open de link eerst online.' : status;
    return <div className="page" role="status">{storageError || notices.at(-1) || message || 'Prikker laden…'}</div>;
  }

  if (share) {
    const link = new URL('?poll=' + pollId, window.location.href).href;
    return (
      <main className="page">
        <h1>Deel je datumprikker</h1>
        <p>{poll.title}</p>
        <div className="form">
          <label>Stemlink<input readOnly type="url" value={link} onFocus={e => e.target.select()} /></label>
          <p role="status" className="description">{row.base ? 'Klaar om te delen.' : 'Lokaal bewaard. Anderen kunnen de link openen na synchronisatie.'}</p>
          <div className="edit-actions">
            <CopyButton text={link} label="Link kopiëren" />
            <a className="btn" href={link}>Naar de datumprikker</a>
          </div>
        </div>
      </main>
    );
  }

  const hasDates = Object.keys(dates).length > 0;
  const showBallot = hasDates && poll.status === 'open';
  const hasVoters = Object.keys(votes).length > 0;
  const deferred = row.legacyVotes || [];
  const localParticipants = {};
  const excludedVoters = new Set(row.queue.filter(item => item.kind === 'edit' && item.body.organizerParticipation?.enabled === false)
    .map(item => item.body.organizerParticipation.voter));
  for (const { body } of deferred) {
    if (!body.existing && !votes[body.voter] && !excludedVoters.has(body.voter)) localParticipants[body.voter] = { name: body.name, localOnly: true };
  }
  const finalDate = poll.finalDateId ? dates[poll.finalDateId] : null;

  return (
    <div className="page">
      <div className="lab eyebrow">AMIGO / STEMMEN</div>
      <h1>{poll.title}</h1>
      <p role="status" className="description">
        {row.queue.some(item => ['create', 'createPoll'].includes(item.kind))
          ? 'Lokaal bewaard. Anderen kunnen de link openen na de eerste synchronisatie.'
          : row.queue.length ? 'Wijzigingen lokaal bewaard.' : ''}
        {' '}{row.queue.length && status === 'Gesynchroniseerd' ? '' : status}
      </p>
      {storageError && <p role="alert" className="error">{storageError}</p>}
      {notices.map((notice, index) => <p className="error" key={index}>Wijziging afgewezen — {notice}</p>)}
      {poll.description && <p className="description">{poll.description}</p>}

      {poll.status === 'closed' && finalDate && (
        <div className="final-date-block">
          <p className="final-date">
            Gekozen datum: {formatProposal(finalDate.date, finalDate.time, true)}
          </p>
          <SharePollButton poll={poll} dates={dates} votes={votes} label="Einddatum delen" />
        </div>
      )}

      <VoterForm pollId={pollId} dates={dates} participants={{ ...localParticipants, ...votes }}
        legacyVoter={poll.ownVoter} deferred={deferred} results={row.ballotResults} loginResults={row.loginResults}
        session={session} onSelect={selectVoter} votingOpen={showBallot} readOnly={editing} />

      <div className="form poll-results">
        <CollapsibleSegment title="03 — Stemmenoverzicht" open={hasDates && hasVoters}>
          <div className="poll-results-actions">
            <SharePollButton poll={poll} dates={dates} votes={votes} />
          </div>
          <div className="vote-grid-scroll" role="region" aria-label="Stemmenoverzicht" tabIndex={0}>
            <VoteGrid
              dates={dates}
              votes={votes}
              finalDateId={poll.finalDateId}
              currentVoterId={voterId}
              canManage={mode === 'edit' && organizerAuthorized}
              onRemoveVoter={voter => { if (mode === 'edit' && organizerAuthorized) save('removeVoter', { voter }); }}
            />
          </div>
        </CollapsibleSegment>
      </div>

      <OrganizerUnlock editing={editing} authorized={organizerAuthorized} signedIn={Boolean(session)}
        onEdit={() => setMode('edit')} onChooseFinal={poll.status === 'open' && hasDates ? () => setMode('final') : null}>
        {mode === 'edit' && (
          <EditPollPanel poll={poll} initiallyParticipating={Boolean(organizerVoterId)} onSave={savePoll}
            onCancel={() => setMode('view')} />
        )}
        {mode === 'final' && poll.status === 'open' && (
          <OrganizerPanel dates={dates} votes={votes} onConfirm={day => enqueue(pollId, 'close', { day })}
            onCancel={() => setMode('view')} />
        )}
        {mode === 'final' && poll.status === 'closed' && (
          <button type="button" onClick={() => setMode('view')}>Klaar</button>
        )}
      </OrganizerUnlock>

      <p className="share-hint">
        Deel deze link met je groep: <code>{window.location.href}</code>{' '}
        <CopyButton text={window.location.href} label="Link kopiëren" />
      </p>
    </div>
  );
}
