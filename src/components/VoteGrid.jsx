import { t } from '../i18n/index.js';
import { formatProposal } from '../utils/dates.js';
import React from 'react';
import { voteLabel, VOTE_ICONS, parseVotes } from '../utils/votes.js';

function sortDateEntries(dates) {
  return Object.entries(dates).sort(([a], [b]) => a.localeCompare(b));
}

// Alleen-lezen overzicht van wie wat stemde. Het aanpassen van je eigen stem
// gebeurt via <VoteCalendar>; `canManage` (enkel waar voor de ontgrendelde
// organisator in de bewerkmodus) voegt een kolom toe om deelnemers te verwijderen.
export default function VoteGrid({ dates, votes, currentVoterId, finalDateId, canManage, onRemoveVoter }) {
  const dateEntries = sortDateEntries(dates);
  const voterEntries = Object.entries(votes);

  return (
    <table className="vote-grid">
      <thead>
        <tr>
          <th>{t('common.name')}</th>
          {dateEntries.map(([dateId, info]) => (
            <th key={dateId} scope="col" className={dateId === finalDateId ? 'chosen-column' : undefined}>
              {formatProposal(info.date, info.time)}
              {dateId === finalDateId && <strong className="chosen-label">{t('results.finalDate')}</strong>}
            </th>
          ))}
          {canManage && <th />}
        </tr>
      </thead>
      <tbody>
        {voterEntries.map(([voterId, voter]) => {
          const myVotes = parseVotes(voter.votesJson);
          const isMe = voterId === currentVoterId;
          return (
            <tr key={voterId} className={isMe ? 'my-row' : ''}>
              <td>
                {voter.name}
                {isMe ? t('results.you') : ''}
              </td>
              {dateEntries.map(([dateId]) => {
                const value = myVotes[dateId] || 'none';
                const label = value === 'none' ? t('vote.unanswered') : voteLabel(value);
                return <td key={dateId} className={dateId === finalDateId ? 'chosen-column' : undefined}>
                  <span role="img" aria-label={label} title={label}>{VOTE_ICONS[value]}</span>
                </td>;
              })}
              {canManage && (
                <td>
                  <button
                    type="button"
                    className="btn-danger"
                    onClick={() => onRemoveVoter(voterId)}
                    aria-label={t('results.removeVoter', { name: voter.name })}
                  >
                    ✕
                  </button>
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
