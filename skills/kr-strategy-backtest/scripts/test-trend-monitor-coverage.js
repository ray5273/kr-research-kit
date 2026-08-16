#!/usr/bin/env node
// Fixture test for build-trend-monitor-cache.js coverage, driven through the real
// script via KRX_TREND_CACHE. Guards the two gaps that made the LIVE eligibility
// gate narrower than the BACKTEST gate and silently changed the 52w-high target:
//   1. financial statements carry no 매출액 line (banks/insurers vanished),
//   2. retried panel files use {attempts:[{response}]} instead of a bare {response}.
// Run: node skills/kr-strategy-backtest/scripts/test-trend-monitor-coverage.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, 'build-trend-monitor-cache.js');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trend-monitor-coverage-'));
const panel = path.join(root, 'kr-strategy-backtest/dart-quarterly-panel');
fs.mkdirSync(panel, { recursive: true });

const revenue = (name, amount, rcept) => ({ account_id: '-', account_nm: name, thstrm_amount: String(amount), rcept_no: rcept });
const ifrsRevenue = (amount, rcept) => ({ account_id: 'ifrs-full_Revenue', account_nm: '매출액', thstrm_amount: String(amount), rcept_no: rcept });
const eps = (amount, rcept) => ({ account_id: 'ifrs-full_BasicEarningsLossPerShare', account_nm: '기본주당이익', thstrm_amount: String(amount), rcept_no: rcept });

// A. manufacturer, legacy {response} shape
write('100001-2025-11013.json', { response: { status: '000', list: [ifrsRevenue(1000, '20250515000001'), eps(500, '20250515000001')] } });
write('100001-2026-11013.json', { response: { status: '000', list: [ifrsRevenue(1200, '20260515000001'), eps(600, '20260515000001')] } });
// B. insurer (보험수익 only), legacy shape -- financial proxy registry must catch it
write('100002-2025-11013.json', { response: { status: '000', list: [revenue('보험수익', 2000, '20250515000002'), eps(700, '20250515000002')] } });
write('100002-2026-11013.json', { response: { status: '000', list: [revenue('보험수익', 2400, '20260515000002'), eps(800, '20260515000002')] } });
// C. bank (순이자이익 only), newer {attempts} shape -- both fixes needed together
write('100003-2025-11013.json', { attempts: [{ fsDiv: 'CFS', response: { status: '000', list: [revenue('순이자이익', 3000, '20250515000003'), eps(900, '20250515000003')] } }] });
write('100003-2026-11013.json', { attempts: [{ fsDiv: 'CFS', response: { status: '013' } }, { fsDiv: 'OFS', response: { status: '000', list: [revenue('순이자이익', 3300, '20260515000003'), eps(950, '20260515000003')] } }] });
// D. non-financial with no revenue line at all -- must stay excluded
write('100004-2025-11013.json', { response: { status: '000', list: [eps(10, '20250515000004')] } });
write('100004-2026-11013.json', { response: { status: '000', list: [eps(12, '20260515000004')] } });

function write(name, body) { fs.writeFileSync(path.join(panel, name), JSON.stringify(body)); }

// The script writes fundamentals.json before touching the network, so a Yahoo
// failure in an offline environment does not invalidate this assertion.
spawnSync(process.execPath, [SCRIPT], { env: { ...process.env, KRX_TREND_CACHE: root }, encoding: 'utf8' });

const out = path.join(root, 'fundamentals.json');
if (!fs.existsSync(out)) { console.error('FAIL: fundamentals.json was not written'); process.exit(1); }
const byTicker = JSON.parse(fs.readFileSync(out, 'utf8')).byTicker;

const failures = [];
const check = (name, condition) => { console.log((condition ? '  OK  ' : ' FAIL ') + name); if (!condition) failures.push(name); };

check('manufacturer with ifrs-full_Revenue is covered', Boolean(byTicker['100001']));
check('insurer reporting 보험수익 is covered', Boolean(byTicker['100002']));
check('bank reporting 순이자이익 via the attempts schema is covered', Boolean(byTicker['100003']));
check('the successful attempt wins over the failed 013 one', byTicker['100003']?.salesNow === 3300);
check('filing date comes from the newest report', byTicker['100001']?.filingDate === '2026-05-15');
check('a company with no revenue line stays excluded', !byTicker['100004']);

fs.rmSync(root, { recursive: true, force: true });
console.log();
if (failures.length) { console.error(`${failures.length} check(s) failed: ${failures.join(', ')}`); process.exit(1); }
console.log('trend monitor coverage tests passed');
