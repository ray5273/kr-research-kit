#!/usr/bin/env node
'use strict';

// Converts a locally archived official KRX raw-OHLC export plus a dual-sourced
// KRX/DART corporate-action ledger into the only cache accepted by the strict
// total-return runner.  Network collection is deliberately outside this tool:
// the raw source and its hash must be preserved by the data acquisition step.

const fs = require('fs');
const path = require('path');
const O = require('./lib/official-total-return.js');
const arg = (name, fallback = null) => { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; };
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n'); };

function main() {
  const inputFile = arg('--input'), ledgerFile = arg('--event-ledger'), outDir = arg('--out-cache');
  if (!inputFile || !ledgerFile || !outDir) throw new Error('usage: --input official-raw-prices.json --event-ledger corporate-actions.json --out-cache DIR');
  const input = read(inputFile), ledger = read(ledgerFile);
  if (input.schemaVersion !== 1 || !Array.isArray(input.securities)) throw new Error('official raw price input schemaVersion 1 with securities is required');
  const ids = input.securities.map(x => x.securityId);
  if (new Set(ids).size !== ids.length || ids.some(x => !x)) throw new Error('each official raw security requires a unique securityId');
  const validated = O.validateLedger(ledger, ids);
  const index = { schemaVersion: 1, priceMode: 'official-total-return', verificationStatus: 'verified', rawInputSha256: O.sha256(input), eventLedger: { file: path.resolve(ledgerFile), sha256: validated.ledgerSha256, eventCount: validated.eventCount }, securities: [] };
  for (const security of input.securities) {
    if (!security.ticker || !security.market || !Array.isArray(security.rawOHLC) || security.eventVerificationStatus !== 'verified-complete') throw new Error(`${security.securityId}: ticker, market, rawOHLC, and verified-complete event status are required`);
    const bars = O.buildTotalReturnOHLC(security.rawOHLC, ledger.events, security.securityId);
    const output = { schemaVersion: 1, priceMode: 'official-total-return', securityId: security.securityId, ticker: security.ticker, name: security.name || security.ticker, market: security.market, rawOHLC: bars.rawOHLC, totalReturnOHLC: bars.totalReturnOHLC, adjustmentFactor: bars.adjustmentFactor, eventReferences: bars.eventReferences, eventVerificationStatus: 'verified-complete', sourceReferences: security.sourceReferences || [] };
    const file = path.join(outDir, 'securities', `${security.securityId.replace(/[^a-zA-Z0-9._-]/g, '_')}.json`);
    write(file, output);
    index.securities.push({ securityId: output.securityId, ticker: output.ticker, name: output.name, market: output.market, file: path.relative(outDir, file), eventReferences: output.eventReferences, eventVerificationStatus: output.eventVerificationStatus });
  }
  write(path.join(outDir, 'official-total-return-manifest.json'), index);
  console.log(JSON.stringify({ out: outDir, securities: index.securities.length, eventLedgerSha256: index.eventLedger.sha256 }, null, 2));
}
if (require.main === module) main();
module.exports = { main };
