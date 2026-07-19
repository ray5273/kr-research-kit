#!/usr/bin/env node
// Builds the auditable Excel attachment for the Hermes weekly Top-300 alert.
// The only accepted source is build-weekly-ranking-export-input.js output.
import fs from "node:fs/promises";
import path from "node:path";
import { Workbook, SpreadsheetFile } from "@oai/artifact-tool";

const args = process.argv.slice(2);
const arg = name => { const i = args.indexOf(name); return i < 0 ? null : args[i + 1]; };
const inputPath = arg("--input"), outputPath = arg("--output");
if (!inputPath || !outputPath) throw new Error("Usage: export-weekly-ranking-workbook.mjs --input <full-ranking.json> --output <ranking.xlsx>");

const data = JSON.parse(await fs.readFile(inputPath, "utf8"));
if (data.schemaVersion !== "krx-weekly-ranking-workbook/v1") throw new Error("Unsupported ranking input schema.");
const ranked = [...data.fullRanking].sort((a, b) => a.rank - b.rank);
const required = ["rank", "ticker", "name", "score", "rsPercentile", "fundamentalScore"];
if (ranked.length < 10 || ranked.some((row, i) => row.rank !== i + 1 || required.some(key => row[key] === null || row[key] === undefined))) {
  throw new Error("Input fullRanking must contain contiguous, complete rankings from 1 with at least ten rows.");
}
const excluded = new Set((data.complianceExclusions || []).map(x => String(x.ticker || x).padStart(6, "0")));
if ([...excluded].some(ticker => ranked.some(row => String(row.ticker).padStart(6, "0") === ticker))) throw new Error("A compliance-excluded ticker remains in the ranking.");
const topTen = ranked.slice(0, 10), n = ranked.length, topEnd = 12 + topTen.length, rankingEnd = n + 1;
const pct = value => Number.isFinite(Number(value)) ? Number(value) : null;
const scoreFormat = "0.000", pctFormat = "0.0%;[Red](0.0%);-", dateFormat = "yyyy-mm-dd";
const dark = "#17365D", blue = "#D9EAF7", border = "#D9E2F3", green = "#008000", red = "#C00000";
const workbook = Workbook.create();
const summary = workbook.worksheets.add("Summary"), ranking = workbook.worksheets.add("Full Ranking"), inputs = workbook.worksheets.add("Inputs"), checks = workbook.worksheets.add("Checks"), sources = workbook.worksheets.add("Sources");
for (const sheet of [summary, ranking, inputs, checks, sources]) sheet.showGridLines = false;

// Editable scoring assumptions are separated from the source-score audit.
inputs.getRange("A1:C1").merge();
inputs.getRange("A1").values = [["검증용 입력값"]];
inputs.getRange("A1:C1").format = { fill: dark, font: { bold: true, color: "#FFFFFF" } };
inputs.getRange("A3:C5").values = [["입력", "값", "설명"], ["RS 가중치", 0.5, "소스 스코어와 재계산 비교용"], ["실적 가중치", 0.5, "소스 스코어와 재계산 비교용"]];
inputs.getRange("A3:C3").format = { fill: blue, font: { bold: true }, borders: { preset: "outside", style: "thin", color: border } };
inputs.getRange("A4:B5").format = { borders: { preset: "outside", style: "thin", color: border } };
inputs.getRange("B4:B5").format = { font: { color: "#0000FF" }, numberFormat: [[pctFormat], [pctFormat]] };
inputs.getRange("A7:C8").values = [["스코어식", data.scoreFormula || "0.5 × RS percentile + 0.5 × fundamental percentile", "변경 금지: 전략 소스 정의"], ["소스 원장", data.sourceArtifact || "", "전략 산출물 경로"]];
inputs.getRange("A7:C8").format = { borders: { preset: "outside", style: "thin", color: border }, wrapText: true };

