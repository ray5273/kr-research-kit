#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..', '..');
const strategyRoot = path.join(root, 'analysis-example/us-market/strategies');
const inputs = [
  { label: '편도 10bp', cost: 0.001, dir: 'us-minervini-momentum-annual-free-ytd' },
  { label: '편도 20bp', cost: 0.002, dir: 'us-minervini-momentum-annual-free-ytd-fee20bp' },
  { label: '편도 30bp', cost: 0.003, dir: 'us-minervini-momentum-annual-free-ytd-fee30bp' },
];
const principals = [10000000, 50000000, 100000000, 500000000];
const deduction = 2500000;
const taxRate = 0.22;
const pct = value => `${(value * 100).toFixed(2)}%`;
const won = value => `${Math.round(value).toLocaleString('ko-KR')}원`;
const scenarios = inputs.map(input => {
  const file = path.join(strategyRoot, input.dir, 'weekly-annual-ranked-price-only-hysteresis-free-partial-2026-07-16.json');
  const result = JSON.parse(fs.readFileSync(file, 'utf8'));
  const endEquity = result.dailyEquity.at(-1).equity;
  const holdings = result.finalHoldings.reduce((sum, x) => sum + x.value, 0);
  const startingEquity = result.dailyEquity[0].equity;
  const exitCost = holdings * input.cost;
  const liquidatedReturn = (endEquity - exitCost) / startingEquity - 1;
  return {
    ...input,
    sourceFile: path.relative(strategyRoot, file),
    preLiquidationReturn: result.fullPeriod.strategy.totalReturn,
    liquidatedReturn,
    exitCostFraction: exitCost / startingEquity,
    turnover: result.fullPeriod.turnover,
    maxDrawdown: result.fullPeriod.strategy.maxDrawdown,
    afterTax: principals.map(principal => {
      const profit = principal * liquidatedReturn;
      const tax = Math.max(0, profit - deduction) * taxRate;
      return { principal, preTaxProfit: profit, tax, afterTaxProfit: profit - tax, afterTaxReturn: (profit - tax) / principal };
    }),
  };
});
const practical = scenarios[1];
const output = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  period: '2026-01-02 to 2026-07-16',
  strategy: 'Weekly Minervini price momentum; 2026 starts in cash to avoid the stale STX position from the 2025 portfolio.',
  assumptions: {
    tax: 'Full liquidation on 2026-07-16; KRW/USD-neutral approximation; annual net gain is assumed equal to the fully liquidated portfolio profit; Korean overseas-stock capital-gains basic deduction KRW 2.5m then 22% combined tax.',
    costs: 'One-way all-in transaction-cost sensitivity. It replaces, rather than adds to, the original 10bp one-way model cost. It includes no separately modeled USD/KRW conversion spread.',
    excluded: 'Actual daily KRW conversion, tax-lot method, other 2026 capital gains/losses, dividend withholding/tax, and broker-specific commission/FX schedule.',
  },
  scenarios,
};
const costRows = scenarios.map(s => `|${s.label}|${pct(s.preLiquidationReturn)}|${pct(s.exitCostFraction)}|${pct(s.liquidatedReturn)}|${pct(s.maxDrawdown)}|${s.turnover.toFixed(2)}x|`).join('\n');
const taxRows = practical.afterTax.map(x => `|${won(x.principal)}|${won(x.preTaxProfit)}|${won(x.tax)}|${won(x.afterTaxProfit)}|${pct(x.afterTaxReturn)}|`).join('\n');
const markdown = `# 미국 주간 모멘텀 2026 YTD — 한국 투자자 비용·세후 시나리오\n\n> 2026-01-02 현금에서 시작해 2026-07-16에 모든 보유 종목을 청산한다고 가정한 계산이다. 기존 2025년 포트폴리오에서 이월된 STX 가격 결측은 제거했다.\n\n## 비용 민감도\n\n|가정한 편도 올인 비용|청산 전 수익률|마지막 청산 비용|청산 후·세전 수익률|MDD|누적 회전율|\n|---|---:|---:|---:|---:|---:|\n${costRows}\n\n- 기존 결과는 편도 10bp였다. 미국 브로커 수수료·호가 스프레드·시장충격을 넓게 잡은 **편도 20bp**의 경우, 최종 청산 후 세전 수익률은 ${pct(practical.liquidatedReturn)}다.\n- USD/KRW 환전 수수료·스프레드는 실제로는 최초 환전과 원화 환전 시점, 증권사 우대율에 따라 별도 발생한다. 위 ‘올인 비용’은 이를 거래비용에 보수적으로 대입한 민감도일 뿐, 특정 증권사 견적이 아니다.\n\n## 양도소득세를 반영한 예시 — 편도 20bp\n\n|투자 원금|청산 후 세전 이익|양도세 적립액|세후 이익|세후 수익률|\n|---:|---:|---:|---:|---:|\n${taxRows}\n\n계산식은 ‘세금 = max(0, 청산 후 세전 이익 − 2,500,000원) × 22%’다. 같은 해 다른 해외주식·국내 과세대상 주식의 손익, 실제 원화 환산손익, 세금상 비용이 있으면 결과가 달라진다.\n\n## 세금·데이터 한계\n\n- 한국 거주자의 해외주식 양도소득은 연 250만원 기본공제 후 계산한다. 소득세법상 일반 주식 양도소득 세율은 20%이며, 개인지방소득세는 산출 소득세의 10%로 신고서에 표시된다.\n- 위 표는 **전량 청산 시나리오**이므로 미실현 손익까지 2026년 이익으로 본다. 실제 세금은 그 해 매도한 종목의 원화 기준 취득·양도가와 필요경비, 다른 손익통산에 따라 산출한다.\n- Yahoo 수정주가의 배당 반영은 미국 원천징수·한국의 배당 과세를 정확히 재현하지 않는다. 배당 및 연간 금융소득 상황은 별도 세무 검토가 필요하다.\n\n## 공식 근거\n\n- [소득세법 제103조: 양도소득 기본공제](https://law.go.kr/lsLawLinkInfo.do?chrClsCd=010202&lsJoLnkSeq=1000383716)\n- [소득세법 제104조: 일반 주식 양도소득 세율 20%](https://www.law.go.kr/LSW/lsInfoP.do?ancYnChk=0&chrClsCd=010202&efYd=20260102&joNo=005104&lsiSeq=276127&urlMode=lsInfoP)\n- [국세청 2026년 양도소득세 신고 안내: 국외주식 포함](https://nts.go.kr/nts/na/ntt/selectNttInfo.do?bbsId=1028&mi=2201&nttSn=1350890)\n\n- [시나리오 JSON](korean-net-ytd-scenarios-2026-07-16.json)\n`;

const outDir = path.join(strategyRoot, 'us-minervini-momentum-annual-free-ytd-net');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'korean-net-ytd-scenarios-2026-07-16.json'), JSON.stringify(output, null, 2));
fs.writeFileSync(path.join(outDir, 'korean-net-ytd-scenarios-2026-07-16.md'), markdown);
console.log(path.join(outDir, 'korean-net-ytd-scenarios-2026-07-16.md'));
