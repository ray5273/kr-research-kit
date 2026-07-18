#!/usr/bin/env node
'use strict';

const assert = require('assert');
const D = require('./lib/dart-quarterly-panel.js');
const C = require('./collect-dart-quarterly-panel.js');

const standard = [
  { account_id: 'ifrs-full_Revenue', account_nm: '수익(매출액)', thstrm_amount: '100', thstrm_add_amount: '100', rcept_no: '20260515000001' },
  { account_id: 'ifrs-full_BasicEarningsLossPerShare', account_nm: '기본주당이익', thstrm_amount: '10', thstrm_add_amount: '10', rcept_no: '20260515000001' },
];
const financial = [
  { account_id: 'dart_NetInterestIncome', account_nm: '순이자이익', thstrm_amount: '80', thstrm_add_amount: '80', rcept_no: '20260515000001' },
  { account_id: 'ifrs-full_BasicEarningsLossPerShare', account_nm: '기본주당이익', thstrm_amount: '5', thstrm_add_amount: '5', rcept_no: '20260515000001' },
];
assert.equal(D.chooseAccount(standard, 'revenue').account_id, 'ifrs-full_Revenue', 'IFRS revenue label variation is recognised');
assert.equal(D.chooseAccount(financial, 'revenue').account_nm, '순이자이익', 'financial proxy registry selects net interest income');

const parsed = D.parseReport({ ticker: '000001', fsDiv: 'CFS', response: { list: standard } });
assert.equal(parsed.revenue.accountId, 'ifrs-full_Revenue', 'selected account id is retained');
assert.equal(parsed.revenue.accountName, '수익(매출액)', 'selected account name is retained');
assert.equal(D.parseReport({ ticker: '000001', fsDiv: 'CFS', response: { list: financial } }).revenue.metricKind, 'netInterestIncome', 'financial proxy kind is recorded');
const q1 = { ...parsed, filing: '2026-05-15' };
const q2 = { ...parsed, filing: '2026-08-15', revenue: { ...parsed.revenue, metricKind: 'insuranceRevenue', direct: 110, cumulative: 210 } };
const rows = D.buildSeries(new Map([[2026, new Map([['11013', q1], ['11012', q2]])]]), 2026, 2026);
assert.equal(D.sameMetric(rows[1], rows[0], 'revenue'), false, 'growth never compares different metric kinds');

assert.equal(C.recordStatus({ attempts: [{ fsDiv: 'CFS', response: { status: '013' } }, { fsDiv: 'OFS', response: { status: '013' } }] }), 'complete-no-data', 'CFS/OFS checked no-data is complete');
assert.equal(C.recordStatus({ attempts: [{ fsDiv: 'CFS', response: { status: '013' } }] }), 'incomplete', 'CFS-only no-data must fall back to OFS');
assert.equal(C.recordStatus({ attempts: [{ fsDiv: 'CFS', error: 'timeout' }] }), 'error', 'network errors stay unresolved');
console.log(JSON.stringify({ pass: true, registry: D.FINANCIAL_PROXY_REGISTRY.version }, null, 2));
