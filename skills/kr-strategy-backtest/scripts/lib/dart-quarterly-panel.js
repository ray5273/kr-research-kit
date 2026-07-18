'use strict';

// One parser for every DART-dependent backtest.  The OpenDART single-account
// endpoint is not perfectly uniform: IFRS ids, Korean labels and financial
// company income statements differ.  Preserve the selected account metadata so
// a score can always be traced to the actual disclosure field.

const FLOW_KINDS = ['revenue', 'gross', 'net', 'cfo', 'eps'];
const SNAP_KINDS = ['assets', 'liab', 'currentAssets', 'currentLiabilities'];
const ALL_KINDS = [...FLOW_KINDS, ...SNAP_KINDS];

// Version this registry.  It deliberately contains selection rules, not
// invented values: an unmatched financial company remains unavailable for the
// financial ranking rather than being silently compared on another metric.
const FINANCIAL_PROXY_REGISTRY = Object.freeze({
  version: '2026-07-18.1',
  default: [
    { kind: 'revenue', accountIds: ['ifrs-full_Revenue', 'ifrs_Revenue'], names: [/^(매출액|수익\(매출액\)|영업수익|매출)$/] },
  ],
  // Financial statements commonly report these as the top-line performance
  // measure.  Ticker overrides take precedence when a future filing needs it.
  financial: [
    { kind: 'revenue', accountIds: [], names: [/^순이자이익$/, /^보험수익$/, /^영업수익$/, /^이자수익$/] },
  ],
  tickers: {},
});

