#!/usr/bin/env node
'use strict';

// Rebuild the non-official/Yahoo annual Top-300 suite as one transaction-like
// pipeline.  It refuses to publish a performance artifact before both DART
// and price gates pass.  Strict KRX/DART total-return artifacts are intentionally
// absent from this command.

const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const A = require('./lib/annual-top300-universe.js');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const SCRIPTS = path.join(ROOT, 'skills/kr-strategy-backtest/scripts');
const arg = (name, fallback = null) => { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; };
const run = (script, args, env = process.env) => { const result = cp.spawnSync(process.execPath, [path.join(SCRIPTS, script), ...args], { cwd: ROOT, env, stdio: 'inherit' }); if (result.status !== 0) throw new Error(`${script} failed (${result.status})`); };
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const copy = (source, destination) => { if (!fs.existsSync(source)) return false; fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.copyFileSync(source, destination); return true; };
function assertLedger(file) {
  const universe = A.loadAnnualUniverse(file), years = universe.snapshots.map(row => row.rankingYear);
  if (!years.includes(2015) || !years.includes(2025)) throw new Error(`annual ledger must contain 2015–2025 snapshots: ${file}`);
  return universe;
}
function archiveExisting(outDir, archiveDir, endDate) {
  const names = [
    `annual-top300-momentum-2016-07-11-through-${endDate}.json`, `annual-top300-momentum-2016-07-11-through-${endDate}.md`,
    `annual-top300-minervini-earnings-regime-2016-07-11-through-${endDate}.json`, `annual-top300-minervini-earnings-regime-2016-07-11-through-${endDate}.md`,
    'candidate-coverage-2026-07-13.json', 'candidate-coverage-2026-07-13.csv', 'candidate-coverage-2026-07-13.md',
  ];
  return names.filter(name => copy(path.join(outDir, name), path.join(archiveDir, name)));
}
function main() {
  const universeFile = arg('--universe-file', path.join(ROOT, 'analysis-example/kr-market/strategies/annual-top300/universe-ledger.json'));
  const outDir = arg('--out-dir', path.join(ROOT, 'analysis-example/kr-market/strategies/annual-top300'));
  const cacheDir = arg('--cache-dir', path.join(ROOT, '.tmp/kr-strategy-backtest/2026-07-16'));
  const panelDir = arg('--dart-panel-dir', path.join(ROOT, '.tmp/kr-strategy-backtest/dart-quarterly-panel'));
  const endRequest = arg('--end-date', '2026-07-16');
  const startDate = arg('--start-date', '2016-07-11');
  const archiveDir = arg('--archive-dir', path.join(outDir, 'archive/pre-coverage-rebuild-2026-07-18'));
  const rawWorkbook = arg('--raw-workbook');
  assertLedger(universeFile);

  // Full refresh is intentional.  A cache hit cannot prove the requested
  // historical range/adjustment provenance after a coverage rebuild.
  run('prepare-annual-top300-price-cache.js', ['--universe-file', universeFile, '--cache-dir', cacheDir, '--start-date', '2015-01-01', '--end-date', endRequest, '--refresh-existing', '--include-kospi-index']);
  const manifest = read(path.join(cacheDir, 'annual-top300-price-manifest.json'));
  const endDate = manifest.endDate;
  run('validate-annual-top300-price-cache.js', ['--universe-file', universeFile, '--cache-dir', cacheDir, '--end-date', endDate]);

  // The collector exits non-zero until every required report is 000 or a
  // CFS+OFS-confirmed 013.  It is safe to rerun; incomplete records retry.
  run('collect-dart-quarterly-panel.js', ['--annual-universe-file', universeFile, '--out-dir', panelDir, '--start-year', '2015', '--end-year', String(Number(endDate.slice(0, 4))), '--retries', '3']);
  run('collect-dart-quarterly-panel.js', ['--annual-universe-file', universeFile, '--out-dir', panelDir, '--start-year', '2015', '--end-year', String(Number(endDate.slice(0, 4))), '--verify-only']);

  const archived = archiveExisting(outDir, archiveDir, endDate);
  const momentumStem = `annual-top300-momentum-${startDate}-through-${endDate}`;
  run('run-annual-top300-momentum.js', ['--universe-file', universeFile, '--cache-dir', cacheDir, '--out-dir', outDir, '--start-date', startDate, '--end-date', endDate]);
  run('run-annual-top300-minervini-earnings-regime.js', ['--universe-file', universeFile, '--cache-dir', cacheDir, '--dart-panel-dir', panelDir, '--out-dir', outDir, '--start-date', startDate, '--end-date', endDate, '--benchmark-file', path.join(outDir, `${momentumStem}.json`)]);
  const strategyStem = `annual-top300-minervini-earnings-regime-${startDate}-through-${endDate}`;

  if (rawWorkbook) {
    run('audit-weekly-ranking-candidate-coverage.js', ['--universe-file', universeFile, '--raw-workbook', rawWorkbook, '--output-base', path.join(outDir, 'candidate-coverage-2026-07-13')]);
  }
  const previous = path.join(archiveDir, `annual-top300-minervini-earnings-regime-${startDate}-through-${endDate}.json`);
  const candidateBefore = path.join(archiveDir, 'candidate-coverage-2026-07-13.json');
  const candidateAfter = path.join(outDir, 'candidate-coverage-2026-07-13.json');
  if (fs.existsSync(previous)) run('report-coverage-rebuild-delta.js', ['--before', previous, '--after', path.join(outDir, `${strategyStem}.json`), '--out-base', path.join(outDir, `coverage-rebuild-delta-${endDate}`), ...(fs.existsSync(candidateBefore) && fs.existsSync(candidateAfter) ? ['--before-candidate', candidateBefore, '--after-candidate', candidateAfter] : [])]);
  console.log(JSON.stringify({ ok: true, endDate, archived, outDir, artifacts: [`${momentumStem}.json`, `${strategyStem}.json`], strictOfficialTotalReturnTouched: false }, null, 2));
}
if (require.main === module) { try { main(); } catch (error) { console.error(error.stack || error.message); process.exit(1); } }
