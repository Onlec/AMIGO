import { formatProposal } from '../utils/dates.js';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { enqueue, project, readLocal, watchPoll } from '../data/polls.js';
import { follow, syncStatus, unlock, watchStatus } from '../data/sync.js';
import { buildShareText } from '../utils/votes.js';
import { readVoterSession, rememberVoterSession } from '../data/voterSession.js';
import VoterForm from './VoterForm.jsx';
import VoteGrid from './VoteGrid.jsx';
import OrganizerPanel from './OrganizerPanel.jsx';
import OrganizerUnlock from './OrganizerUnlock.jsx';
import EditPollPanel from './EditPollPanel.jsx';
import CopyButton from './CopyButton.jsx';
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
  const [mode, setMode] = useState('view');
  const editing = mode === 'edit' || mode === 'final';
  const selectVoter = useCallback(next => {
    rememberVoterSession(pollId, next);
    setSession(next);
  }, [pollId]);

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
  for (const { body } of deferred) {
    if (!body.existing && !votes[body.voter]) localParticipants[body.voter] = { name: body.name, localOnly: true };
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
        </div>
      )}

      <VoterForm pollId={pollId} dates={dates} participants={{ ...localParticipants, ...votes }}
        legacyVoter={poll.ownVoter} deferred={deferred} results={row.ballotResults}
        session={session} onSelect={selectVoter} active={showBallot} />

      <div className="form poll-results">
        <CollapsibleSegment title="02 — Stemmenoverzicht" open={hasDates && hasVoters}>
          <div className="poll-results-actions">
            <CopyButton text={buildShareText(poll, dates, votes, window.location.href)} label="Stemmenoverzicht delen" iconOnly
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                <path d="m8.6 10.5 6.8-4m-6.8 7 6.8 4" />
              </svg>} />
          </div>
          <div className="vote-grid-scroll" role="region" aria-label="Stemmenoverzicht" tabIndex={0}>
            <VoteGrid
              dates={dates}
              votes={votes}
              finalDateId={poll.finalDateId}
              currentVoterId={voterId}
              canManage={editing}
              onRemoveVoter={voter => save('removeVoter', { voter })}
            />
          </div>
        </CollapsibleSegment>
      </div>

      <OrganizerUnlock pollId={pollId} editing={editing} authorized={Boolean(poll.organizer)}
        onEdit={() => setMode('edit')} onChooseFinal={poll.status === 'open' && hasDates ? () => setMode('final') : null}
        onUnlock={proof => unlock(pollId, proof)}>
        {mode === 'edit' && (
          <EditPollPanel poll={poll} onSave={body => enqueue(pollId, 'edit', body)}
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
