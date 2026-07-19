#!/usr/bin/env node
'use strict';

// Finalizes a corporate-action ledger from locally archived official KRX/DART
// source documents.  Acquisition is intentionally separate: this command
// verifies that every cited document is immutable and that every relevant
// economic term has been normalized before a backtest can consume it.

const fs = require('fs');
const path = require('path');
const O = require('./lib/official-total-return.js');
const arg = (name, fallback = null) => { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; };
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));

function main() {
  const inputFile = arg('--input'), outputFile = arg('--out');
  if (!inputFile || !outputFile) throw new Error('usage: --input candidate-corporate-actions.json --out corporate-actions.json');
  const input = read(inputFile), candidates = input.events || input;
  if (!Array.isArray(candidates)) throw new Error('input must be an events array or { events: [] }');
  const events = candidates.map(event => ({ ...event, sources: (event.sources || []).map(source => {
    if (!source.archiveFile) throw new Error(`${event.id}: source archiveFile is required`);
    const archiveFile = path.resolve(path.dirname(inputFile), source.archiveFile);
    if (!fs.existsSync(archiveFile)) throw new Error(`${event.id}: missing archived source ${archiveFile}`);
    const sha256 = O.sha256(fs.readFileSync(archiveFile));
    if (source.sha256 && source.sha256 !== sha256) throw new Error(`${event.id}: archived source hash mismatch for ${source.url}`);
    return { publisher: source.publisher, url: source.url, retrievedAt: source.retrievedAt, sha256, archiveFile: path.relative(path.dirname(outputFile), archiveFile) };
  }) }));
  const ledger = { schemaVersion: 1, generatedAt: new Date().toISOString(), methodology: 'KRX and DART archived-source cross-check; no price-jump inference', events };
  O.validateLedger(ledger);
  fs.mkdirSync(path.dirname(outputFile), { recursive: true }); fs.writeFileSync(outputFile, JSON.stringify(ledger, null, 2) + '\n');
  console.log(JSON.stringify({ out: outputFile, eventCount: events.length, sha256: O.sha256(ledger) }, null, 2));
}
if (require.main === module) main();
module.exports = { main };
