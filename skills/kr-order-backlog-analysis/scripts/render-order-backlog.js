#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { spawnSync } = require("child_process");

const BASIS_LABELS = {
  "official-revenue-schedule": "OFFICIAL REVENUE SCHEDULE",
  "official-contract-end-year": "OFFICIAL BACKLOG BY END YEAR",
  "contract-disclosure-maturity-proxy": "CONTRACT MATURITY PROXY - NOT OFFICIAL BACKLOG",
  "official-total-only": "OFFICIAL TOTAL - YEAR NOT DISCLOSED",
};

const COLORS = {
  background: [248, 250, 252, 255],
  panel: [255, 255, 255, 255],
  ink: [30, 41, 59, 255],
  muted: [100, 116, 139, 255],
  grid: [226, 232, 240, 255],
  official: [37, 99, 235, 255],
  officialEnd: [13, 148, 136, 255],
  proxy: [217, 119, 6, 255],
  totalOnly: [100, 116, 139, 255],
  undated: [148, 163, 184, 255],
  cumulative: [225, 29, 72, 255],
};

const FONT = {
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  ",": ["00000", "00000", "00000", "00000", "01100", "01100", "01000"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  "/": ["00001", "00010", "00100", "01000", "10000", "00000", "00000"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  "A": ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  "B": ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  "C": ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  "D": ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  "E": ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  "F": ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  "G": ["01111", "10000", "10000", "10111", "10001", "10001", "01111"],
  "H": ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  "I": ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  "J": ["00111", "00010", "00010", "00010", "10010", "10010", "01100"],
  "K": ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  "L": ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  "M": ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  "N": ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  "O": ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  "P": ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  "Q": ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  "R": ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  "S": ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  "T": ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  "U": ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  "V": ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  "W": ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  "X": ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  "Y": ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  "Z": ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "?": ["01110", "10001", "00001", "00010", "00100", "00000", "00100"],
};

function usage() {
  return [
    "Usage:",
    "  node render-order-backlog.js --input <json> --png-out <png> [--summary-out <json>]",
  ].join("\n");
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }
    if (!token.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }
    const key = token.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${token}`);
    }
    args[key] = value;
    i += 1;
  }
  return args;
}

function isDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function finiteNonNegative(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function extractYear(label) {
  const match = String(label || "").match(/(?:19|20)\d{2}/);
  return match ? Number(match[0]) : null;
}

function validateInput(data) {
  const errors = [];
  if (data.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (!data.company || typeof data.company !== "string") errors.push("company is required");
  if (!data.ticker || typeof data.ticker !== "string") errors.push("ticker is required");
  if (!isDate(data.asOf)) errors.push("asOf must use YYYY-MM-DD");
  if (!data.unit || typeof data.unit !== "string") errors.push("unit is required");
  if (!Object.hasOwn(BASIS_LABELS, data.basis)) errors.push(`unsupported basis: ${data.basis}`);
  if (!data.scope || typeof data.scope !== "string") errors.push("scope is required");
  if (!Array.isArray(data.sources) || data.sources.length === 0) {
    errors.push("sources must contain at least one DART/KRX source");
  } else {
    data.sources.forEach((source, index) => {
      if (!source || typeof source !== "object") {
        errors.push(`sources[${index}] must be an object`);
        return;
      }
      if (!source.title) errors.push(`sources[${index}].title is required`);
      if (!isDate(source.filingDate)) errors.push(`sources[${index}].filingDate must use YYYY-MM-DD`);
      if (!/^https?:\/\//.test(source.url || "")) errors.push(`sources[${index}].url must be http(s)`);
    });
  }
  for (const key of ["officialBacklog", "annualRevenue"]) {
    if (data[key] !== undefined && !finiteNonNegative(data[key])) {
      errors.push(`${key} must be a non-negative finite number`);
    }
  }
  if (
    data.undisclosedAmountContracts !== undefined &&
    (!Number.isInteger(data.undisclosedAmountContracts) || data.undisclosedAmountContracts < 0)
  ) {
    errors.push("undisclosedAmountContracts must be a non-negative integer");
  }
  if (!Array.isArray(data.buckets) || data.buckets.length === 0) {
    errors.push("buckets must contain at least one numeric bucket");
  } else {
    data.buckets.forEach((bucket, index) => {
      if (!bucket || typeof bucket !== "object") {
        errors.push(`buckets[${index}] must be an object`);
        return;
      }
      if (!bucket.label) errors.push(`buckets[${index}].label is required`);
      if (!finiteNonNegative(bucket.amount)) errors.push(`buckets[${index}].amount must be non-negative`);
      if (!new Set(["dated", "undated"]).has(bucket.status)) {
        errors.push(`buckets[${index}].status must be dated or undated`);
      }
      if (bucket.status === "dated" && extractYear(bucket.label) === null) {
        errors.push(`buckets[${index}] dated label must contain a four-digit year`);
      }
      if (
        bucket.contractCount !== undefined &&
        (!Number.isInteger(bucket.contractCount) || bucket.contractCount < 0)
      ) {
        errors.push(`buckets[${index}].contractCount must be a non-negative integer`);
      }
      if (
        bucket.category !== undefined &&
        !new Set(["project", "long-term-service"]).has(bucket.category)
      ) {
        errors.push(`buckets[${index}].category must be project or long-term-service`);
      }
    });
  }
  if (data.capacity !== undefined) {
    if (!data.capacity || typeof data.capacity !== "object") {
      errors.push("capacity must be an object");
    } else {
      if (!data.capacity.display || typeof data.capacity.display !== "string") {
        errors.push("capacity.display is required");
      }
      if (data.capacity.asOf !== undefined && !isDate(data.capacity.asOf)) {
        errors.push("capacity.asOf must use YYYY-MM-DD");
      }
      if (data.capacity.note !== undefined && typeof data.capacity.note !== "string") {
        errors.push("capacity.note must be a string");
      }
      if (data.capacity.sourceUrl !== undefined && !/^https?:\/\//.test(data.capacity.sourceUrl)) {
        errors.push("capacity.sourceUrl must be http(s)");
      }
    }
  }
  if (data.basis === "official-total-only") {
    if (!Array.isArray(data.buckets) || data.buckets.length !== 1 || data.buckets[0].status !== "undated") {
      errors.push("official-total-only requires exactly one undated bucket; synthetic year splits are prohibited");
    }
    if (!finiteNonNegative(data.officialBacklog)) {
      errors.push("official-total-only requires officialBacklog");
    } else if (
      Array.isArray(data.buckets) &&
      data.buckets.length === 1 &&
      finiteNonNegative(data.buckets[0].amount) &&
      Math.abs(data.buckets[0].amount - data.officialBacklog) > Math.max(0.01, data.officialBacklog * 0.0001)
    ) {
      errors.push("official-total-only bucket amount must equal officialBacklog");
    }
  }
  if (data.basis === "contract-disclosure-maturity-proxy") {
    const window = data.disclosureWindow;
    if (!window || !isDate(window.from) || !isDate(window.to)) {
      errors.push("contract-disclosure-maturity-proxy requires disclosureWindow.from/to dates");
    }
  }
  if (errors.length > 0) {
    throw new Error(`Invalid backlog chart input:\n- ${errors.join("\n- ")}`);
  }
}

function normalizeBuckets(buckets) {
  const grouped = new Map();
  for (const bucket of buckets) {
    const year = bucket.status === "dated" ? extractYear(bucket.label) : null;
    const category = bucket.category || (bucket.status === "dated" ? "project" : "undated");
    const key = bucket.status === "dated" ? `dated:${year}:${category}` : "undated:all";
    const current = grouped.get(key) || {
      label: bucket.label,
      year,
      status: bucket.status,
      category,
      amount: 0,
      contractCount: 0,
    };
    current.amount += bucket.amount;
    current.contractCount += bucket.contractCount || 0;
    grouped.set(key, current);
  }
  return [...grouped.values()].sort((left, right) => {
    if (left.status !== right.status) return left.status === "dated" ? -1 : 1;
    if (left.year !== null && right.year !== null) return left.year - right.year;
    return String(left.label).localeCompare(String(right.label), "ko");
  });
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function round(value, digits = 4) {
  const scale = 10 ** digits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function buildSummary(data, buckets, pngPath) {
  const dated = buckets.filter((bucket) => bucket.status === "dated");
  const undated = buckets.filter((bucket) => bucket.status === "undated");
  const projectDated = dated.filter((bucket) => bucket.category !== "long-term-service");
  const bucketAmount = sum(buckets.map((bucket) => bucket.amount));
  const datedAmount = sum(dated.map((bucket) => bucket.amount));
  const projectCumulativeAmount = sum(projectDated.map((bucket) => bucket.amount));
  const undatedAmount = sum(undated.map((bucket) => bucket.amount));
  const officialBacklog = data.officialBacklog ?? null;
  const reconciliationGap = officialBacklog === null ? null : officialBacklog - bucketAmount;
  const coverageRatio =
    officialBacklog !== null && data.annualRevenue > 0 ? officialBacklog / data.annualRevenue : null;
  const warnings = [];
  if (data.basis === "contract-disclosure-maturity-proxy") {
    warnings.push("Individual contract totals by end year are a maturity proxy, not official remaining backlog.");
  }
  if (data.basis === "official-total-only") {
    warnings.push("The filing discloses a total backlog but no defensible yearly allocation.");
  }
  if (reconciliationGap !== null && Math.abs(reconciliationGap) > Math.max(0.01, officialBacklog * 0.0001)) {
    warnings.push("Bucket amounts do not reconcile to the official backlog; do not scale them silently.");
  }
  if ((data.undisclosedAmountContracts || 0) > 0) {
    warnings.push("Contracts with undisclosed amounts are excluded from numeric sums.");
  }
  return {
    schemaVersion: 1,
    chartLanguage: "ko",
    company: data.company,
    ticker: data.ticker,
    asOf: data.asOf,
    basis: data.basis,
    unit: data.unit,
    scope: data.scope,
    officialBacklog,
    annualRevenue: data.annualRevenue ?? null,
    coverageRatio: coverageRatio === null ? null : round(coverageRatio),
    bucketAmount: round(bucketAmount),
    datedAmount: round(datedAmount),
    undatedAmount: round(undatedAmount),
    cumulativeDatedAmount: round(datedAmount),
    projectCumulativeAmount: round(projectCumulativeAmount),
    finalDisclosedYear: dated.length ? Math.max(...dated.map((bucket) => bucket.year)) : null,
    undisclosedAmountContracts: data.undisclosedAmountContracts || 0,
    reconciliationGap: reconciliationGap === null ? null : round(reconciliationGap),
    sourceCount: data.sources.length,
    chartPath: path.resolve(pngPath),
    warnings,
    capacity: data.capacity || null,
    buckets,
  };
}

function renderKoreanChart(data, buckets, summary, pngOut) {
  const renderer = path.join(__dirname, "render-order-backlog-ko.py");
  const payload = JSON.stringify({ data, buckets, summary });
  const candidates = [...new Set([process.env.PYTHON, "python3", "python"].filter(Boolean))];
  const failures = [];
  for (const candidate of candidates) {
    const result = spawnSync(candidate, [renderer, "--png-out", pngOut], {
      input: payload,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    });
    if (result.error && result.error.code === "ENOENT") continue;
    if (result.status === 0) return;
    failures.push(`${candidate}: ${(result.stderr || result.error?.message || "unknown error").trim()}`);
  }
  throw new Error(
    `한글 수주잔고 그래프 생성에 실패했습니다. Pillow와 한글 글꼴을 확인해 주세요.\n${failures.join("\n")}`
  );
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const payload = Buffer.concat([typeBuffer, data]);
  const output = Buffer.alloc(12 + data.length);
  output.writeUInt32BE(data.length, 0);
  typeBuffer.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(payload), 8 + data.length);
  return output;
}

function encodePng(width, height, pixels) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const offset = y * (stride + 1);
    raw[offset] = 0;
    pixels.copy(raw, offset + 1, y * stride, (y + 1) * stride);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function createCanvas(width, height, color) {
  const pixels = Buffer.alloc(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4;
    pixels[offset] = color[0];
    pixels[offset + 1] = color[1];
    pixels[offset + 2] = color[2];
    pixels[offset + 3] = color[3];
  }
  return { width, height, pixels };
}

function setPixel(canvas, x, y, color) {
  const px = Math.round(x);
  const py = Math.round(y);
  if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) return;
  const offset = (py * canvas.width + px) * 4;
  canvas.pixels[offset] = color[0];
  canvas.pixels[offset + 1] = color[1];
  canvas.pixels[offset + 2] = color[2];
  canvas.pixels[offset + 3] = color[3];
}

function fillRect(canvas, x, y, width, height, color) {
  const startX = Math.max(0, Math.floor(x));
  const startY = Math.max(0, Math.floor(y));
  const endX = Math.min(canvas.width, Math.ceil(x + width));
  const endY = Math.min(canvas.height, Math.ceil(y + height));
  for (let py = startY; py < endY; py += 1) {
    for (let px = startX; px < endX; px += 1) setPixel(canvas, px, py, color);
  }
}

function drawLine(canvas, x0, y0, x1, y1, color, thickness = 1) {
  let startX = Math.round(x0);
  let startY = Math.round(y0);
  const endX = Math.round(x1);
  const endY = Math.round(y1);
  const dx = Math.abs(endX - startX);
  const sx = startX < endX ? 1 : -1;
  const dy = -Math.abs(endY - startY);
  const sy = startY < endY ? 1 : -1;
  let error = dx + dy;
  while (true) {
    fillRect(canvas, startX - Math.floor(thickness / 2), startY - Math.floor(thickness / 2), thickness, thickness, color);
    if (startX === endX && startY === endY) break;
    const doubled = 2 * error;
    if (doubled >= dy) {
      error += dy;
      startX += sx;
    }
    if (doubled <= dx) {
      error += dx;
      startY += sy;
    }
  }
}

function drawCircle(canvas, centerX, centerY, radius, color) {
  for (let y = -radius; y <= radius; y += 1) {
    for (let x = -radius; x <= radius; x += 1) {
      if (x * x + y * y <= radius * radius) setPixel(canvas, centerX + x, centerY + y, color);
    }
  }
}

function drawText(canvas, text, x, y, color, scale = 2, align = "left") {
  const normalized = String(text).toUpperCase();
  const glyphWidth = 5 * scale;
  const spacing = scale;
  const width = normalized.length * (glyphWidth + spacing) - spacing;
  let cursorX = align === "center" ? x - width / 2 : align === "right" ? x - width : x;
  for (const character of normalized) {
    const glyph = FONT[character] || FONT["?"];
    for (let row = 0; row < glyph.length; row += 1) {
      for (let column = 0; column < glyph[row].length; column += 1) {
        if (glyph[row][column] === "1") {
          fillRect(canvas, cursorX + column * scale, y + row * scale, scale, scale, color);
        }
      }
    }
    cursorX += glyphWidth + spacing;
  }
}

function formatCompact(value) {
  const absolute = Math.abs(value);
  if (absolute >= 1e9) return `${round(value / 1e9, 1)}B`;
  if (absolute >= 1e6) return `${round(value / 1e6, 1)}M`;
  if (absolute >= 1e3) return `${round(value / 1e3, 1)}K`;
  if (absolute >= 100) return String(round(value, 0));
  if (absolute >= 10) return String(round(value, 1));
  return String(round(value, 2));
}

function niceMaximum(value) {
  if (value <= 0) return 1;
  const exponent = 10 ** Math.floor(Math.log10(value));
  const fraction = value / exponent;
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return niceFraction * exponent;
}

function unitLabel(unit) {
  if (unit === "억원") return "AMOUNT - KRW 100M";
  if (unit === "백만원") return "AMOUNT - KRW 1M";
  if (unit === "원") return "AMOUNT - KRW";
  return `AMOUNT - ${String(unit).replace(/[^A-Za-z0-9 ._-]/g, "") || "DECLARED UNIT"}`;
}

function barColor(basis, status) {
  if (status === "undated") return COLORS.undated;
  if (basis === "official-revenue-schedule") return COLORS.official;
  if (basis === "official-contract-end-year") return COLORS.officialEnd;
  if (basis === "contract-disclosure-maturity-proxy") return COLORS.proxy;
  return COLORS.totalOnly;
}

function renderChart(data, buckets, summary) {
  const canvas = createCanvas(1200, 720, COLORS.background);
  fillRect(canvas, 40, 32, 1120, 650, COLORS.panel);
  drawText(canvas, "ORDER BACKLOG BY YEAR", 70, 58, COLORS.ink, 4);
  drawText(canvas, BASIS_LABELS[data.basis], 70, 105, COLORS.muted, 2);
  drawText(canvas, `${data.ticker}  AS OF ${data.asOf}`, 1130, 68, COLORS.muted, 2, "right");
  drawText(canvas, unitLabel(data.unit), 1130, 105, COLORS.muted, 2, "right");

  const chart = { left: 125, top: 165, width: 990, height: 390 };
  const datedBuckets = buckets.filter((bucket) => bucket.status === "dated");
  let cumulative = 0;
  const cumulativeByBucket = buckets.map((bucket) => {
    if (bucket.status === "dated") cumulative += bucket.amount;
    return bucket.status === "dated" ? cumulative : null;
  });
  const maximum = niceMaximum(
    Math.max(1, ...buckets.map((bucket) => bucket.amount), ...cumulativeByBucket.filter((value) => value !== null))
  );

  for (let step = 0; step <= 5; step += 1) {
    const value = (maximum * step) / 5;
    const y = chart.top + chart.height - (chart.height * step) / 5;
    drawLine(canvas, chart.left, y, chart.left + chart.width, y, COLORS.grid, 1);
    drawText(canvas, formatCompact(value), chart.left - 18, y - 7, COLORS.muted, 2, "right");
  }
  drawLine(canvas, chart.left, chart.top, chart.left, chart.top + chart.height, COLORS.ink, 2);
  drawLine(canvas, chart.left, chart.top + chart.height, chart.left + chart.width, chart.top + chart.height, COLORS.ink, 2);

  const slot = chart.width / buckets.length;
  const barWidth = Math.max(16, Math.min(72, slot * 0.56));
  const points = [];
  buckets.forEach((bucket, index) => {
    const centerX = chart.left + slot * (index + 0.5);
    const height = (bucket.amount / maximum) * chart.height;
    const top = chart.top + chart.height - height;
    fillRect(canvas, centerX - barWidth / 2, top, barWidth, height, barColor(data.basis, bucket.status));
    drawText(canvas, bucket.status === "dated" ? String(bucket.year) : "N/D", centerX, chart.top + chart.height + 18, COLORS.ink, 2, "center");
    drawText(canvas, formatCompact(bucket.amount), centerX, Math.max(chart.top + 4, top - 22), COLORS.ink, 2, "center");
    if (cumulativeByBucket[index] !== null) {
      points.push({
        x: centerX,
        y: chart.top + chart.height - (cumulativeByBucket[index] / maximum) * chart.height,
      });
    }
  });

  if (datedBuckets.length >= 2) {
    for (let index = 1; index < points.length; index += 1) {
      drawLine(canvas, points[index - 1].x, points[index - 1].y, points[index].x, points[index].y, COLORS.cumulative, 4);
    }
    for (const point of points) drawCircle(canvas, point.x, point.y, 6, COLORS.cumulative);
  }

  fillRect(canvas, 125, 615, 24, 14, barColor(data.basis, "dated"));
  drawText(canvas, "PERIOD AMOUNT", 163, 613, COLORS.ink, 2);
  if (datedBuckets.length >= 2) {
    drawLine(canvas, 370, 622, 405, 622, COLORS.cumulative, 4);
    drawCircle(canvas, 387, 622, 5, COLORS.cumulative);
    drawText(canvas, "CUMULATIVE DATED AMOUNT", 420, 613, COLORS.ink, 2);
  }
  if (buckets.some((bucket) => bucket.status === "undated")) {
    fillRect(canvas, 760, 615, 24, 14, COLORS.undated);
    drawText(canvas, "N/D - DATE NOT DISCLOSED", 798, 613, COLORS.ink, 2);
  }

  const totalLabel = `CHART SUM ${formatCompact(summary.bucketAmount)}`;
  const officialLabel =
    summary.officialBacklog === null ? "OFFICIAL TOTAL N/A" : `OFFICIAL TOTAL ${formatCompact(summary.officialBacklog)}`;
  drawText(canvas, totalLabel, 125, 654, COLORS.muted, 2);
  drawText(canvas, officialLabel, 1115, 654, COLORS.muted, 2, "right");
  return encodePng(canvas.width, canvas.height, canvas.pixels);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (!args.input || !args["png-out"]) throw new Error(usage());
  const data = JSON.parse(fs.readFileSync(path.resolve(args.input), "utf8"));
  validateInput(data);
  const buckets = normalizeBuckets(data.buckets);
  const pngOut = path.resolve(args["png-out"]);
  const summary = buildSummary(data, buckets, pngOut);
  fs.mkdirSync(path.dirname(pngOut), { recursive: true });
  renderKoreanChart(data, buckets, summary, pngOut);
  if (args["summary-out"]) {
    const summaryOut = path.resolve(args["summary-out"]);
    fs.mkdirSync(path.dirname(summaryOut), { recursive: true });
    fs.writeFileSync(summaryOut, `${JSON.stringify(summary, null, 2)}\n`);
  }
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
