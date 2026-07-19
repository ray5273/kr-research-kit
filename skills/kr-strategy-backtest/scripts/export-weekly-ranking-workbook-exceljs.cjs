#!/usr/bin/env node
'use strict';

// Hermes-compatible XLSX exporter. This is used when the private Codex
// artifact runtime is not provisioned on the remote Hermes host.
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const arg = name => { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1]; };
const inputPath = arg('--input'), outputPath = arg('--output');
if (!inputPath || !outputPath) throw new Error('Usage: export-weekly-ranking-workbook-exceljs.cjs --input <full-ranking.json> --output <ranking.xlsx>');
const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
if (data.schemaVersion !== 'krx-weekly-ranking-workbook/v1') throw new Error('Unsupported ranking input schema.');
const rows = [...(data.fullRanking || [])].sort((a, b) => a.rank - b.rank);
const required = ['rank', 'ticker', 'name', 'score', 'rsPercentile', 'fundamentalScore'];
if (rows.length < 10 || rows.some((row, i) => row.rank !== i + 1 || required.some(key => row[key] === undefined || row[key] === null))) throw new Error('Ranking input is incomplete or non-contiguous.');
const excluded = new Set((data.complianceExclusions || []).map(x => String(x.ticker || x).padStart(6, '0')));
if (rows.some(row => excluded.has(String(row.ticker).padStart(6, '0')))) throw new Error('A compliance-excluded ticker remains in fullRanking.');
for (const row of rows) if (Math.abs(Number(row.score) - (.5 * Number(row.rsPercentile) + .5 * Number(row.fundamentalScore))) > 1e-6) throw new Error(`Score audit failed for ${row.ticker}.`);

const wb = new ExcelJS.Workbook();
wb.creator = 'Hermes'; wb.created = new Date(); wb.calcProperties.fullCalcOnLoad = true; wb.calcProperties.forceFullCalc = true;
const dark = '17365D', blue = 'D9EAF7', border = 'D9E2F3', green = '008000', red = 'C00000';
const pct = '0.0%;[Red](0.0%);-', score = '0.000', date = 'yyyy-mm-dd';
const edge = { style: 'thin', color: { argb: `FF${border}` } };
const tableBorder = { top: edge, left: edge, bottom: edge, right: edge };
const header = cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${dark}` } }; cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; cell.border = tableBorder; };
const section = cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${blue}` } }; cell.font = { bold: true }; cell.border = tableBorder; };
const styleTable = (sheet, start, end, cols) => { for (let row = start; row <= end; row++) for (let col = 1; col <= cols; col++) { const cell = sheet.getCell(row, col); cell.border = tableBorder; cell.alignment = { vertical: 'middle', wrapText: true }; } };
const columnWidths = (sheet, widths) => widths.forEach((width, i) => { sheet.getColumn(i + 1).width = width; });
const top = rows.slice(0, 10), end = rows.length + 1, topEnd = 12 + top.length;

const summary = wb.addWorksheet('Summary', { views: [{ showGridLines: false, state: 'frozen', ySplit: 12 }] });
summary.mergeCells('A1:M1'); summary.getCell('A1').value = 'KRX Top 300 주간 포트폴리오 — 전체 순위 및 점수 근거'; header(summary.getCell('A1')); summary.getRow(1).height = 28; summary.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } }; summary.getCell('A1').alignment = { vertical: 'middle' };
[['기준일', data.asOf || ''], ['신호일', data.signalDate || ''], ['체결일', data.executionDate || ''], ['유니버스', data.universe?.label || '연간 Top 300'], ['후보 수', rows.length], ['컴플라이언스 제외', [...excluded].join(', ') || '없음'], ['점수식', data.scoreFormula || '0.5 × RS percentile + 0.5 × fundamental percentile']].forEach((v, i) => { summary.getCell(i + 3, 1).value = v[0]; summary.getCell(i + 3, 2).value = v[1]; section(summary.getCell(i + 3, 1)); summary.getCell(i + 3, 2).border = tableBorder; });
['B3', 'B4', 'B5'].forEach(ref => { summary.getCell(ref).numFmt = date; });
summary.mergeCells('A11:M11'); summary.getCell('A11').value = '선정 10종목'; header(summary.getCell('A11'));
const topHeaders = ['순위', '코드', '종목', '종합점수', 'RS 백분위', '실적 백분위', '3M', '6M', '12M', '매출 YoY', 'EPS YoY', '공시일', '목표비중']; summary.addRow(topHeaders); summary.getRow(12).eachCell(header);
top.forEach(row => summary.addRow([row.rank, String(row.ticker).padStart(6, '0'), row.name, Number(row.score), Number(row.rsPercentile), Number(row.fundamentalScore), row.threeMonthReturn ?? null, row.sixMonthReturn ?? null, row.twelveMonthReturn ?? null, row.revenueYoY ?? null, row.epsYoY ?? null, row.filingDate || null, row.targetWeight ?? null]));
for (let r = 13; r <= topEnd; r++) { for (let c = 4; c <= 6; c++) summary.getCell(r, c).numFmt = score; for (let c = 7; c <= 11; c++) summary.getCell(r, c).numFmt = pct; summary.getCell(r, 12).numFmt = date; summary.getCell(r, 13).numFmt = pct; } styleTable(summary, 12, topEnd, 13); columnWidths(summary, [8, 11, 16, 11, 11, 11, 11, 11, 11, 11, 11, 13, 12]);