summary.mergeCells("A1:M1");
summary.getRange("A1").values = [["KRX Top 300 주간 포트폴리오 — 전체 순위 및 점수 근거"]];
summary.getRange("A1").format = { fill: dark, font: { bold: true, color: "#FFFFFF", size: 16 }, verticalAlignment: "center" };
summary.getRange("A1:M1").format.rowHeight = 28;
summary.getRange("A3:B9").values = [["기준일", data.asOf || ""], ["신호일", data.signalDate || ""], ["체결일", data.executionDate || ""], ["유니버스", data.universe?.label || "연간 Top 300"], ["후보 수", n], ["컴플라이언스 제외", [...excluded].join(", ") || "없음"], ["점수식", data.scoreFormula || ""]];
summary.getRange("A3:A9").format = { fill: blue, font: { bold: true }, borders: { preset: "outside", style: "thin", color: border } };
summary.getRange("B3:B9").format = { borders: { preset: "outside", style: "thin", color: border }, wrapText: true };
summary.getRange("B3:B5").format.numberFormat = [[dateFormat], [dateFormat], [dateFormat]];
summary.mergeCells("A11:M11"); summary.getRange("A11").values = [["선정 10종목"]]; summary.getRange("A11").format = { fill: dark, font: { bold: true, color: "#FFFFFF" } };
summary.getRange("A12:M12").values = [["순위", "코드", "종목", "종합점수", "RS 백분위", "실적 백분위", "3M", "6M", "12M", "매출 YoY", "EPS YoY", "공시일", "목표비중"]];
summary.getRange("A12:M12").format = { fill: blue, font: { bold: true }, horizontalAlignment: "center", borders: { preset: "all", style: "thin", color: border } };
summary.getRange(`A13:M${topEnd}`).values = topTen.map(row => [row.rank, String(row.ticker).padStart(6, "0"), row.name, pct(row.score), pct(row.rsPercentile), pct(row.fundamentalScore), pct(row.threeMonthReturn), pct(row.sixMonthReturn), pct(row.twelveMonthReturn), pct(row.revenueYoY), pct(row.epsYoY), row.filingDate || "", pct(row.targetWeight)]);
summary.getRange(`D13:K${topEnd}`).format.numberFormat = Array.from({ length: topTen.length }, () => [scoreFormat, scoreFormat, scoreFormat, pctFormat, pctFormat, pctFormat, pctFormat, pctFormat]);
summary.getRange(`L13:L${topEnd}`).format.numberFormat = Array.from({ length: topTen.length }, () => [dateFormat]);
summary.getRange(`M13:M${topEnd}`).format.numberFormat = Array.from({ length: topTen.length }, () => [pctFormat]);
summary.getRange(`A12:M${topEnd}`).format.borders = { preset: "all", style: "thin", color: border };
summary.freezePanes.freezeRows(12);

ranking.getRange("A1:R1").values = [["순위", "코드", "종목", "종합점수", "RS 백분위", "실적 백분위", "재계산", "차이", "3M", "6M", "12M", "매출 YoY", "매출 QoQ", "EPS YoY", "EPS QoQ", "공시일", "대체 사유", "목표비중"]];
ranking.getRange("A1:R1").format = { fill: dark, font: { bold: true, color: "#FFFFFF" }, horizontalAlignment: "center", wrapText: true, borders: { preset: "all", style: "thin", color: border } };
ranking.getRange(`A2:R${rankingEnd}`).values = ranked.map(row => [row.rank, String(row.ticker).padStart(6, "0"), row.name, pct(row.score), pct(row.rsPercentile), pct(row.fundamentalScore), null, null, pct(row.threeMonthReturn), pct(row.sixMonthReturn), pct(row.twelveMonthReturn), pct(row.revenueYoY), pct(row.revenueQoQ), pct(row.epsYoY), pct(row.epsQoQ), row.filingDate || "", row.replacementFor || "", pct(row.targetWeight)]);
ranking.getRange("G2").formulas = [["='Inputs'!$B$4*E2+'Inputs'!$B$5*F2"]]; ranking.getRange(`G2:G${rankingEnd}`).fillDown();
ranking.getRange("H2").formulas = [["=D2-G2"]]; ranking.getRange(`H2:H${rankingEnd}`).fillDown();
ranking.getRange(`D2:H${rankingEnd}`).format.numberFormat = Array.from({ length: n }, () => [scoreFormat, scoreFormat, scoreFormat, scoreFormat, scoreFormat]);
ranking.getRange(`I2:O${rankingEnd}`).format.numberFormat = Array.from({ length: n }, () => [pctFormat, pctFormat, pctFormat, pctFormat, pctFormat, pctFormat, pctFormat]);
ranking.getRange(`P2:P${rankingEnd}`).format.numberFormat = Array.from({ length: n }, () => [dateFormat]); ranking.getRange(`R2:R${rankingEnd}`).format.numberFormat = Array.from({ length: n }, () => [pctFormat]);
ranking.getRange(`A1:R${rankingEnd}`).format.borders = { preset: "all", style: "thin", color: border }; ranking.getRange(`A1:R${rankingEnd}`).format.wrapText = true;
ranking.getRange(`H2:H${rankingEnd}`).conditionalFormats.add("cellIs", { operator: "greaterThan", formula: 0.000001, format: { font: { color: red } } });
ranking.getRange(`H2:H${rankingEnd}`).conditionalFormats.add("cellIs", { operator: "lessThan", formula: -0.000001, format: { font: { color: red } } });
ranking.freezePanes.freezeRows(1); ranking.freezePanes.freezeColumns(3);

