import React, { useEffect, useMemo, useState } from 'react';
import gun from '../gun.js';
import { generateId } from '../utils/id.js';
import { parseVotes } from '../utils/votes.js';
import { useGunNode } from '../hooks/useGunNode.js';
import { useGunList } from '../hooks/useGunList.js';
import VoterForm from './VoterForm.jsx';
import VoteGrid from './VoteGrid.jsx';
import OrganizerPanel from './OrganizerPanel.jsx';

function getStoredVoterId(pollId) {
  return window.localStorage.getItem(`poll-voter-${pollId}`);
}

function storeVoterId(pollId, voterId) {
  window.localStorage.setItem(`poll-voter-${pollId}`, voterId);
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

  useEffect(() => {
    setVoterId(getStoredVoterId(pollId));
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

  if (poll === null) {
    return <div className="page">Prikker laden... (klopt de link?)</div>;
  }

  const hasJoined = Boolean(voterId && votes[voterId]);
  const isOrganizer =
    hasJoined && poll.organizerEmail && votes[voterId].email === poll.organizerEmail;
  const hasDates = Object.keys(dates).length > 0;

  return (
    <div className="page">
      <h1>{poll.title}</h1>
      {poll.description && <p className="description">{poll.description}</p>}

      {poll.status === 'closed' && poll.finalDateId && dates[poll.finalDateId] && (
        <p className="final-date">
          Gekozen datum: {dates[poll.finalDateId].date} {dates[poll.finalDateId].time}
        </p>
      )}

      {!hasJoined && <VoterForm onJoin={handleJoin} />}

      {hasJoined && hasDates && (
        <VoteGrid dates={dates} votes={votes} currentVoterId={voterId} onCellClick={handleCellClick} />
      )}

      {hasJoined && isOrganizer && poll.status === 'open' && hasDates && (
        <OrganizerPanel dates={dates} votes={votes} onConfirm={handleConfirmFinalDate} />
      )}

      <p className="share-hint">
        Deel deze link met je groep: <code>{window.location.href}</code>
      </p>
    </div>
  );
}