const ranking = wb.addWorksheet('Full Ranking', { views: [{ showGridLines: false, state: 'frozen', xSplit: 3, ySplit: 1 }] });
const rankHeaders = ['순위', '코드', '종목', '종합점수', 'RS 백분위', '실적 백분위', '재계산', '차이', '3M', '6M', '12M', '매출 YoY', '매출 QoQ', 'EPS YoY', 'EPS QoQ', '공시일', '대체 사유', '목표비중']; ranking.addRow(rankHeaders); ranking.getRow(1).eachCell(header);
rows.forEach((row, i) => { const r = i + 2; ranking.addRow([row.rank, String(row.ticker).padStart(6, '0'), row.name, Number(row.score), Number(row.rsPercentile), Number(row.fundamentalScore), { formula: `.5*E${r}+.5*F${r}` }, { formula: `D${r}-G${r}` }, row.threeMonthReturn ?? null, row.sixMonthReturn ?? null, row.twelveMonthReturn ?? null, row.revenueYoY ?? null, row.revenueQoQ ?? null, row.epsYoY ?? null, row.epsQoQ ?? null, row.filingDate || null, row.replacementFor || null, row.targetWeight ?? null]); });
for (let r = 2; r <= end; r++) { for (let c = 4; c <= 8; c++) ranking.getCell(r, c).numFmt = score; for (let c = 9; c <= 15; c++) ranking.getCell(r, c).numFmt = pct; ranking.getCell(r, 16).numFmt = date; ranking.getCell(r, 18).numFmt = pct; } styleTable(ranking, 1, end, 18); columnWidths(ranking, [8, 11, 16, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 13, 18, 12]);
ranking.addConditionalFormatting({ ref: `H2:H${end}`, rules: [{ type: 'expression', formulae: ['ABS(H2)>0.000001'], style: { font: { color: { argb: `FF${red}` } } } }] });

const inputs = wb.addWorksheet('Inputs', { views: [{ showGridLines: false }] }); inputs.mergeCells('A1:C1'); inputs.getCell('A1').value = '검증용 입력값'; header(inputs.getCell('A1')); inputs.addRows([[], ['입력', '값', '설명'], ['RS 가중치', .5, '소스 스코어와 재계산 비교용'], ['실적 가중치', .5, '소스 스코어와 재계산 비교용'], [], ['스코어식', data.scoreFormula || '', '전략 소스 정의'], ['소스 원장', data.sourceArtifact || '', '전략 산출물 경로']]); inputs.getRow(3).eachCell(section); inputs.getCell('B4').numFmt = pct; inputs.getCell('B5').numFmt = pct; inputs.getCell('B4').font = { color: { argb: 'FF0000FF' } }; inputs.getCell('B5').font = { color: { argb: 'FF0000FF' } }; styleTable(inputs, 3, 8, 3); columnWidths(inputs, [20, 28, 36]);

const checks = wb.addWorksheet('Checks', { views: [{ showGridLines: false }] }); checks.addRow(['검증 항목', '실제', '기대', '차이', '허용오차', '상태', '설명']); checks.getRow(1).eachCell(header); checks.addRows([['전체 후보 수', { formula: `COUNTA('Full Ranking'!A2:A${end})` }, rows.length, { formula: 'B2-C2' }, 0, { formula: 'IF(ABS(D2)<=E2,"OK","FAIL")' }, '원장 행 수'], ['컴플라이언스 제외 종목 수', { formula: [...excluded].map(ticker => `COUNTIF('Full Ranking'!B2:B${end},"${ticker}")`).join('+') || '0' }, 0, { formula: 'B3-C3' }, 0, { formula: 'IF(ABS(D3)<=E3,"OK","FAIL")' }, '제외 코드 잔존 여부'], ['점수 재계산 오류 수', { formula: `COUNTIF('Full Ranking'!H2:H${end},">0.000001")+COUNTIF('Full Ranking'!H2:H${end},"<-0.000001")` }, 0, { formula: 'B4-C4' }, 0, { formula: 'IF(ABS(D4)<=E4,"OK","FAIL")' }, '|종합점수-재계산|'], ['상위 10개 목표비중 합계', { formula: `SUM('Summary'!M13:M${topEnd})` }, top.reduce((s, row) => s + Number(row.targetWeight || 0), 0), { formula: 'B5-C5' }, 0.000001, { formula: 'IF(ABS(D5)<=E5,"OK","FAIL")' }, '총 주식 노출과 일치']]); styleTable(checks, 1, 5, 7); for (let r = 2; r <= 5; r++) for (let c = 2; c <= 5; c++) checks.getCell(r, c).numFmt = r === 5 ? pct : score; columnWidths(checks, [24, 14, 14, 14, 14, 12, 28]);

const sources = wb.addWorksheet('Sources', { views: [{ showGridLines: false }] }); sources.addRow(['항목', '출처', '기준', '비고']); sources.getRow(1).eachCell(header); sources.addRows([['가격·RS', 'Yahoo 조정가격 캐시', data.signalDate || '', '3/6/12개월, 40/30/30'], ['실적', 'DART', data.signalDate || '', '공시 다음 거래일 가용'], ['유니버스', data.universe?.label || '연간 Top 300', data.universe?.snapshotDate || '', '보통주'], ['컴플라이언스', '사용자 지정', '', `${[...excluded].join(', ') || '없음'} 제외 후 순위 산출`]]); styleTable(sources, 1, 5, 4); columnWidths(sources, [20, 32, 16, 42]);

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
wb.xlsx.writeFile(outputPath).then(() => console.log(JSON.stringify({ ok: true, output: outputPath, rows: rows.length, excluded: [...excluded] }, null, 2))).catch(error => { console.error(error.stack || error); process.exit(1); });
