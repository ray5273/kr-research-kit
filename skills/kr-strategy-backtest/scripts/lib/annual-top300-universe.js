'use strict';

// Point-in-time Top-300 universe contract.  A ranking snapshot dated in year
// t is eligible only during t+1.  Keeping this logic here prevents every
// strategy variant from accidentally falling back to today's constituents.

const fs = require('fs');
const crypto = require('crypto');

const MIN_PRICE_COVERAGE = 0.90;

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function ordinaryShare(row) {
  const ticker = String(row.ticker || row.code || '').padStart(6, '0');
  const name = String(row.name || '');
  const market = String(row.market || '').replace('KOSDAQ GLOBAL', 'KOSDAQ');
  if (!/^\d{6}$/.test(ticker) || !['KOSPI', 'KOSDAQ'].includes(market)) return false;
  // Korean preferred classes are usually suffixed with 우, 1우, 2우B, etc.
  // Merely checking "우선" or "우B" misses ordinary-looking labels such as
  // 삼성전자우, which can otherwise displace a common share in Top-300.
  // Do not use a loose /리츠/ match here.  It rejects 메리츠금융지주 even
  // though it is an ordinary operating-company share.  Korean listed REIT
  // names conventionally *end* in 리츠 (SK리츠, 신한알파리츠, ...); keeping
  // that distinction in one place makes every annual universe reproducible.
  const isReit = /리츠\s*$|\bREIT(?:s)?\b/i.test(name);
  return !/(ETF|ETN|SPAC|스팩|레버리지|인버스|커버드콜)/i.test(name)
    && !isReit
    && !/(우선|[1-3]?우(?:B|C)?$)/.test(name);
}

function normaliseSnapshot(snapshot) {
  const rankingYear = Number(snapshot.rankingYear);
  if (!Number.isInteger(rankingYear)) throw new Error('annual universe snapshot has no integer rankingYear');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshot.asOfDate || '')) throw new Error(`${rankingYear}: invalid asOfDate`);
  if (!String(snapshot.asOfDate).startsWith(String(rankingYear))) throw new Error(`${rankingYear}: asOfDate must be in rankingYear`);
  const raw = Array.isArray(snapshot.constituents) ? snapshot.constituents : [];
  const maxConstituents = Number(snapshot.maxConstituents ?? 300);
  if (!Number.isInteger(maxConstituents) || maxConstituents < 1) throw new Error(`${rankingYear}: invalid maxConstituents`);
  const seen = new Set();
  const constituents = raw.filter(ordinaryShare).map(x => ({
    ticker: String(x.ticker || x.code).padStart(6, '0'), name: String(x.name),
    market: String(x.market).replace('KOSDAQ GLOBAL', 'KOSDAQ'), rank: Number(x.rank),
    marketCap: x.marketCap === null || x.marketCap === undefined ? null : Number(x.marketCap),
  })).filter(x => {
    if (seen.has(x.ticker)) return false;
    seen.add(x.ticker);
    return Number.isInteger(x.rank) && x.rank > 0;
  }).sort((a, b) => a.rank - b.rank).slice(0, maxConstituents);
  return {
    rankingYear, asOfDate: snapshot.asOfDate, rawTop300Count: Number(snapshot.rawTop300Count ?? raw.length),
    commonShareCount: constituents.length, maxConstituents, sourceSha256: String(snapshot.sourceSha256 || ''),
    constituents,
  };
}

function loadAnnualUniverse(file) {
  const text = fs.readFileSync(file, 'utf8');
  const raw = JSON.parse(text);
  const snapshots = (raw.snapshots || []).map(normaliseSnapshot).sort((a, b) => a.rankingYear - b.rankingYear);
  const years = new Set();
  for (const x of snapshots) {
    if (years.has(x.rankingYear)) throw new Error(`duplicate annual universe snapshot: ${x.rankingYear}`);
    years.add(x.rankingYear);
    if (!x.sourceSha256) throw new Error(`${x.rankingYear}: sourceSha256 is required`);
  }
  return { schemaVersion: raw.schemaVersion || 1, source: raw.source || null, sourceSha256: sha256(text), snapshots, byYear: new Map(snapshots.map(x => [x.rankingYear, x])) };
}

function rankingYearForSignal(signalDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(signalDate || '')) throw new Error(`invalid signal date: ${signalDate}`);
  return Number(signalDate.slice(0, 4)) - 1;
}

function snapshotForSignal(universe, signalDate) {
  const rankingYear = rankingYearForSignal(signalDate);
  const snapshot = universe.byYear.get(rankingYear);
  if (!snapshot) throw new Error(`${signalDate}: missing prior-year Top-300 snapshot (${rankingYear})`);
  return snapshot;
}

function eligibleTickers(universe, signalDate) {
  return new Set(snapshotForSignal(universe, signalDate).constituents.map(x => x.ticker));
}

function universeUnion(universe) {
  return new Set(universe.snapshots.flatMap(x => x.constituents.map(c => c.ticker)));
}

function coverageLedger(universe, hasUsablePrice, hasDart = () => true) {
  return universe.snapshots.map(snapshot => {
    const priceAvailable = snapshot.constituents.filter(x => hasUsablePrice(x.ticker, snapshot)).length;
    const dartAvailable = snapshot.constituents.filter(x => hasDart(x.ticker, snapshot)).length;
    const priceCoverage = snapshot.commonShareCount ? priceAvailable / snapshot.commonShareCount : 0;
    return {
      rankingYear: snapshot.rankingYear, asOfDate: snapshot.asOfDate,
      rawTop300Count: snapshot.rawTop300Count, commonShareCount: snapshot.commonShareCount,
      priceAvailable, priceCoverage, dartAvailable,
      priceCoveragePass: priceCoverage >= MIN_PRICE_COVERAGE,
    };
  });
}

function assertPriceCoverage(ledger) {
  const failures = ledger.filter(x => !x.priceCoveragePass);
  if (failures.length) throw new Error(`annual Top-300 price coverage below 90%: ${failures.map(x => `${x.rankingYear}=${(x.priceCoverage * 100).toFixed(1)}%`).join(', ')}`);
}

function isAnnualRollDate(calendar, index) {
  if (index <= 0) return false;
  return calendar[index].slice(0, 4) !== calendar[index - 1].slice(0, 4);
}

module.exports = {
  MIN_PRICE_COVERAGE, ordinaryShare, normaliseSnapshot, loadAnnualUniverse,
  rankingYearForSignal, snapshotForSignal, eligibleTickers, universeUnion,
  coverageLedger, assertPriceCoverage, isAnnualRollDate,
};
