'use strict';

// Official-total-return data contract.  This module intentionally does not
// infer corporate actions from price jumps: each adjustment must be backed by
// an event in the KRX/DART evidence ledger before a strict run may proceed.

const crypto = require('crypto');

const EVENT_TYPES = new Set([
  'stock_split', 'reverse_split', 'capital_reduction', 'rights_issue',
  'cash_dividend', 'stock_dividend', 'merger', 'spin_off', 'ticker_change',
  'delisting',
]);
const sha256 = value => crypto.createHash('sha256').update(Buffer.isBuffer(value) || typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const isDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '');
const positive = value => Number.isFinite(Number(value)) && Number(value) > 0;
const official = source => ['KRX', 'DART'].includes(String(source?.publisher || '').toUpperCase()) && /^https:\/\//.test(source?.url || '') && /^[a-f0-9]{64}$/i.test(source?.sha256 || '');

function eventSecurityIds(event) {
  return [...new Set([event.securityId, event.oldSecurityId, event.newSecurityId, ...(event.securityIds || []), ...(event.consideration || []).map(x => x.securityId)].filter(Boolean))];
}

function assertEvent(event) {
  if (!event || !EVENT_TYPES.has(event.type)) throw new Error(`unsupported corporate action: ${event?.type || 'missing type'}`);
  if (!event.id || !isDate(event.effectiveDate)) throw new Error(`${event.id || event.type}: id and effectiveDate are required`);
  if (event.verificationStatus !== 'verified') throw new Error(`${event.id}: corporate action is not verified`);
  if (!Array.isArray(event.sources) || !['KRX', 'DART'].every(p => event.sources.some(s => String(s.publisher).toUpperCase() === p && official(s)))) throw new Error(`${event.id}: verified KRX and DART source hashes are required`);
  if (!eventSecurityIds(event).length) throw new Error(`${event.id}: securityId is required`);
  const ratioTypes = new Set(['stock_split', 'reverse_split', 'capital_reduction', 'stock_dividend']);
  if (ratioTypes.has(event.type) && !positive(event.shareRatio)) throw new Error(`${event.id}: shareRatio must be positive`);
  if (event.type === 'capital_reduction' && positive(event.cashPerShare) && event.adjustmentFactor === undefined) throw new Error(`${event.id}: cash capital reduction requires an explicit official adjustmentFactor`);
  if (event.type === 'cash_dividend' && !positive(event.cashPerShare)) throw new Error(`${event.id}: cashPerShare must be positive`);
  if (event.type === 'rights_issue' && (!positive(event.rightsPerShare) || !positive(event.subscriptionPrice) || event.participation !== 'fully-subscribed')) throw new Error(`${event.id}: rights issue requires rightsPerShare, subscriptionPrice, and fully-subscribed participation`);
  if (['merger', 'spin_off'].includes(event.type) && (!Array.isArray(event.consideration) || !event.consideration.length)) throw new Error(`${event.id}: ${event.type} requires explicit consideration`);
  if (event.type === 'delisting' && !positive(event.cashPerShare)) throw new Error(`${event.id}: delisting cash consideration is required`);
}

function validateLedger(ledger, relevantSecurityIds = null) {
  if (!ledger || ledger.schemaVersion !== 1 || !Array.isArray(ledger.events)) throw new Error('official corporate-action ledger schemaVersion 1 with events is required');
  const relevant = relevantSecurityIds ? new Set(relevantSecurityIds) : null;
  const ids = new Set();
  for (const event of ledger.events) {
    if (ids.has(event.id)) throw new Error(`duplicate corporate-action id: ${event.id}`);
    ids.add(event.id);
    if (!relevant || eventSecurityIds(event).some(id => relevant.has(id))) assertEvent(event);
  }
  return { ledgerSha256: sha256(ledger), eventCount: ledger.events.length };
}

