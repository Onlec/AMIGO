export const VOTE_CYCLE = ['none', 'yes', 'maybe', 'no'];

export const VOTE_LABELS = {
  none: '–',
  yes: '✓ Ja',
  maybe: '? Misschien',
  no: '✗ Nee',
};

export function nextVoteValue(current) {
  const idx = VOTE_CYCLE.indexOf(current || 'none');
  return VOTE_CYCLE[(idx + 1) % VOTE_CYCLE.length];
}

// votesJson is een JSON-string: { [dateId]: 'yes' | 'maybe' | 'no' }
// We slaan het zo op (ipv geneste Gun-nodes) zodat één stem altijd in
// één atomaire .put() wordt weggeschreven en nooit half gesynct raakt.
export function parseVotes(votesJson) {
  try {
    return votesJson ? JSON.parse(votesJson) : {};
  } catch (err) {
    return {};
  }
}

const VOTE_EMOJI = { yes: '🟩', maybe: '🟨', no: '🟥', none: '⬜' };
const WEEKDAY_ABBR = ['Zo', 'Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za']; // Date.getDay(): 0 = zondag
const MONTH_ABBR = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

function formatDateKeyShort(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return `${WEEKDAY_ABBR[date.getDay()]} ${day} ${MONTH_ABBR[month - 1]}`;
}

function hasVoted(votesJson) {
  const myVotes = parseVotes(votesJson);
  return Object.values(myVotes).some((value) => value !== 'none');
}

// Bouwt een kopieerbare voortgangs-/resultaattekst op: titel, een
// emoji-rooster per kandidaat-datum (één kolom per deelnemer, in
// dezelfde volgorde op elke rij), wie al stemde / nog moet stemmen, en
// de link — klaar om elders te plakken (groepsapp, mail, ...). Werkt
// zowel tijdens het stemmen als nadat de organisator een datum koos
// (die rij krijgt dan een "✅ gekozen"-markering).
export function buildShareText(poll, dates, votes, pollUrl) {
  const dateEntries = Object.entries(dates).sort(([a], [b]) => a.localeCompare(b));
  const voterEntries = Object.entries(votes);

  const votedNames = [];
  const pendingNames = [];
  voterEntries.forEach(([, voter]) => {
    if (hasVoted(voter.votesJson)) {
      votedNames.push(voter.name);
    } else {
      pendingNames.push(voter.name);
    }
  });

  const headerLine = `📅 ${poll.title} (${votedNames.length}/${voterEntries.length} gestemd)`;

  const gridLines = dateEntries.map(([dateId, info]) => {
    const valuesForDate = voterEntries.map(([, voter]) => parseVotes(voter.votesJson)[dateId] || 'none');
    const squares = valuesForDate.map((value) => VOTE_EMOJI[value] || VOTE_EMOJI.none).join('');
    const yesCount = valuesForDate.filter((value) => value === 'yes').length;
    const isChosen = poll.status === 'closed' && poll.finalDateId === dateId;
    return `${formatDateKeyShort(dateId)}${info.time ? ` ${info.time}` : ''}  ${squares} (${yesCount})${
      isChosen ? ' ✅ gekozen' : ''
    }`;
  });

  const peopleLine = [
    `👥 ${votedNames.length > 0 ? votedNames.join(', ') : 'nog niemand'}`,
    pendingNames.length > 0 ? `(⏳ ${pendingNames.join(', ')})` : '',
  ]
    .filter(Boolean)
    .join(' ');

  const linkLine = `👉 Stem mee: ${pollUrl}`;

  return [headerLine, '', ...gridLines, '', peopleLine, linkLine].join('\n');
}
