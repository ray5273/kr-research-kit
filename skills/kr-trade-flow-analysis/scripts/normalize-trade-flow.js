#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function usage() {
  return `Usage: node normalize-trade-flow.js --source customs|kita|un-comtrade|manual --input file.csv --output out.json [--source-label label] [--source-url url]`;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (quoted) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") {
      cell += ch;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((r) => r.some((value) => String(value).trim() !== ""));
}

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^\uFEFF/, "")
    .replace(/\s+/g, "_")
    .replace(/[()]/g, "")
    .replace(/[./-]/g, "_");
}

function rowObjects(csvRows) {
  if (csvRows.length < 2) return [];
  const headers = csvRows[0].map(normalizeHeader);
  return csvRows.slice(1).map((row) => {
    const object = {};
    headers.forEach((header, index) => {
      object[header] = row[index] == null ? "" : String(row[index]).trim();
    });
    return object;
  });
}

function pick(row, names) {
  for (const name of names) {
    const key = normalizeHeader(name);
    if (row[key] != null && row[key] !== "") return row[key];
  }
  return "";
}

function numberValue(value) {
  if (value == null || value === "") return null;
  const cleaned = String(value).replace(/,/g, "").trim();
  if (cleaned === "" || cleaned === "-") return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizePeriod(value) {
  const raw = String(value || "").trim();
  const compact = raw.replace(/[./]/g, "-");
  const yyyymm = compact.match(/^(\d{4})-?(\d{2})$/);
  if (yyyymm) return `${yyyymm[1]}-${yyyymm[2]}`;
  const date = compact.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (date) return `${date[1]}-${date[2].padStart(2, "0")}`;
  return raw;
}

function normalizeDirection(value, sourceType) {
  const raw = String(value || "").trim().toLowerCase();
  if (/수출|export|exports|x/i.test(raw)) return "export";
  if (/수입|import|imports|m/i.test(raw)) return "import";
  return sourceType === "manual" ? "" : "export";
}

function normalizeRow(row, sourceType, defaults, index) {
  const period = normalizePeriod(pick(row, ["period", "기간", "년월", "month", "refperiodid", "ref_period_id", "date"]));
  const hsCode = pick(row, ["hs_code", "hscode", "hs", "품목번호", "품목코드", "commodity_code", "cmdcode", "cmd_code"]);
  const partner = pick(row, ["partner", "상대국", "국가", "country", "partnerdesc", "partner_desc", "destination"]);
  const reporter = pick(row, ["reporter", "reporterdesc", "reporter_desc", "수출국", "origin"]) || defaults.reporter || "Korea";
  const direction = normalizeDirection(pick(row, ["direction", "flow", "flowdesc", "flow_desc", "trade_flow", "수출입구분"]), sourceType);
  const valueUsd = numberValue(pick(row, ["value_usd", "tradevalue", "trade_value", "primaryvalue", "primary_value", "fobvalue", "fob_value", "금액", "수출금액", "value"]));
  const quantity = numberValue(pick(row, ["quantity", "qty", "수량", "중량", "weight", "netweight", "net_weight"]));
  const unit = pick(row, ["unit", "quantity_unit", "qtyunit", "qtyunitabbr", "qty_unit_abbr", "단위"]) || (quantity == null ? "" : "unknown");

  return {
    rowId: `${sourceType}-${String(index + 1).padStart(4, "0")}`,
    period,
    reporter,
    partner,
    direction,
    hsCode: String(hsCode || "").replace(/\D/g, "") || String(hsCode || ""),
    valueUsd,
    quantity,
    unit,
    sourceType,
    sourceLabel: defaults.sourceLabel || sourceType,
    sourceUrl: defaults.sourceUrl || "",
    notes: pick(row, ["notes", "note", "비고"]),
  };
}

function validateRows(rows) {
  const errors = [];
  rows.forEach((row, index) => {
    if (!row.period) errors.push(`row ${index + 1}: missing period`);
    if (!row.hsCode) errors.push(`row ${index + 1}: missing HS code`);
    if (!row.partner) errors.push(`row ${index + 1}: missing partner/country`);
    if (row.valueUsd == null && row.quantity == null) errors.push(`row ${index + 1}: missing both value and quantity`);
  });
  return errors;
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(usage());
    return;
  }

  const sourceType = args.source || args["source-type"];
  if (!sourceType || !["customs", "kita", "un-comtrade", "manual"].includes(sourceType)) {
    console.error(`Invalid --source.\n${usage()}`);
    process.exit(1);
  }
  if (!args.input || !args.output) {
    console.error(`Missing --input or --output.\n${usage()}`);
    process.exit(1);
  }

  const text = fs.readFileSync(args.input, "utf8");
  const objects = rowObjects(parseCsv(text));
  const rows = objects.map((row, index) =>
    normalizeRow(row, sourceType, {
      reporter: args.reporter,
      sourceLabel: args["source-label"],
      sourceUrl: args["source-url"],
    }, index)
  );
  const errors = validateRows(rows);
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exit(1);
  }

  const output = {
    schemaVersion: "kr-trade-flow-data.v1",
    generatedAt: new Date().toISOString(),
    sourceType,
    sourceFile: path.relative(process.cwd(), args.input),
    sourceLabel: args["source-label"] || sourceType,
    sourceUrl: args["source-url"] || "",
    rowCount: rows.length,
    rows,
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${JSON.stringify(output, null, 2)}\n`);
}

if (require.main === module) {
  main();
}

module.exports = { parseCsv, normalizeRow, validateRows };
