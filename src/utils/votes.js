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