function num(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function accountMeta(account, kind, metricKind = kind) {
  if (!account) return { direct: null, cumulative: null, metricKind, accountId: null, accountName: null };
  return {
    direct: num(account.thstrm_amount),
    cumulative: num(account.thstrm_add_amount) ?? num(account.thstrm_amount),
    metricKind,
    accountId: account.account_id || null,
    accountName: account.account_nm || null,
  };
}

function metricKindFor(kind, account) {
  if (!account) return null;
  if (kind !== 'revenue') return kind;
  const name = String(account.account_nm || '');
  if (/^순이자이익$/.test(name)) return 'netInterestIncome';
  if (/^보험수익$/.test(name)) return 'insuranceRevenue';
  if (/^영업수익$/.test(name)) return 'operatingRevenue';
  if (/^이자수익$/.test(name)) return 'interestRevenue';
  return 'revenue';
}

function byRank(accounts) {
  return [...accounts].sort((a, b) => {
    const rank = x => String(x.account_id || '').startsWith('ifrs-full_') ? 0 : String(x.account_id || '').startsWith('ifrs_') ? 1 : 2;
    return rank(a) - rank(b) || String(a.account_nm || '').localeCompare(String(b.account_nm || ''));
  });
}

function matchesRule(account, rule) {
  const id = String(account.account_id || ''), name = String(account.account_nm || '');
  return (rule.accountIds || []).includes(id) || (rule.names || []).some(pattern => pattern.test(name));
}

function isFinancialStatement(list) {
  return list.some(a => /^(순이자이익|보험수익)$/.test(String(a.account_nm || '')));
}

function proxyRules(ticker, list) {
  return FINANCIAL_PROXY_REGISTRY.tickers[ticker]?.revenue
    || (isFinancialStatement(list) ? FINANCIAL_PROXY_REGISTRY.financial : FINANCIAL_PROXY_REGISTRY.default);
}

function chooseAccount(list, kind, ticker = '') {
  const accounts = Array.isArray(list) ? list : [];
  if (kind === 'revenue') {
    const rules = proxyRules(ticker, accounts);
    const proxy = accounts.filter(a => rules.some(rule => matchesRule(a, rule)));
    if (proxy.length) return byRank(proxy)[0];
    const standard = accounts.filter(a => {
      const id = String(a.account_id || ''), name = String(a.account_nm || '');
      return !/CostOfSales|OtherRevenue|InvestmentIncome|기타수익|매출원가/.test(`${id}|${name}`)
        && (id === 'ifrs-full_Revenue' || id === 'ifrs_Revenue' || /^(매출액|수익\(매출액\)|영업수익|매출)$/.test(name));
    });
    return byRank(standard)[0] || null;
  }
  const matchers = {
    eps: a => (/BasicEarningsLossPerShare/.test(a.account_id || '') || /기본.*주당.*이익/.test(a.account_nm || '')) && !/Preferred|FromContinuing|FromDiscontinued|우선|희석|중단|계속/.test(`${a.account_id || ''}|${a.account_nm || ''}`),
    gross: a => ['ifrs-full_GrossProfit', 'ifrs_GrossProfit'].includes(a.account_id) || /^매출총이익$/.test(a.account_nm || ''),
    net: a => ['ifrs-full_ProfitLoss', 'ifrs_ProfitLoss'].includes(a.account_id) || /^(당기순이익|당기순이익\(손실\)|분기순이익)$/.test(a.account_nm || ''),
    cfo: a => /CashFlowsFromUsedInOperatingActivities/.test(a.account_id || '') || /영업활동.*현금흐름/.test(a.account_nm || ''),
    assets: a => ['ifrs-full_Assets', 'ifrs_Assets'].includes(a.account_id) || /^자산총계$/.test(a.account_nm || ''),
    liab: a => ['ifrs-full_Liabilities', 'ifrs_Liabilities'].includes(a.account_id) || /^부채총계$/.test(a.account_nm || ''),
    currentAssets: a => ['ifrs-full_CurrentAssets', 'ifrs_CurrentAssets'].includes(a.account_id) || /^유동자산$/.test(a.account_nm || ''),
    currentLiabilities: a => ['ifrs-full_CurrentLiabilities', 'ifrs_CurrentLiabilities'].includes(a.account_id) || /^유동부채$/.test(a.account_nm || ''),
  };
  return byRank(accounts.filter(matchers[kind] || (() => false)))[0] || null;
}

function parseReport({ ticker, fsDiv, response }) {
  const list = response?.list || [];
  const accounts = Object.fromEntries(ALL_KINDS.map(kind => [kind, chooseAccount(list, kind, ticker)]));
  const receipts = list.map(a => a.rcept_no).filter(Boolean).map(String).sort();
  const rawDate = (receipts.at(-1) || '').slice(0, 8);
  if (!/^\d{8}$/.test(rawDate)) return null;
  const filing = `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`;
  const entry = { filing, fsDiv: fsDiv || 'CFS', proxyRegistryVersion: FINANCIAL_PROXY_REGISTRY.version };
  for (const kind of FLOW_KINDS) entry[kind] = accountMeta(accounts[kind], kind, metricKindFor(kind, accounts[kind]));
  for (const kind of SNAP_KINDS) {
    const meta = accountMeta(accounts[kind], kind, metricKindFor(kind, accounts[kind]));
    entry[kind] = { value: meta.direct ?? meta.cumulative, metricKind: meta.metricKind, accountId: meta.accountId, accountName: meta.accountName };
  }
  return entry;
}

function standaloneFlow(report, prior, kind, isAnnual) {
  const current = report[kind];
  if (!current || current.metricKind === null) return { value: null, meta: current || null };
  const source = current.direct ?? current.cumulative;
  const value = isAnnual && prior?.[kind]?.cumulative !== null && current.direct !== null
    ? current.direct - prior[kind].cumulative
    : (current.direct ?? (current.cumulative !== null && prior?.[kind]?.cumulative !== null ? current.cumulative - prior[kind].cumulative : current.cumulative));
  return { value: source === null ? null : value, meta: current };
}

function buildSeries(years, startYear = 2015, endYear = 2026) {
  const out = [];
  for (let year = startYear; year <= endYear; year++) {
    const reports = years.get(year) || new Map();
    const quarters = ['11013', '11012', '11014'];
    const prior = {};
    for (let i = 0; i < quarters.length; i++) {
      const report = reports.get(quarters[i]); if (!report) continue;
      const row = { year, quarter: i + 1, filing: report.filing, fsDiv: report.fsDiv, proxyRegistryVersion: report.proxyRegistryVersion, accounts: {} };
      for (const kind of FLOW_KINDS) { const parsed = standaloneFlow(report, prior, kind, false); row[kind] = parsed.value; row.accounts[kind] = parsed.meta && { metricKind: parsed.meta.metricKind, accountId: parsed.meta.accountId, accountName: parsed.meta.accountName }; }
      for (const kind of SNAP_KINDS) { row[kind] = report[kind]?.value ?? null; row.accounts[kind] = report[kind] && { metricKind: report[kind].metricKind, accountId: report[kind].accountId, accountName: report[kind].accountName }; }
      out.push(row); for (const kind of FLOW_KINDS) prior[kind] = report[kind];
    }
    const annual = reports.get('11011');
    if (annual) {
      const row = { year, quarter: 4, filing: annual.filing, fsDiv: annual.fsDiv, proxyRegistryVersion: annual.proxyRegistryVersion, accounts: {} };
      for (const kind of FLOW_KINDS) { const parsed = standaloneFlow(annual, prior, kind, true); row[kind] = parsed.value; row.accounts[kind] = parsed.meta && { metricKind: parsed.meta.metricKind, accountId: parsed.meta.accountId, accountName: parsed.meta.accountName }; }
      for (const kind of SNAP_KINDS) { row[kind] = annual[kind]?.value ?? null; row.accounts[kind] = annual[kind] && { metricKind: annual[kind].metricKind, accountId: annual[kind].accountId, accountName: annual[kind].accountName }; }
      out.push(row);
    }
  }
  return out.sort((a, b) => a.year - b.year || a.quarter - b.quarter);
}

function sameMetric(current, previous, kind) {
  const currentKind = current?.accounts?.[kind]?.metricKind;
  const previousKind = previous?.accounts?.[kind]?.metricKind;
  return Boolean(currentKind && previousKind && currentKind === previousKind);
}

module.exports = { FLOW_KINDS, SNAP_KINDS, FINANCIAL_PROXY_REGISTRY, num, chooseAccount, parseReport, buildSeries, sameMetric, metricKindFor };
