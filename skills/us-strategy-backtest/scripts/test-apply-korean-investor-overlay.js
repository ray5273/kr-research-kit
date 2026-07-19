#!/usr/bin/env node
'use strict';

const assert = require('assert');
const child = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..');
const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'us-korean-overlay-')), 'result.json');
child.execFileSync(process.execPath, [
  path.join(__dirname, 'apply-korean-investor-overlay.js'),
  '--result', path.join(root, 'fixtures/korean-overlay-result.json'),
  '--fx', path.join(root, 'fixtures/korean-overlay-usdkrw.csv'),
  '--contributions', path.join(root, 'fixtures/korean-overlay-contributions.csv'),
  '--fx-cost', '.001',
  '--out', out,
], { stdio: 'pipe' });
const result = JSON.parse(fs.readFileSync(out, 'utf8'));
assert.equal(result.totalContributedKrw, 110000000);
assert.equal(result.dailyKrwEquity.length, 2);
assert(result.final.grossKrwEquity > 0);
assert(result.final.taxReserveKrw > 0);
assert(result.final.netKrwEquity < result.final.afterFxExitKrwEquity);
console.log('ok: Korean investor overlay applies contribution-date FX, exit FX cost, and 22% tax reserve');
