import { t, message, translateMessage } from '../i18n/index.js';
import { errorMessage } from '../i18n/errors.js';
import { formatProposal } from '../utils/dates.js';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import Confetti from './Confetti.jsx';

export default function PollPage({ pollId, share }) {
  const finalDateRef = useRef(null);
  const pageRef = useRef(null);
  const [celebration, setCelebration] = useState(null);
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
        if (live) setStorageError(message('error.localStorage', { detail: errorMessage(err) }));
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
  const organizerVoterId = poll?.organizerVoter || null;
  const [mode, setMode] = useState('view');
  const [organizerSignedOut, setOrganizerSignedOut] = useState(false);
  const organizerAuthorized = Boolean(session?.organizer && poll?.organizer) && !organizerSignedOut;
  const editing = mode === 'edit' || mode === 'final';

  useEffect(() => {
    if (!celebration || !poll) return;
    const operationIndex = row.queue.findIndex(item => item.operation === celebration.operation);
    const superseded = row.queue.slice(operationIndex + 1).some(item => ['close', 'reopen'].includes(item.kind));
    if (celebration.operation && poll.finalDateId !== celebration.day
        && (celebration.phase === 'revealed' || operationIndex < 0 || superseded)) {
      setCelebration(null);
      return;
    }
    if (celebration.phase !== 'waiting' || mode !== 'view' || poll.finalDateId !== celebration.day) return;
    let cancelled = false;
    let frame;
    const nextFrame = () => new Promise(resolve => { frame = requestAnimationFrame(resolve); });
    const transitions = () => [...(pageRef.current?.querySelectorAll('.collapsible-segment__body') || [])]
      .flatMap(node => node.getAnimations()).filter(animation => ['running', 'pending'].includes(animation.playState));
    async function revealAfterClosing() {
      // Allow React, ResizeObserver and the browser to start every height transition.
      await nextFrame();
      await nextFrame();
      while (!cancelled) {
        const active = transitions();
        if (active.length) await Promise.allSettled(active.map(animation => animation.finished));
        await nextFrame();
        if (cancelled) return;
        if (!transitions().length) {
          setCelebration(current => current && { ...current, phase: 'revealed' });
          return;
        }
      }
    }
    revealAfterClosing();
    return () => { cancelled = true; cancelAnimationFrame(frame); };
  }, [celebration, mode, poll, row]);

  useLayoutEffect(() => {
    if (celebration?.phase !== 'revealed') return;
    finalDateRef.current?.scrollIntoView({ behavior: 'instant', block: 'center' });
    finalDateRef.current?.focus({ preventScroll: true });
  }, [celebration]);

  async function confirmFinalDate(day) {
    setCelebration({ day, phase: 'saving' });
    try {
      const operation = await enqueue(pollId, 'close', { day });
      // Keep the operation and its projected snapshot together, even if the
      // IndexedDB watcher or server acknowledgement arrives in the same frame.
      const next = await readLocal(pollId);
      setRow(next);
      setCelebration({ day, phase: 'waiting', operation });
    } catch (error) {
      setCelebration(null);
      throw error;
    }
  }
  const selectVoter = useCallback(next => {
    rememberVoterSession(pollId, next);
    setSession(next);
    if (next?.organizer) setOrganizerSignedOut(false);
    if (!next) {
      setMode('view');
      if (organizerAuthorized || editing) {
        setOrganizerSignedOut(true);
        enqueue(pollId, 'lockOrganizer', {}).catch(err => setStorageError(message('error.logout', { detail: errorMessage(err) })));
      }
    }
  }, [pollId, organizerAuthorized, editing]);

  useEffect(() => {
    if (!session?.organizer || !poll) return;
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
    enqueue(pollId, kind, body).catch(err => setStorageError(message('error.localSave', { detail: errorMessage(err) })));
  }

  const notices = row?.notices || [];
  if (!poll) {
    const statusText = row?.missing ? t('poll.deleted')
      : status?.key === 'sync.offline' ? t('poll.notCached') : translateMessage(status);
    return <div className="page" role="status">{translateMessage(storageError || notices.at(-1)) || statusText || t('poll.loading')}</div>;
  }

  if (share) {
    const link = new URL('?poll=' + pollId, window.location.href).href;
    return (
      <main className="page planner-page">
        <h1>{t('share.heading')}</h1>
        <p>{poll.title}</p>
        <div className="form">
          <fieldset>
            <legend>{t('share.link')}</legend>
            <div className="planner-fields">
              <label>{t('share.link')}<input readOnly type="url" value={link} onFocus={e => e.target.select()} /></label>
              <p role="status" className="description">{row.base ? t('share.ready') : t('share.pending')}</p>
              <div className="edit-actions">
                <CopyButton text={link} label={t('common.copyLink')} secondary />
                <a className="btn" href={link}>{t('share.openPoll')}</a>
              </div>
            </div>
          </fieldset>
        </div>
      </main>
    );
  }

  const hasDates = Object.keys(dates).length > 0;
  const showBallot = hasDates && poll.status === 'open';
  const hasVoters = Object.keys(votes).length > 0;
  const finalDate = poll.finalDateId ? dates[poll.finalDateId] : null;

  return (
    <div ref={pageRef} className="page planner-page">
      <div className="lab eyebrow">{t('poll.eyebrow')}</div>
      <div className="poll-heading">
        <h1>{poll.title}</h1>
        <SharePollButton poll={poll} dates={dates} votes={votes} />
      </div>
      {storageError && <p role="alert" className="error">{translateMessage(storageError)}</p>}
      {notices.map((notice, index) => <p className="error" key={index}>{t('poll.rejected', { detail: translateMessage(notice) })}</p>)}
      {poll.description && <p className="description">{poll.description}</p>}

      {poll.status === 'closed' && finalDate && !['saving', 'waiting'].includes(celebration?.phase) && (
        <div className="final-date-block">
          {celebration?.phase === 'revealed' && <Confetti key={celebration.operation} originRef={finalDateRef} />}
          <p ref={finalDateRef} tabIndex={-1} className={'final-date' + (celebration?.phase === 'revealed' ? ' final-date--reveal' : '')}>
            {t('poll.finalDate', { date: formatProposal(finalDate.date, finalDate.time, true) })}
          </p>
        </div>
      )}

      <VoterForm pollId={pollId} dates={dates} participants={votes} loginResults={row.loginResults}
        session={session} onSelect={selectVoter} votingOpen={showBallot} readOnly={editing} />

      <div className="form poll-results">
        <CollapsibleSegment title={t('results.section')} open={hasDates && hasVoters}>
          <div className="vote-grid-scroll" role="region" aria-label={t('results.heading')} tabIndex={0}>
            <VoteGrid
              dates={dates}
              votes={votes}
              finalDateId={poll.finalDateId}
              currentVoterId={voterId}
              canManage={mode === 'edit' && organizerAuthorized}
              onRemoveVoter={voter => { if (mode === 'edit' && organizerAuthorized) save('removeVoter', { voter }); }}
            />
          </div>
          <p role="status" className="description poll-results__status">
            {row.queue.some(item => ['create', 'createPoll'].includes(item.kind))
              ? t('sync.createPending')
              : row.queue.length ? t('sync.changesPending') : ''}
            {' '}{row.queue.length && status?.key === 'sync.synced' ? '' : translateMessage(status)}
          </p>
        </CollapsibleSegment>
      </div>

      <OrganizerUnlock editing={editing} authorized={organizerAuthorized}
        finalDateChosen={Boolean(poll.finalDateId)}
        onReopen={() => { if (organizerAuthorized) save('reopen', {}); }}
        onEdit={() => setMode('edit')} onChooseFinal={hasDates ? () => setMode('final') : null}>
        {mode === 'edit' && (
          <EditPollPanel poll={poll} initiallyParticipating={Boolean(organizerVoterId)} onSave={savePoll}
            onCancel={() => setMode('view')} />
        )}
        {mode === 'final' && (
          <OrganizerPanel dates={dates} votes={votes} finalDateId={poll.finalDateId} onConfirm={confirmFinalDate}
            onCancel={() => setMode('view')} />
        )}
      </OrganizerUnlock>

    </div>
  );
}
