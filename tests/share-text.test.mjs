import assert from 'node:assert/strict';
import test from 'node:test';
import { buildShareText } from '../src/utils/votes.js';
import { formatProposal } from '../src/utils/dates.js';
import { setLocale } from '../src/i18n/index.js';
setLocale('nl-BE');

const url = 'https://example.test/?poll=test';
const dates = { '2026-11-25': { time: '' }, '2026-11-26': { time: '' } };
const votes = { mark: { name: 'mark', votesJson: '{"2026-11-25":"yes","2026-11-26":"no"}' } };

test('open poll copies the current standing in the existing format', () => {
  assert.equal(buildShareText({ title: 'mark', status: 'open' }, dates, votes, url), [
    '📅 mark (1/1 gestemd)', '',
    `${formatProposal('2026-11-25', '')}  🟩 (1)`,
    `${formatProposal('2026-11-26', '')}  🟥 (0)`, '',
    '👥 mark', `👉 Stem mee: ${url}`,
  ].join('\n'));
});

test('confirmed poll preserves the overview and clearly marks the final date', () => {
  assert.equal(buildShareText({ title: 'mark', status: 'closed', finalDateId: '2026-11-25' }, dates, votes, url), [
    '📅 mark (1/1 gestemd)', '',
    `${formatProposal('2026-11-25', '')}  🟩 (1) ✅ gekozen`,
    `${formatProposal('2026-11-26', '')}  🟥 (0)`, '',
    '👥 mark', `👉 Bekijk de einddatum: ${url}`,
  ].join('\n'));
});

test('final overview remains shareable when nobody has voted', () => {
  const text = buildShareText({ title: 'Uitje', status: 'closed', finalDateId: '2026-11-25' }, dates, {}, url);
  assert.ok(text.startsWith('📅 Uitje (0/0 gestemd)'));
  assert.ok(text.includes('(0) ✅ gekozen'));
  assert.ok(text.includes('👥 nog niemand'));
  assert.ok(text.endsWith(`👉 Bekijk de einddatum: ${url}`));
});

test('English sharing translates the summary while preserving user content', () => {
  setLocale('en-GB');
  try {
    const text = buildShareText({ title: 'Mijn eigen titel', status: 'closed', finalDateId: '2026-11-25' }, dates, votes, url);
    assert.ok(text.startsWith('📅 Mijn eigen titel (1/1 voted)'));
    assert.ok(text.includes('✅ chosen'));
    assert.ok(text.includes('👥 mark'));
    assert.ok(text.endsWith('👉 View the final date: ' + url));
  } finally { setLocale('nl-BE'); }
});