function eventAdjustmentFactor(event, previousClose) {
  if (event.adjustmentFactor !== undefined) {
    if (!positive(event.adjustmentFactor)) throw new Error(`${event.id}: adjustmentFactor must be positive`);
    return Number(event.adjustmentFactor);
  }
  if (!positive(previousClose)) throw new Error(`${event.id}: prior raw close is required for total-return adjustment`);
  switch (event.type) {
    case 'stock_split': case 'reverse_split': case 'capital_reduction': return 1 / Number(event.shareRatio);
    case 'stock_dividend': return 1 / Number(event.shareRatio);
    case 'cash_dividend': {
      const factor = (previousClose - Number(event.cashPerShare)) / previousClose;
      if (!(factor > 0)) throw new Error(`${event.id}: cash dividend exceeds prior close`);
      return factor;
    }
    case 'rights_issue': {
      const r = Number(event.rightsPerShare), s = Number(event.subscriptionPrice);
      return (previousClose + r * s) / (previousClose * (1 + r));
    }
    // Security succession does not fabricate a price history for the new
    // security.  The execution ledger transfers the actual position instead.
    case 'ticker_change': case 'merger': case 'spin_off': case 'delisting': return 1;
    default: throw new Error(`${event.id}: no adjustment rule`);
  }
}

function buildTotalReturnOHLC(rawOHLC, events, securityId) {
  const raw = [...rawOHLC].map(x => ({ ...x })).sort((a, b) => a.date.localeCompare(b.date));
  if (!raw.length) throw new Error(`${securityId}: no raw OHLC`);
  for (const row of raw) if (!isDate(row.date) || !['open', 'high', 'low', 'close'].every(k => positive(row[k]))) throw new Error(`${securityId}: invalid raw OHLC row ${row.date}`);
  const relevant = events.filter(e => eventSecurityIds(e).includes(securityId));
  const factors = new Array(raw.length).fill(1);
  const references = [];
  for (const event of relevant) {
    const index = raw.findIndex(x => x.date >= event.effectiveDate);
    if (index < 0) continue; // Event is after the requested cache window.
    if (index === 0) throw new Error(`${event.id}: no prior session for corporate-action adjustment`);
    const factor = eventAdjustmentFactor(event, raw[index - 1].close);
    for (let i = 0; i < index; i++) factors[i] *= factor;
    references.push(event.id);
  }
  const totalReturnOHLC = raw.map((row, i) => ({ date: row.date, open: row.open * factors[i], high: row.high * factors[i], low: row.low * factors[i], close: row.close * factors[i], volume: row.volume ?? 0 }));
  const adjustmentFactor = raw.map((row, i) => ({ date: row.date, factor: factors[i] }));
  return { rawOHLC: raw, totalReturnOHLC, adjustmentFactor, eventReferences: references };
}

// Apply events to the *actual* holdings before a session's open.  Price
// adjustment is for signals only; this is the accounting leg that prevents a
// split, dividend, succession, or delisting from disappearing in a backtest.
function applyEventsToPortfolio({ positions, cash, events, date }) {
  const applied = [];
  for (const event of events.filter(e => e.effectiveDate === date)) {
    assertEvent(event);
    const oldId = event.securityId || event.oldSecurityId;
    const shares = positions.get(oldId) || 0;
    if (!shares) continue;
    if (['stock_split', 'reverse_split', 'capital_reduction', 'stock_dividend'].includes(event.type)) {
      positions.set(oldId, shares * Number(event.shareRatio));
      if (event.type === 'capital_reduction' && positive(event.cashPerShare)) cash += shares * Number(event.cashPerShare);
    }
    else if (event.type === 'cash_dividend') cash += shares * Number(event.cashPerShare);
    else if (event.type === 'rights_issue') { positions.set(oldId, shares * (1 + Number(event.rightsPerShare))); cash -= shares * Number(event.rightsPerShare) * Number(event.subscriptionPrice); }
    else if (event.type === 'ticker_change') { positions.delete(oldId); positions.set(event.newSecurityId, (positions.get(event.newSecurityId) || 0) + shares); }
    else if (event.type === 'delisting') { positions.delete(oldId); cash += shares * Number(event.cashPerShare); }
    else {
      positions.delete(oldId);
      for (const leg of event.consideration) {
        if (positive(leg.cashPerShare)) cash += shares * Number(leg.cashPerShare);
        if (leg.securityId && positive(leg.sharesPerOldShare)) positions.set(leg.securityId, (positions.get(leg.securityId) || 0) + shares * Number(leg.sharesPerOldShare));
      }
    }
    applied.push(event.id);
  }
  return { cash, applied };
}

module.exports = { EVENT_TYPES, sha256, eventSecurityIds, assertEvent, validateLedger, eventAdjustmentFactor, buildTotalReturnOHLC, applyEventsToPortfolio };