checks.getRange("A1:G1").values = [["검증 항목", "실제", "기대", "차이", "허용오차", "상태", "설명"]];
checks.getRange("A1:G1").format = { fill: dark, font: { bold: true, color: "#FFFFFF" }, borders: { preset: "all", style: "thin", color: border } };
checks.getRange("A2:G5").values = [["전체 후보 수", null, n, null, 0, null, "원장 행 수"], ["컴플라이언스 제외 종목 수", null, 0, null, 0, null, "005930 등 명시된 제외 코드"], ["점수 재계산 오류 수", null, 0, null, 0, null, "|종합점수-재계산| > 0.000001"], ["상위 10개 목표비중 합계", null, null, null, 0.000001, null, "목표비중이 제공된 경우에만 검증"]];
checks.getRange("B2").formulas = [[`=COUNTA('Full Ranking'!A2:A${rankingEnd})`]]; checks.getRange("D2").formulas = [["=B2-C2"]]; checks.getRange("F2").formulas = [["=IF(ABS(D2)<=E2,\"OK\",\"FAIL\")"]];
checks.getRange("B3").formulas = [[`=SUM(${[...excluded].map(ticker => `COUNTIF('Full Ranking'!B2:B${rankingEnd},\"${ticker}\")`).join("+") || "0"})`]]; checks.getRange("D3").formulas = [["=B3-C3"]]; checks.getRange("F3").formulas = [["=IF(ABS(D3)<=E3,\"OK\",\"FAIL\")"]];
checks.getRange("B4").formulas = [[`=COUNTIF('Full Ranking'!H2:H${rankingEnd},\">0.000001\")+COUNTIF('Full Ranking'!H2:H${rankingEnd},\"<-0.000001\")`]]; checks.getRange("D4").formulas = [["=B4-C4"]]; checks.getRange("F4").formulas = [["=IF(ABS(D4)<=E4,\"OK\",\"FAIL\")"]];
checks.getRange("B5").formulas = [[`=SUM('Summary'!M13:M${topEnd})`]]; checks.getRange("C5").values = [[topTen.every(row => Number.isFinite(Number(row.targetWeight))) ? topTen.reduce((sum, row) => sum + Number(row.targetWeight), 0) : null]]; checks.getRange("D5").formulas = [["=IF(C5=\"\",0,B5-C5)"]]; checks.getRange("F5").formulas = [["=IF(C5=\"\",\"N/A\",IF(ABS(D5)<=E5,\"OK\",\"FAIL\"))"]];
checks.getRange("A1:G5").format = { borders: { preset: "all", style: "thin", color: border }, wrapText: true }; checks.getRange("B5:E5").format.numberFormat = [[pctFormat, pctFormat, scoreFormat, scoreFormat]];
checks.getRange("F2:F5").conditionalFormats.add("containsText", { text: "OK", format: { fill: "#E2F0D9", font: { bold: true, color: green } } }); checks.getRange("F2:F5").conditionalFormats.add("containsText", { text: "FAIL", format: { fill: "#FCE4D6", font: { bold: true, color: red } } });

sources.getRange("A1:D1").values = [["항목", "출처", "기준", "비고"]]; sources.getRange("A1:D1").format = { fill: dark, font: { bold: true, color: "#FFFFFF" }, borders: { preset: "all", style: "thin", color: border } };
sources.getRange("A2:D5").values = [["가격·RS", "Yahoo 조정가격 캐시", data.signalDate || "", "3/6/12개월, 40/30/30"], ["실적", "DART", data.signalDate || "", "공시 다음 거래일 가용"], ["유니버스", data.universe?.label || "연간 Top 300", data.universe?.snapshotDate || "", "보통주"], ["컴플라이언스", "사용자 지정", "", `${[...excluded].join(", ") || "없음"} 제외 후 순위 산출`]];
sources.getRange("A1:D5").format = { borders: { preset: "all", style: "thin", color: border }, wrapText: true };

for (const [sheet, range] of [[summary, `A1:M${topEnd}`], [ranking, `A1:R${rankingEnd}`], [inputs, "A1:C8"], [checks, "A1:G5"], [sources, "A1:D5"]]) sheet.getRange(range).format.autofitColumns();
summary.getRange(`A1:M${topEnd}`).format.columnWidth = 14; summary.getRange(`C1:C${topEnd}`).format.columnWidth = 16; ranking.getRange(`A1:R${rankingEnd}`).format.columnWidth = 13; ranking.getRange(`C1:C${rankingEnd}`).format.columnWidth = 16; ranking.getRange(`Q1:Q${rankingEnd}`).format.columnWidth = 18; sources.getRange("A1:D5").format.columnWidth = 24;

const inspected = await workbook.inspect({ kind: "table", range: "Full Ranking!A1:R12", include: "values,formulas", tableMaxRows: 12, tableMaxCols: 18 });
if (!inspected.ndjson) throw new Error("Workbook inspection returned no data.");
const errors = await workbook.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A", options: { useRegex: true, maxResults: 100 }, summary: "formula error scan" });
if (errors.ndjson && !/"matches":\[\]/.test(errors.ndjson)) throw new Error(`Workbook contains formula errors: ${errors.ndjson}`);
for (const [sheetName, range] of [["Summary", `A1:M${topEnd}`], ["Full Ranking", `A1:R${Math.min(rankingEnd, 30)}`], ["Inputs", "A1:C8"], ["Checks", "A1:G5"], ["Sources", "A1:D5"]]) {
  const preview = await workbook.render({ sheetName, range, scale: 1.25 });
  if (!preview) throw new Error(`Workbook preview failed for ${sheetName}.`);
}
await fs.mkdir(path.dirname(outputPath), { recursive: true });
const output = await SpreadsheetFile.exportXlsx(workbook); await output.save(outputPath);
console.log(JSON.stringify({ ok: true, output: outputPath, rows: n }, null, 2));
