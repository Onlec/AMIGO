import React, { useEffect, useMemo, useState } from 'react';
import { enqueue, project, readLocal, watchPoll } from '../data/polls.js';
import { follow, syncStatus, unlock, watchStatus } from '../data/sync.js';
import { parseVotes, buildShareText } from '../utils/votes.js';
import VoteCalendar from './VoteCalendar.jsx';
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
  const voterId = poll?.ownVoter;
  const isUnlocked = poll?.organizer;
  const [nameInput, setNameInput] = useState('');
  const [namePrefilled, setNamePrefilled] = useState(false);
  const [nameError, setNameError] = useState('');

  useEffect(() => {
    if (!namePrefilled && voterId && votes[voterId]) {
      setNameInput(votes[voterId].name);
      setNamePrefilled(true);
    }
  }, [voterId, votes, namePrefilled]);

  function handleVote(dateId, value) {
    const trimmedName = nameInput.trim();
    if (!trimmedName) {
      setNameError('Vul eerst je naam in.');
      return;
    }
    setNameError('');

    save('vote', { day: dateId, value, name: trimmedName });
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
  const finalDate = poll.finalDateId ? dates[poll.finalDateId] : null;

  return (
    <div className="page">
      <h1>{poll.title}</h1>
      <p role="status" className="description">
        {row.queue.some(item => item.kind === 'create')
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

      {hasDates && poll.status === 'open' && (
        <>
          <h2>Jouw stem — klik een datum aan</h2>
          <label className="name-field">
            Jouw naam
            <input
              value={nameInput}
              onChange={(e) => {
                setNameInput(e.target.value);
                if (e.target.value.trim()) setNameError('');
              }}
              placeholder="Vul je naam in om te stemmen"
            />
          </label>
          {nameError && <p className="error">{nameError}</p>}
          <VoteCalendar
            dates={dates}
            myVotes={parseVotes(votes[voterId]?.votesJson)}
            onVote={handleVote}
          />
        </>
      )}

      {hasDates && hasVoters && (
        <>
          <h2>Overzicht</h2>
          <VoteGrid
            dates={dates}
            votes={votes}
            currentVoterId={voterId}
            canManage={isUnlocked}
            onRemoveVoter={voter => save('removeVoter', { voter })}
          />
        </>
      )}

      {!isUnlocked && <OrganizerUnlock pollId={pollId} onUnlock={proof => unlock(pollId, proof)} />}

      {isUnlocked && (
        <>
          <EditPollPanel
            poll={poll}
            dates={dates}
            onSave={details => save('details', details)}
            onToggleDate={day => save(dates[day] ? 'removeDate' : 'addDate', { day })}
          />

          {poll.status === 'open' && hasDates && (
            <OrganizerPanel dates={dates} votes={votes} onConfirm={day => save('close', { day })} />
          )}
        </>
      )}

      <p className="share-hint">
        Deel deze link met je groep: <code>{window.location.href}</code>{' '}
        <CopyButton text={window.location.href} label="Link kopiëren" />
      </p>
    </div>
  );
}
