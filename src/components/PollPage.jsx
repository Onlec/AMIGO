import React, { useEffect, useMemo, useState } from 'react';
import gun from '../gun.js';
import { generateId } from '../utils/id.js';
import { parseVotes, buildShareText } from '../utils/votes.js';
import { useGunNode } from '../hooks/useGunNode.js';
import { useGunList } from '../hooks/useGunList.js';
import VoterForm from './VoterForm.jsx';
import VoteCalendar from './VoteCalendar.jsx';
import VoteGrid from './VoteGrid.jsx';
import OrganizerPanel from './OrganizerPanel.jsx';
import OrganizerUnlock from './OrganizerUnlock.jsx';
import EditPollPanel from './EditPollPanel.jsx';
import CopyButton from './CopyButton.jsx';

function getStoredVoterId(pollId) {
  return window.localStorage.getItem(`poll-voter-${pollId}`);
}

function storeVoterId(pollId, voterId) {
  window.localStorage.setItem(`poll-voter-${pollId}`, voterId);
}

function isUnlockedInStorage(pollId) {
  return window.localStorage.getItem(`poll-unlocked-${pollId}`) === 'true';
}

export default function PollPage({ pollId }) {
  // useMemo zorgt dat we dezelfde Gun-node-referentie behouden zolang
  // pollId niet verandert — anders zouden de hooks hieronder bij elke
  // render opnieuw (de)abonneren.
  const pollNode = useMemo(() => gun.get('polls').get(pollId), [pollId]);
  const datesNode = useMemo(() => pollNode.get('dates'), [pollNode]);
  const votesNode = useMemo(() => pollNode.get('votes'), [pollNode]);

  const poll = useGunNode(pollNode);
  const dates = useGunList(datesNode);
  const votes = useGunList(votesNode);

  const [voterId, setVoterId] = useState(() => getStoredVoterId(pollId));
  const [isUnlocked, setIsUnlocked] = useState(() => isUnlockedInStorage(pollId));

  useEffect(() => {
    setVoterId(getStoredVoterId(pollId));
    setIsUnlocked(isUnlockedInStorage(pollId));
  }, [pollId]);

  function handleJoin(name, email) {
    const newVoterId = generateId('voter-');
    votesNode.get(newVoterId).put({ name, email, votesJson: '{}' });
    storeVoterId(pollId, newVoterId);
    setVoterId(newVoterId);
  }

  function handleCellClick(dateId, value) {
    const myRecord = votes[voterId];
    if (!voterId || !myRecord) return;
    const currentVotes = parseVotes(myRecord.votesJson);
    currentVotes[dateId] = value;
    votesNode.get(voterId).put({
      name: myRecord.name,
      email: myRecord.email,
      votesJson: JSON.stringify(currentVotes),
    });
  }

  function handleConfirmFinalDate(dateId) {
    pollNode.put({ status: 'closed', finalDateId: dateId });
  }

  function handleUnlock() {
    window.localStorage.setItem(`poll-unlocked-${pollId}`, 'true');
    setIsUnlocked(true);
  }

  function handleRemoveVoter(targetVoterId) {
    votesNode.get(targetVoterId).put(null);
  }

  function handleToggleDate(dateKey) {
    if (dates[dateKey]) {
      datesNode.get(dateKey).put(null);
    } else {
      datesNode.get(dateKey).put({ date: dateKey, time: '' });
    }
  }

  function handleSavePollDetails({ title, description }) {
    pollNode.put({ title, description });
  }

  if (poll === null) {
    return <div className="page">Prikker laden... (klopt de link?)</div>;
  }

  const hasJoined = Boolean(voterId && votes[voterId]);
  const hasDates = Object.keys(dates).length > 0;
  const finalDate = poll.finalDateId ? dates[poll.finalDateId] : null;

  return (
    <div className="page">
      <h1>{poll.title}</h1>
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

      {!hasJoined && <VoterForm onJoin={handleJoin} />}

      {hasJoined && hasDates && poll.status === 'open' && (
        <>
          <h2>Jouw stem — klik een datum aan</h2>
          <VoteCalendar
            dates={dates}
            myVotes={parseVotes(votes[voterId]?.votesJson)}
            onVote={handleCellClick}
          />
        </>
      )}

      {hasJoined && hasDates && (
        <>
          <h2>Overzicht</h2>
          <VoteGrid
            dates={dates}
            votes={votes}
            currentVoterId={voterId}
            canManage={isUnlocked}
            onRemoveVoter={handleRemoveVoter}
          />
        </>
      )}

      {!isUnlocked && <OrganizerUnlock pollId={pollId} expectedHash={poll.passwordHash} onUnlock={handleUnlock} />}

      {isUnlocked && (
        <>
          <EditPollPanel
            poll={poll}
            dates={dates}
            onSave={handleSavePollDetails}
            onToggleDate={handleToggleDate}
          />

          {poll.status === 'open' && hasDates && (
            <OrganizerPanel dates={dates} votes={votes} onConfirm={handleConfirmFinalDate} />
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
