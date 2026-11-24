import React, { useEffect, useMemo, useState } from 'react';
import { enqueue, project, readLocal, watchPoll } from '../data/polls.js';
import { follow, syncStatus, unlock, watchStatus } from '../data/sync.js';
import { parseVotes, buildShareText } from '../utils/votes.js';
import VoteCalendar from './VoteCalendar.jsx';
import { readVoterSession, rememberVoterSession } from '../data/voterSession.js';
import VoterForm from './VoterForm.jsx';
import VoteGrid from './VoteGrid.jsx';
import OrganizerPanel from './OrganizerPanel.jsx';
import OrganizerUnlock from './OrganizerUnlock.jsx';
import EditPollPanel from './EditPollPanel.jsx';
import CopyButton from './CopyButton.jsx';

export default function PollPage({ pollId }) {
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
  function selectVoter(next) {
    rememberVoterSession(pollId, next);
    setSession(next);
  }

  function save(kind, body) {
    enqueue(pollId, kind, body).catch(err => setStorageError('Lokaal opslaan mislukt. ' + err.message));
  }

  const notices = row?.notices || [];
  if (!poll) {
    const message = status === 'Offline' ? 'Deze prikker is nog niet op dit toestel bewaard. Open de link eerst online.' : status;
    return <div className="page" role="status">{storageError || notices.at(-1) || message || 'Prikker laden…'}</div>;
  }

  const hasDates = Object.keys(dates).length > 0;
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
            Gekozen datum: {finalDate.date} {finalDate.time}
          </p>
        </div>
      )}

      {hasDates && (
        <div className="share-actions">
          <CopyButton text={buildShareText(poll, dates, votes, window.location.href)} label="Update kopiëren" />
        </div>
      )}

      {mode === 'view' && <button type="button" onClick={() => setMode('password')}>Bewerken</button>}
      {mode === 'password' && (
        <OrganizerUnlock pollId={pollId} onCancel={() => setMode('view')} onUnlock={async proof => {
          await unlock(pollId, proof);
          setMode('edit');
        }} />
      )}

      {!editing && hasDates && poll.status === 'open' && (
        <>
          <h2>Jouw stem</h2>
          {deferred.length > 0 && <p>Er staan oude stemmen op dit toestel klaar. Kies je naam bij <strong>Eerdere stem aanpassen</strong> om ze met je stemwachtwoord te bewaren.</p>}
          {voterId ? (
            <>
              <p>Je stemt als <strong>{votes[voterId].name}</strong>.</p>
              <button type="button" className="btn-secondary" onClick={() => selectVoter(null)}>Van stemmer wisselen</button>
            </>
          ) : (
            <VoterForm pollId={pollId} votes={{ ...localParticipants, ...votes }} legacyVoter={poll.ownVoter} onSelect={selectVoter} />
          )}
          <VoteCalendar
            dates={dates}
            myVotes={parseVotes(votes[voterId]?.votesJson)}
            onVote={voterId ? (day, value) => save('castVote', { ...session, day, value }) : undefined}
          />
        </>
      )}

      {mode === 'edit' && (
        <EditPollPanel poll={poll} onSave={body => enqueue(pollId, 'edit', body)}
          onCancel={() => setMode('view')}
          onChooseFinal={poll.status === 'open' && hasDates ? () => setMode('final') : null} />
      )}
      {mode === 'final' && poll.status === 'open' && (
        <OrganizerPanel dates={dates} votes={votes} onConfirm={day => enqueue(pollId, 'close', { day })}
          onCancel={() => setMode('view')} />
      )}
      {mode === 'final' && poll.status === 'closed' && (
        <button type="button" onClick={() => setMode('view')}>Klaar</button>
      )}
      {hasDates && hasVoters && (
        <>
          <h2>Overzicht</h2>
          <div className="vote-grid-scroll" role="region" aria-label="Stemmenoverzicht" tabIndex={0}>
            <VoteGrid
              dates={dates}
              votes={votes}
              currentVoterId={voterId}
              canManage={editing}
              onRemoveVoter={voter => save('removeVoter', { voter })}
            />
          </div>
        </>
      )}

      <p className="share-hint">
        Deel deze link met je groep: <code>{window.location.href}</code>{' '}
        <CopyButton text={window.location.href} label="Link kopiëren" />
      </p>
    </div>
  );
}
