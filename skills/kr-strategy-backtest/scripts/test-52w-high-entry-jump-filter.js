#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  shouldExcludeNewEntry,
  chooseTarget,
} = require('./analyze-52w-high-entry-jump-filter.js');

assert.strictEqual(shouldExcludeNewEntry(0.2499, 0.25), false, '+24.99% must remain eligible');
assert.strictEqual(shouldExcludeNewEntry(0.25, 0.25), true, '+25.00% must be excluded inclusively');
assert.strictEqual(shouldExcludeNewEntry(0.2845, 0.25), true, '+28.45% must be excluded');
assert.strictEqual(shouldExcludeNewEntry(2.0, null), false, 'disabled filter must allow every finite return');

function state(open) {
  return { bars: [{ date: '2026-01-02', open: 100, high: 100, low: 100, close: 100 }, { date: '2026-01-05', open, high: open, low: open, close: open }] };
}

const rows = [];
for (let rank = 1; rank <= 20; rank++) {
  const ticker = rank === 20 ? 'HELD' : `N${String(rank).padStart(2, '0')}`;
  rows.push({
    ticker,
    name: ticker,
    rank,
    oneDayReturn: rank === 1 ? 0.25 : (rank === 20 ? 0.30 : 0.01),
    signalClose: 100,
    previousTradingDate: '2025-12-30',
    previousTradingClose: 80,
  });
}
const states = new Map(rows.map(row => [row.ticker, state(row.rank * 1000)]));
const ctx = { states, allCalendar: ['2026-01-02', '2026-01-05'] };
const order = { signalDate: '2026-01-02', executionDate: '2026-01-05', rankedRows: rows };
const positions = new Map([['HELD', 1]]);

const filtered = chooseTarget(ctx, order, positions, 0.25, 1);
assert.strictEqual(filtered.target.length, 15, 'excluded slot must be filled');
assert(filtered.target.includes('HELD'), 'incumbent inside rank 45 must survive even after a +30% day');
assert(!filtered.target.includes('N01'), 'exact +25% new candidate must be excluded');
assert(filtered.target.includes('N15'), 'the next ranked candidate must backfill the excluded slot');
assert.strictEqual(filtered.excludedCandidates[0].replacement.ticker, 'N15', 'ledger must identify the portfolio replacement');
assert.strictEqual(filtered.incumbentJumpExemptions[0].ticker, 'HELD', 'incumbent exemption must be auditable');

const alternateOpenStates = new Map(rows.map(row => [row.ticker, state(1000000 - row.rank)]));
const alternateOpen = chooseTarget({ ...ctx, states: alternateOpenStates }, order, positions, 0.25, 1);
assert.deepStrictEqual(alternateOpen.target, filtered.target, 'next-open prices must not influence the signal-date filter decision');

const allowedRows = rows.map(row => row.ticker === 'N01' ? { ...row, oneDayReturn: 0.2499 } : row);
const allowed = chooseTarget(ctx, { ...order, rankedRows: allowedRows }, positions, 0.25, 1);
assert(allowed.target.includes('N01'), '+24.99% candidate must remain in the target');
assert.strictEqual(allowed.excludedCandidates.length, 0, '+24.99% must not create an exclusion ledger row');

const fullPositions = new Map(rows.slice(0, 15).map(row => [row.ticker, 1]));
const noVacancy = chooseTarget(ctx, order, fullPositions, 0.25, 1);
assert.strictEqual(noVacancy.excludedCandidates.length, 0, 'a fully retained portfolio must not screen nonexistent entry slots');
assert.strictEqual(noVacancy.addedByFilter.length, 0, 'a fully retained portfolio must not invent replacement candidates');

console.log('52w-high entry-jump filter tests passed');
