#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { createKrFontRenderer } = require("./lib/kr-font-renderer");
const {
  normalizeBars: normalizeTechnicalBars,
  requireValidBars: requireValidTechnicalBars,
  buildMetrics: buildTechnicalMetrics,
} = require("./lib/technical-core");

const FONT_5X7 = {
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  "?": ["01110", "10001", "00001", "00110", "00100", "00000", "00100"],
  ".": ["00000", "00000", "00000", "00000", "00000", "00110", "00110"],
  ",": ["00000", "00000", "00000", "00000", "00110", "00110", "00100"],
  ":": ["00000", "00110", "00110", "00000", "00110", "00110", "00000"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  "/": ["00001", "00010", "00100", "01000", "10000", "00000", "00000"],
  "(": ["00010", "00100", "01000", "01000", "01000", "00100", "00010"],
  ")": ["01000", "00100", "00010", "00010", "00010", "00100", "01000"],
  "%": ["11001", "11010", "00100", "01000", "10110", "00110", "00000"],
  "&": ["01100", "10010", "10100", "01000", "10101", "10010", "01101"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "11100"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11100", "10010", "10001", "10001", "10001", "10010", "11100"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01110"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  J: ["00001", "00001", "00001", "00001", "10001", "10001", "01110"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
};

const JAMO_5X5 = {
  "ㄱ": ["11110", "10000", "10000", "10000", "00000"],
  "ㄴ": ["10000", "10000", "10000", "11110", "00000"],
  "ㄷ": ["11110", "10000", "10000", "11110", "00000"],
  "ㄹ": ["11110", "10000", "11110", "00010", "11110"],
  "ㅁ": ["11110", "10010", "10010", "11110", "00000"],
  "ㅂ": ["11110", "10010", "11110", "10010", "11110"],
  "ㅅ": ["00100", "01010", "10001", "00000", "00000"],
  "ㅇ": ["01110", "10001", "10001", "01110", "00000"],
  "ㅈ": ["11111", "00100", "01010", "10001", "00000"],
  "ㅊ": ["00100", "11111", "01010", "10001", "00000"],
  "ㅋ": ["11110", "10000", "11100", "10000", "00000"],
  "ㅌ": ["11110", "10000", "11110", "10000", "11110"],
  "ㅍ": ["10010", "10010", "11110", "10010", "10010"],
  "ㅎ": ["11111", "00100", "01110", "10001", "01110"],
  "ㅏ": ["00100", "00100", "11100", "00100", "00100"],
  "ㅐ": ["01100", "01100", "11100", "01100", "01100"],
  "ㅑ": ["00100", "11100", "00100", "11100", "00100"],
  "ㅒ": ["01100", "11100", "01100", "11100", "01100"],
  "ㅓ": ["00100", "00100", "00111", "00100", "00100"],
  "ㅔ": ["00110", "00110", "00111", "00110", "00110"],
  "ㅕ": ["00100", "00111", "00100", "00111", "00100"],
  "ㅖ": ["00110", "00111", "00110", "00111", "00110"],
  "ㅗ": ["11111", "00100", "00100", "00000", "00000"],
  "ㅛ": ["11111", "01010", "01010", "00000", "00000"],
  "ㅜ": ["00000", "00000", "00100", "00100", "11111"],
  "ㅠ": ["00000", "00000", "01010", "01010", "11111"],
  "ㅡ": ["00000", "00000", "11111", "00000", "00000"],
  "ㅣ": ["00100", "00100", "00100", "00100", "00100"],
};

const HANGUL_BASE = 0xac00;
const HANGUL_END = 0xd7a3;
const HANGUL_INITIALS = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
const HANGUL_MEDIALS = [
  ["ㅏ"], ["ㅐ"], ["ㅑ"], ["ㅒ"], ["ㅓ"], ["ㅔ"], ["ㅕ"], ["ㅖ"], ["ㅗ"], ["ㅗ", "ㅏ"], ["ㅗ", "ㅐ"], ["ㅗ", "ㅣ"],
  ["ㅛ"], ["ㅜ"], ["ㅜ", "ㅓ"], ["ㅜ", "ㅔ"], ["ㅜ", "ㅣ"], ["ㅠ"], ["ㅡ"], ["ㅡ", "ㅣ"], ["ㅣ"],
];
const HANGUL_FINALS = [
  [], ["ㄱ"], ["ㄲ"], ["ㄱ", "ㅅ"], ["ㄴ"], ["ㄴ", "ㅈ"], ["ㄴ", "ㅎ"], ["ㄷ"], ["ㄹ"], ["ㄹ", "ㄱ"], ["ㄹ", "ㅁ"], ["ㄹ", "ㅂ"],
  ["ㄹ", "ㅅ"], ["ㄹ", "ㅌ"], ["ㄹ", "ㅍ"], ["ㄹ", "ㅎ"], ["ㅁ"], ["ㅂ"], ["ㅂ", "ㅅ"], ["ㅅ"], ["ㅆ"], ["ㅇ"], ["ㅈ"], ["ㅊ"], ["ㅋ"], ["ㅌ"], ["ㅍ"], ["ㅎ"],
];
const KR_FONT_RENDERER = createKrFontRenderer();

function parseArgs(argv) {
  const result = {
    chartBars: 120,
    width: 1600,
    height: 1100,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input") {
      result.input = argv[i + 1];
      i += 1;
    } else if (arg === "--png-out") {
      result.pngOut = argv[i + 1];
      i += 1;
    } else if (arg === "--image-path") {
      result.imagePath = argv[i + 1];
      i += 1;
    } else if (arg === "--chart-bars") {
      result.chartBars = Number(argv[i + 1]);
      i += 1;
    } else if (arg === "--width") {
      result.width = Number(argv[i + 1]);
      i += 1;
    } else if (arg === "--height") {
      result.height = Number(argv[i + 1]);
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      result.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return result;
}

function usage() {
  return [
    "Usage:",
    "  node chart-basics.js --input price-history.json [--png-out chart.png] [--image-path relative/path.png] [--chart-bars 120] [--width 1600] [--height 1100]",
    "",
    "Notes:",
    "  - The input JSON must include bars with date and close.",
    "  - high and low are required for Bollinger and Ichimoku overlays to be fully useful.",
    "  - volume is optional but recommended for volume panel and participation read.",
    "  - When --png-out is set, the script writes the main trend chart to that path and sibling overlay, momentum, structure, and pattern charts to *-overlay.png, *-momentum.png, *-structure.png, and *-pattern.png.",
    "  - The structure chart pairs candles with a horizontal volume-by-price gutter (POC highlighted) and ATR-tolerance clustered horizontal support/resistance zones (max 3 each, within ±30% of current price).",
    "  - A sibling *-structure-zones.csv lists every zone including broken/distance-filtered ones (type, zone_low, zone_high, center_price, touch_count, last_touch_date, score, status).",
    "  - The pattern chart overlays recent swing-pivot wave candidates and Fibonacci retracement/extension levels, with a sibling *-pattern-waves.csv for candidate/confidence details.",
    "  - The markdown output prints all five image snippets plus Support / Resistance Zones and Pattern / Wave Candidate tables when PNG output is enabled.",
  ].join("\n");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
}

function requireNamedChartInput(data, options) {
  if (!options.pngOut) {
    return;
  }

  const name = typeof data.name === "string" ? data.name.trim() : "";
  if (!name) {
    throw new Error(
      "PNG chart rendering requires a company name in the input JSON. Pass `--name \"회사명\"` to fetch-kr-chart.js so the PNG title shows the stock name.",
    );
  }
}

function lastFinite(values) {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (Number.isFinite(values[index])) {
      return values[index];
    }
  }
  return null;
}

function formatNumber(value, digits = 2) {
  if (!Number.isFinite(value)) {
    return "-";
  }
  return value.toFixed(digits);
}

function formatInteger(value) {
  if (!Number.isFinite(value)) {
    return "-";
  }
  return Math.round(value).toString();
}

function formatPercentRatio(value, digits = 1) {
  if (!Number.isFinite(value)) {
    return "-";
  }
  return `${(value * 100).toFixed(digits)}%`;
}

function formatAxisNumber(value) {
  if (!Number.isFinite(value)) {
    return "-";
  }
  return Math.round(value).toLocaleString("en-US");
}

function relationLabel(left, right) {
  if (!Number.isFinite(left) || !Number.isFinite(right)) {
    return "insufficient-data";
  }
  if (left > right) {
    return "above";
  }
  if (left < right) {
    return "below";
  }
  return "at";
}

function classifyVolume(volumeRatio) {
  if (!Number.isFinite(volumeRatio)) {
    return "insufficient-data";
  }
  if (volumeRatio >= 1.5) {
    return "heavy";
  }
  if (volumeRatio <= 0.7) {
    return "light";
  }
  return "normal";
}

function classifyRsi(rsiValue) {
  if (!Number.isFinite(rsiValue)) {
    return "insufficient-data";
  }
  if (rsiValue >= 70) {
    return "overbought";
  }
  if (rsiValue <= 30) {
    return "oversold";
  }
  return "neutral";
}

function classifyMacd(macdData, latestIndex) {
  const macdValue = macdData.macd[latestIndex];
  const signalValue = macdData.signal[latestIndex];
  const histogramValue = macdData.histogram[latestIndex];
  const prevMacd = latestIndex > 0 ? macdData.macd[latestIndex - 1] : null;
  const prevSignal = latestIndex > 0 ? macdData.signal[latestIndex - 1] : null;
  const prevHistogram = latestIndex > 0 ? macdData.histogram[latestIndex - 1] : null;

  let crossState = "insufficient-data";
  if ([macdValue, signalValue, prevMacd, prevSignal].every(Number.isFinite)) {
    if (macdValue >= signalValue && prevMacd < prevSignal) {
      crossState = "bullish-cross";
    } else if (macdValue <= signalValue && prevMacd > prevSignal) {
      crossState = "bearish-cross";
    } else if (macdValue > signalValue) {
      crossState = "bullish";
    } else if (macdValue < signalValue) {
      crossState = "bearish";
    } else {
      crossState = "flat";
    }
  }

  let zeroState = "insufficient-data";
  if (Number.isFinite(macdValue)) {
    if (macdValue > 0) {
      zeroState = "above-zero";
    } else if (macdValue < 0) {
      zeroState = "below-zero";
    } else {
      zeroState = "at-zero";
    }
  }

  let histogramState = "insufficient-data";
  if ([histogramValue, prevHistogram].every(Number.isFinite)) {
    const latestMagnitude = Math.abs(histogramValue);
    const prevMagnitude = Math.abs(prevHistogram);
    if (latestMagnitude > prevMagnitude * 1.03) {
      histogramState = "expanding";
    } else if (latestMagnitude < prevMagnitude * 0.97) {
      histogramState = "contracting";
    } else {
      histogramState = "stable";
    }
  }

  return {
    macdValue,
    signalValue,
    histogramValue,
    crossState,
    zeroState,
    histogramState,
  };
}

function classifyAdx(adxData, latestIndex) {
  const adxValue = adxData.adx[latestIndex];
  const plusDiValue = adxData.plusDi[latestIndex];
  const minusDiValue = adxData.minusDi[latestIndex];
  const prevAdx = latestIndex > 0 ? adxData.adx[latestIndex - 1] : null;

  let directionState = "insufficient-data";
  if ([plusDiValue, minusDiValue].every(Number.isFinite)) {
    if (plusDiValue > minusDiValue) {
      directionState = "bullish";
    } else if (plusDiValue < minusDiValue) {
      directionState = "bearish";
    } else {
      directionState = "flat";
    }
  }

  let strengthState = "insufficient-data";
  if (Number.isFinite(adxValue)) {
    if (adxValue >= 25) {
      strengthState = "strong-trend";
    } else if (adxValue >= 20) {
      strengthState = "building-trend";
    } else {
      strengthState = "weak-trend";
    }
  }

  let slopeState = "insufficient-data";
  if ([adxValue, prevAdx].every(Number.isFinite)) {
    if (adxValue > prevAdx + 0.5) {
      slopeState = "rising";
    } else if (adxValue < prevAdx - 0.5) {
      slopeState = "falling";
    } else {
      slopeState = "flat";
    }
  }

  return {
    adxValue,
    plusDiValue,
    minusDiValue,
    directionState,
    strengthState,
    slopeState,
  };
}

function classifyMovingAverageStructure(close, maValues) {
  const { ma5, ma20, ma60, ma120 } = maValues;
  if (![close, ma5, ma20, ma60, ma120].every(Number.isFinite)) {
    return "insufficient-data";
  }
  if (close > ma5 && ma5 > ma20 && ma20 > ma60 && ma60 > ma120) {
    return "strong-bullish";
  }
  if (close < ma5 && ma5 < ma20 && ma20 < ma60 && ma60 < ma120) {
    return "strong-bearish";
  }
  if (close > ma20 && ma20 > ma60 && ma60 > ma120) {
    return "bullish";
  }
  if (close < ma20 && ma20 < ma60 && ma60 < ma120) {
    return "bearish";
  }
  if (close > ma20 && close < ma60) {
    return "rebound-inside-downtrend";
  }
  if (close < ma20 && close > ma60) {
    return "pullback-inside-uptrend";
  }
  return "mixed";
}

function classifyBollinger(latestClose, bollinger, bandwidthMedian60) {
  const upper = lastFinite(bollinger.upper);
  const middle = lastFinite(bollinger.middle);
  const lower = lastFinite(bollinger.lower);
  const bandwidth = lastFinite(bollinger.bandwidth);

  if (![latestClose, upper, middle, lower].every(Number.isFinite)) {
    return {
      state: "insufficient-data",
      bandPosition: null,
      bandwidth,
      bandwidthRegime: "insufficient-data",
      upper,
      middle,
      lower,
    };
  }

  const bandPosition = upper === lower ? 0.5 : (latestClose - lower) / (upper - lower);
  let state = "inside-bands";
  if (latestClose > upper) {
    state = "above-upper-band";
  } else if (latestClose < lower) {
    state = "below-lower-band";
  } else if (bandPosition >= 0.65) {
    state = "upper-half";
  } else if (bandPosition <= 0.35) {
    state = "lower-half";
  } else {
    state = "mid-band";
  }

  let bandwidthRegime = "normal";
  if (!Number.isFinite(bandwidth) || !Number.isFinite(bandwidthMedian60)) {
    bandwidthRegime = "insufficient-data";
  } else if (bandwidth >= bandwidthMedian60 * 1.25) {
    bandwidthRegime = "expanding";
  } else if (bandwidth <= bandwidthMedian60 * 0.8) {
    bandwidthRegime = "contracting";
  }

  return {
    state,
    bandPosition,
    bandwidth,
    bandwidthRegime,
    upper,
    middle,
    lower,
  };
}

function classifyIchimoku(latestClose, ichimoku, barsLength) {
  const latestIndex = barsLength - 1;
  const currentCloudIndex = latestIndex - ichimoku.shift;
  const tenkan = ichimoku.tenkan[latestIndex];
  const kijun = ichimoku.kijun[latestIndex];
  const currentCloudA = currentCloudIndex >= 0 ? ichimoku.senkouA[currentCloudIndex] : null;
  const currentCloudB = currentCloudIndex >= 0 ? ichimoku.senkouB[currentCloudIndex] : null;
  const futureCloudA = ichimoku.senkouA[latestIndex];
  const futureCloudB = ichimoku.senkouB[latestIndex];

  let cloudPosition = "insufficient-data";
  if ([latestClose, currentCloudA, currentCloudB].every(Number.isFinite)) {
    const cloudTop = Math.max(currentCloudA, currentCloudB);
    const cloudBottom = Math.min(currentCloudA, currentCloudB);
    if (latestClose > cloudTop) {
      cloudPosition = "above-cloud";
    } else if (latestClose < cloudBottom) {
      cloudPosition = "below-cloud";
    } else {
      cloudPosition = "inside-cloud";
    }
  }

  let tkCross = "insufficient-data";
  if ([tenkan, kijun].every(Number.isFinite)) {
    if (tenkan > kijun) {
      tkCross = "bullish";
    } else if (tenkan < kijun) {
      tkCross = "bearish";
    } else {
      tkCross = "flat";
    }
  }

  let futureCloudBias = "insufficient-data";
  if ([futureCloudA, futureCloudB].every(Number.isFinite)) {
    if (futureCloudA > futureCloudB) {
      futureCloudBias = "bullish";
    } else if (futureCloudA < futureCloudB) {
      futureCloudBias = "bearish";
    } else {
      futureCloudBias = "flat";
    }
  }

  return {
    tenkan,
    kijun,
    currentCloudA,
    currentCloudB,
    futureCloudA,
    futureCloudB,
    cloudPosition,
    tkCross,
    futureCloudBias,
  };
}

function classifyChartFlow(metrics) {
  let bullish = 0;
  let bearish = 0;

  if (metrics.movingAverageStructure === "strong-bullish") {
    bullish += 3;
  } else if (metrics.movingAverageStructure === "bullish") {
    bullish += 2;
  } else if (metrics.movingAverageStructure === "strong-bearish") {
    bearish += 3;
  } else if (metrics.movingAverageStructure === "bearish") {
    bearish += 2;
  } else if (metrics.movingAverageStructure === "rebound-inside-downtrend") {
    bullish += 1;
    bearish += 2;
  } else if (metrics.movingAverageStructure === "pullback-inside-uptrend") {
    bullish += 2;
    bearish += 1;
  }

  if (metrics.ichimoku.cloudPosition === "above-cloud") {
    bullish += 2;
  } else if (metrics.ichimoku.cloudPosition === "below-cloud") {
    bearish += 2;
  }

  if (metrics.ichimoku.tkCross === "bullish") {
    bullish += 1;
  } else if (metrics.ichimoku.tkCross === "bearish") {
    bearish += 1;
  }

  if (metrics.ichimoku.futureCloudBias === "bullish") {
    bullish += 1;
  } else if (metrics.ichimoku.futureCloudBias === "bearish") {
    bearish += 1;
  }

  if (metrics.bollinger.state === "above-upper-band" || metrics.bollinger.state === "upper-half") {
    bullish += 1;
  } else if (metrics.bollinger.state === "below-lower-band" || metrics.bollinger.state === "lower-half") {
    bearish += 1;
  }

  if (metrics.rsi14Value >= 60) {
    bullish += 1;
  } else if (metrics.rsi14Value <= 40) {
    bearish += 1;
  }

  if (metrics.macd.crossState === "bullish-cross") {
    bullish += 1;
  } else if (metrics.macd.crossState === "bearish-cross") {
    bearish += 1;
  } else if (metrics.macd.crossState === "bullish" && metrics.macd.zeroState === "above-zero") {
    bullish += 1;
  } else if (metrics.macd.crossState === "bearish" && metrics.macd.zeroState === "below-zero") {
    bearish += 1;
  }

  if (metrics.volumeRatio >= 1.2) {
    if (metrics.latestClose >= metrics.ma20Value) {
      bullish += 1;
    } else {
      bearish += 1;
    }
  }

  if (metrics.adx.strengthState === "strong-trend" || metrics.adx.strengthState === "building-trend") {
    if (metrics.adx.directionState === "bullish") {
      bullish += 1;
    } else if (metrics.adx.directionState === "bearish") {
      bearish += 1;
    }
  }

  if (bearish >= bullish + 3) {
    return "bearish continuation";
  }
  if (bullish >= bearish + 3) {
    return "bullish continuation";
  }
  if (bullish > bearish && metrics.latestClose < metrics.ma120Value) {
    return "technical rebound inside broader downtrend";
  }
  if (bearish > bullish && metrics.latestClose > metrics.ma120Value) {
    return "pullback inside broader uptrend";
  }
  return "range-bound or base-building";
}

function createRgbaBuffer(width, height, background) {
  const buffer = Buffer.alloc(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4;
    buffer[offset] = background[0];
    buffer[offset + 1] = background[1];
    buffer[offset + 2] = background[2];
    buffer[offset + 3] = background[3];
  }
  return buffer;
}

function blendPixel(buffer, width, height, x, y, color) {
  if (x < 0 || x >= width || y < 0 || y >= height) {
    return;
  }
  const offset = (Math.floor(y) * width + Math.floor(x)) * 4;
  const alpha = (color[3] ?? 255) / 255;
  const invAlpha = 1 - alpha;
  buffer[offset] = Math.round(color[0] * alpha + buffer[offset] * invAlpha);
  buffer[offset + 1] = Math.round(color[1] * alpha + buffer[offset + 1] * invAlpha);
  buffer[offset + 2] = Math.round(color[2] * alpha + buffer[offset + 2] * invAlpha);
  buffer[offset + 3] = 255;
}

function fillRect(buffer, width, height, x, y, rectWidth, rectHeight, color) {
  const startX = Math.max(0, Math.floor(x));
  const startY = Math.max(0, Math.floor(y));
  const endX = Math.min(width, Math.ceil(x + rectWidth));
  const endY = Math.min(height, Math.ceil(y + rectHeight));

  for (let row = startY; row < endY; row += 1) {
    for (let col = startX; col < endX; col += 1) {
      blendPixel(buffer, width, height, col, row, color);
    }
  }
}

function drawLine(buffer, width, height, x0, y0, x1, y1, color, thickness = 1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);

  for (let step = 0; step <= steps; step += 1) {
    const x = Math.round(x0 + (dx * step) / steps);
    const y = Math.round(y0 + (dy * step) / steps);
    for (let offsetX = -Math.floor(thickness / 2); offsetX <= Math.floor(thickness / 2); offsetX += 1) {
      for (let offsetY = -Math.floor(thickness / 2); offsetY <= Math.floor(thickness / 2); offsetY += 1) {
        blendPixel(buffer, width, height, x + offsetX, y + offsetY, color);
      }
    }
  }
}

function drawDashedLine(buffer, width, height, x0, y0, x1, y1, color, thickness = 1, dashLength = 10, gapLength = 7) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const length = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
  const ux = dx / length;
  const uy = dy / length;
  let cursor = 0;
  while (cursor < length) {
    const segmentEnd = Math.min(cursor + dashLength, length);
    drawLine(
      buffer,
      width,
      height,
      x0 + ux * cursor,
      y0 + uy * cursor,
      x0 + ux * segmentEnd,
      y0 + uy * segmentEnd,
      color,
      thickness,
    );
    cursor += dashLength + gapLength;
  }
}

function drawSeries(buffer, width, height, points, color, thickness = 2) {
  let previous = null;
  for (const point of points) {
    if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) {
      if (previous) {
        drawLine(buffer, width, height, previous.x, previous.y, point.x, point.y, color, thickness);
      }
      previous = point;
    } else {
      previous = null;
    }
  }
}

function drawVerticalBand(buffer, width, height, x, y1, y2, color, thickness = 2) {
  const top = Math.min(y1, y2);
  const bottom = Math.max(y1, y2);
  fillRect(buffer, width, height, x - Math.floor(thickness / 2), top, thickness, bottom - top + 1, color);
}

function drawFilledBand(buffer, width, height, upperPoints, lowerPoints, color) {
  for (let index = 0; index < upperPoints.length; index += 1) {
    const upper = upperPoints[index];
    const lower = lowerPoints[index];
    if (upper && lower && Number.isFinite(upper.x) && Number.isFinite(upper.y) && Number.isFinite(lower.y)) {
      drawVerticalBand(buffer, width, height, Math.round(upper.x), upper.y, lower.y, color, 2);
    }
  }
}

function computeVolumeProfile(bars, binCount) {
  if (!Array.isArray(bars) || bars.length === 0 || !Number.isFinite(binCount) || binCount < 1) {
    return null;
  }
  const highs = [];
  const lows = [];
  for (const bar of bars) {
    if (Number.isFinite(bar.high)) highs.push(bar.high);
    if (Number.isFinite(bar.low)) lows.push(bar.low);
  }
  if (highs.length === 0 || lows.length === 0) {
    return null;
  }
  const priceMin = Math.min(...lows);
  const priceMax = Math.max(...highs);
  if (priceMin >= priceMax) {
    return null;
  }
  const bins = Array.from({ length: binCount }, (_, index) => ({
    priceLow: priceMin + ((priceMax - priceMin) * index) / binCount,
    priceHigh: priceMin + ((priceMax - priceMin) * (index + 1)) / binCount,
    volume: 0,
  }));
  for (const bar of bars) {
    if (
      !Number.isFinite(bar.high) ||
      !Number.isFinite(bar.low) ||
      !Number.isFinite(bar.close) ||
      !Number.isFinite(bar.volume)
    ) {
      continue;
    }
    const typical = (bar.high + bar.low + bar.close) / 3;
    let binIndex = Math.floor(((typical - priceMin) / (priceMax - priceMin)) * binCount);
    if (binIndex < 0) binIndex = 0;
    if (binIndex >= binCount) binIndex = binCount - 1;
    bins[binIndex].volume += bar.volume;
  }
  let pocIndex = 0;
  let maxVolume = bins[0].volume;
  for (let i = 1; i < binCount; i += 1) {
    if (bins[i].volume > maxVolume) {
      maxVolume = bins[i].volume;
      pocIndex = i;
    }
  }
  return { bins, pocIndex, maxVolume, priceMin, priceMax };
}

function detectSwingPivots(bars, k) {
  const highs = [];
  const lows = [];
  if (!Array.isArray(bars) || bars.length < 2 * k + 1) {
    return { highs, lows };
  }
  for (let i = k; i < bars.length - k; i += 1) {
    const bar = bars[i];
    if (!Number.isFinite(bar.high) || !Number.isFinite(bar.low)) continue;
    let isHigh = true;
    let isLow = true;
    for (let j = i - k; j <= i + k; j += 1) {
      if (j === i) continue;
      const other = bars[j];
      if (!Number.isFinite(other.high) || !Number.isFinite(other.low)) continue;
      if (other.high > bar.high) isHigh = false;
      if (other.low < bar.low) isLow = false;
      if (other.high === bar.high && j > i) isHigh = false;
      if (other.low === bar.low && j > i) isLow = false;
    }
    if (isHigh) highs.push({ index: i, price: bar.high });
    if (isLow) lows.push({ index: i, price: bar.low });
  }
  return { highs, lows };
}

function computeATR14(bars) {
  if (!Array.isArray(bars) || bars.length < 15) return null;
  const trs = [];
  for (let i = 1; i < bars.length; i += 1) {
    const cur = bars[i];
    const prev = bars[i - 1];
    if (
      !Number.isFinite(cur.high) ||
      !Number.isFinite(cur.low) ||
      !Number.isFinite(prev.close)
    ) {
      trs.push(null);
      continue;
    }
    const tr = Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prev.close),
      Math.abs(cur.low - prev.close),
    );
    trs.push(tr);
  }
  const valid = trs.slice(-14).filter((v) => Number.isFinite(v));
  if (valid.length === 0) return null;
  const sum = valid.reduce((acc, v) => acc + v, 0);
  return sum / valid.length;
}

function clusterPriceZones(points, tolerance) {
  if (!Array.isArray(points) || points.length === 0 || !Number.isFinite(tolerance) || tolerance <= 0) {
    return [];
  }
  const sorted = [...points].sort((a, b) => a.price - b.price);
  const clusters = [];
  for (const point of sorted) {
    const last = clusters[clusters.length - 1];
    if (last && point.price - last.maxPrice <= tolerance) {
      last.points.push(point);
      last.maxPrice = Math.max(last.maxPrice, point.price);
    } else {
      clusters.push({ points: [point], maxPrice: point.price });
    }
  }
  const zones = [];
  for (const cluster of clusters) {
    if (cluster.points.length < 2) continue;
    const prices = cluster.points.map((p) => p.price);
    const indices = cluster.points.map((p) => p.index);
    const zoneLow = Math.min(...prices);
    const zoneHigh = Math.max(...prices);
    const center = prices.reduce((a, v) => a + v, 0) / prices.length;
    zones.push({
      zoneLow,
      zoneHigh,
      center,
      swingTouchCount: cluster.points.length,
      swingIndices: indices,
    });
  }
  return zones;
}

function recountZoneTouches(zones, bars) {
  for (const zone of zones) {
    let touchCount = 0;
    let lastTouchIndex = -1;
    for (let i = 0; i < bars.length; i += 1) {
      const bar = bars[i];
      if (!Number.isFinite(bar.high) || !Number.isFinite(bar.low)) continue;
      const overlap = Math.max(bar.low, zone.zoneLow) <= Math.min(bar.high, zone.zoneHigh);
      if (overlap) {
        touchCount += 1;
        lastTouchIndex = i;
      }
    }
    zone.touchCount = touchCount;
    zone.lastTouchIndex = lastTouchIndex;
    zone.lastTouchDate = lastTouchIndex >= 0 ? bars[lastTouchIndex].date : null;
  }
  return zones;
}

const MAX_ZONE_DISTANCE_PCT = 0.30;

function classifyAndFilterZones(zones, bars, currentPrice, holdDays) {
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) return [];
  const tail = bars.slice(-holdDays);
  const lastFive = bars.slice(-5);
  const result = [];
  for (const zone of zones) {
    const distancePct = Math.abs(zone.center - currentPrice) / currentPrice;
    let type = null;
    if (zone.zoneHigh < currentPrice) type = "support";
    else if (zone.zoneLow > currentPrice) type = "resistance";
    else type = "inside";

    let status = "active";
    if (type === "support") {
      const allBelow = tail.length === holdDays && tail.every(
        (b) => Number.isFinite(b.close) && b.close < zone.zoneLow,
      );
      if (allBelow) status = "broken";
    } else if (type === "resistance") {
      const allAbove = tail.length === holdDays && tail.every(
        (b) => Number.isFinite(b.close) && b.close > zone.zoneHigh,
      );
      if (allAbove) status = "broken";
    }

    if (status === "broken") {
      const flippedTouch = lastFive.some(
        (b) =>
          Number.isFinite(b.high) &&
          Number.isFinite(b.low) &&
          Math.max(b.low, zone.zoneLow) <= Math.min(b.high, zone.zoneHigh),
      );
      if (flippedTouch) {
        status = "flipped";
        type = type === "support" ? "resistance" : "support";
      }
    }

    const excludedByDistance = distancePct > MAX_ZONE_DISTANCE_PCT;
    result.push({
      ...zone,
      type,
      status,
      distancePct,
      excludedByDistance,
    });
  }
  return result;
}

function computeVolumeAtZone(zone, bars) {
  let total = 0;
  for (const bar of bars) {
    if (!Number.isFinite(bar.high) || !Number.isFinite(bar.low) || !Number.isFinite(bar.volume)) continue;
    if (Math.max(bar.low, zone.zoneLow) <= Math.min(bar.high, zone.zoneHigh)) {
      total += bar.volume;
    }
  }
  return total;
}

function scoreZones(zones, bars, currentPrice) {
  if (!Array.isArray(zones) || zones.length === 0) return zones;
  const latestIndex = bars.length - 1;
  for (const zone of zones) {
    zone.volumeAtZone = computeVolumeAtZone(zone, bars);
    zone.daysSinceLastTouch = zone.lastTouchIndex >= 0 ? latestIndex - zone.lastTouchIndex : 9999;
  }
  const touchCounts = zones.map((z) => z.touchCount);
  const volumes = zones.map((z) => z.volumeAtZone);
  const minMax = (arr) => ({ min: Math.min(...arr), max: Math.max(...arr) });
  const norm = (v, range) => (range.max > range.min ? (v - range.min) / (range.max - range.min) : 0.5);
  const tcRange = minMax(touchCounts);
  const volRange = minMax(volumes);
  for (const zone of zones) {
    const recencyScore = Math.exp(-zone.daysSinceLastTouch / 30);
    const distScore = Math.max(0, 1 - zone.distancePct / MAX_ZONE_DISTANCE_PCT);
    const statusBonus = zone.status === "active" ? 1.0 : zone.status === "flipped" ? 0.7 : 0;
    zone.score =
      0.35 * norm(zone.touchCount, tcRange) +
      0.25 * recencyScore +
      0.20 * norm(zone.volumeAtZone, volRange) +
      0.15 * distScore +
      0.05 * statusBonus;
  }
  return zones;
}

function writeZonesCSV(filePath, zones) {
  const header = "type,zone_low,zone_high,center_price,touch_count,last_touch_date,score,status";
  const rows = zones.map((z) => {
    const type = z.type || "inside";
    const zl = Math.round(z.zoneLow);
    const zh = Math.round(z.zoneHigh);
    const cp = Math.round(z.center);
    const tc = z.touchCount || 0;
    const ld = z.lastTouchDate || "";
    const sc = Number.isFinite(z.score) ? z.score.toFixed(4) : "";
    const st = z.status || "";
    return `${type},${zl},${zh},${cp},${tc},${ld},${sc},${st}`;
  });
  const csv = [header, ...rows].join("\n") + "\n";
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, csv);
}

function buildAlternatingPivots(pivots, bars, minSwing) {
  const merged = [
    ...pivots.highs.map((pivot) => ({ ...pivot, type: "high", date: bars[pivot.index]?.date || "" })),
    ...pivots.lows.map((pivot) => ({ ...pivot, type: "low", date: bars[pivot.index]?.date || "" })),
  ]
    .filter((pivot) => Number.isFinite(pivot.index) && Number.isFinite(pivot.price))
    .sort((a, b) => (a.index === b.index ? a.type.localeCompare(b.type) : a.index - b.index));

  const alternating = [];
  for (const pivot of merged) {
    const last = alternating[alternating.length - 1];
    if (!last) {
      alternating.push(pivot);
      continue;
    }
    if (pivot.type === last.type) {
      const moreExtreme =
        (pivot.type === "high" && pivot.price > last.price) ||
        (pivot.type === "low" && pivot.price < last.price);
      if (moreExtreme) {
        alternating[alternating.length - 1] = pivot;
      }
      continue;
    }
    if (Number.isFinite(minSwing) && minSwing > 0 && Math.abs(pivot.price - last.price) < minSwing) {
      continue;
    }
    alternating.push(pivot);
  }
  return alternating;
}

function scoreImpulseCandidate(points, direction, barsLength, minSwing) {
  const legs = [];
  for (let index = 1; index < points.length; index += 1) {
    legs.push(Math.abs(points[index].price - points[index - 1].price));
  }
  const alternatingScore = points.every((point, index) => index === 0 || point.type !== points[index - 1].type) ? 1 : 0;
  const minSwingScore = legs.every((leg) => leg >= minSwing) ? 1 : Math.max(0, legs.filter((leg) => leg >= minSwing).length / Math.max(legs.length, 1));
  const wave3Score = legs[2] >= legs[0] * 0.9 ? 1 : Math.max(0, legs[2] / Math.max(legs[0], 1));
  let wave4Score = 1;
  if (direction === "bullish" && points[4].price < points[1].price) {
    wave4Score = Math.max(0, 1 - (points[1].price - points[4].price) / Math.max(legs[0], 1));
  } else if (direction === "bearish" && points[4].price > points[1].price) {
    wave4Score = Math.max(0, 1 - (points[4].price - points[1].price) / Math.max(legs[0], 1));
  }
  const latestDistance = barsLength - 1 - points[points.length - 1].index;
  const recencyScore = Math.max(0, 1 - latestDistance / 60);

  return clamp(
    0.25 * alternatingScore +
      0.20 * minSwingScore +
      0.25 * wave3Score +
      0.20 * wave4Score +
      0.10 * recencyScore,
    0,
    1,
  );
}

function scoreCorrectiveCandidate(points, barsLength, minSwing) {
  const legs = [
    Math.abs(points[1].price - points[0].price),
    Math.abs(points[2].price - points[1].price),
  ];
  const alternatingScore = points[0].type !== points[1].type && points[1].type !== points[2].type ? 1 : 0;
  const minSwingScore = legs.every((leg) => leg >= minSwing) ? 1 : Math.max(0, legs.filter((leg) => leg >= minSwing).length / 2);
  const balanceRatio = Math.min(legs[0], legs[1]) / Math.max(legs[0], legs[1], 1);
  const latestDistance = barsLength - 1 - points[2].index;
  const recencyScore = Math.max(0, 1 - latestDistance / 45);
  return clamp(0.30 * alternatingScore + 0.25 * minSwingScore + 0.25 * balanceRatio + 0.20 * recencyScore, 0, 1);
}

function impulseDirectionFromPivotTypes(types) {
  if (types === "low-high-low-high-low-high") {
    return "bullish";
  }
  if (types === "high-low-high-low-high-low") {
    return "bearish";
  }
  return null;
}

function detectWaveCandidates(bars, currentPrice) {
  const recentBars = bars.slice(-Math.min(120, bars.length));
  const baseIndex = bars.length - recentBars.length;
  const atr = computeATR14(recentBars);
  const minSwing = Math.max(atr || 0, Number.isFinite(currentPrice) ? currentPrice * 0.01 : 0);
  const rawPivots = detectSwingPivots(recentBars, 5);
  const shiftedPivots = {
    highs: rawPivots.highs.map((pivot) => ({ ...pivot, index: pivot.index + baseIndex })),
    lows: rawPivots.lows.map((pivot) => ({ ...pivot, index: pivot.index + baseIndex })),
  };
  const pivots = buildAlternatingPivots(shiftedPivots, bars, minSwing);
  const candidates = [];

  for (let index = 0; index <= pivots.length - 6; index += 1) {
    const points = pivots.slice(index, index + 6);
    const types = points.map((point) => point.type).join("-");
    const direction = impulseDirectionFromPivotTypes(types);
    if (direction) {
      const confidence = scoreImpulseCandidate(points, direction, bars.length, minSwing);
      candidates.push({
        kind: "impulse",
        direction,
        status: confidence >= 0.55 ? "drawable" : "candidate-only",
        confidence,
        labels: ["", "1", "2", "3", "4", "5"],
        points,
      });
    }
  }

  for (let index = 6; index <= pivots.length - 3; index += 1) {
    const previousTypes = pivots.slice(index - 6, index).map((point) => point.type).join("-");
    const impulseDirection = impulseDirectionFromPivotTypes(previousTypes);
    if (!impulseDirection) {
      continue;
    }
    const points = pivots.slice(index, index + 3);
    const types = points.map((point) => point.type).join("-");
    const expectedTypes = impulseDirection === "bullish" ? "low-high-low" : "high-low-high";
    if (types === expectedTypes) {
      const direction = impulseDirection === "bullish" ? "bearish-correction" : "bullish-correction";
      const confidence = scoreCorrectiveCandidate(points, bars.length, minSwing);
      candidates.push({
        kind: "corrective",
        direction,
        status: confidence >= 0.55 ? "drawable" : "candidate-only",
        confidence,
        labels: ["A", "B", "C"],
        points,
      });
    }
  }

  candidates.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return b.points[b.points.length - 1].index - a.points[a.points.length - 1].index;
  });

  return {
    pivots,
    candidates,
    selected: candidates.find((candidate) => candidate.confidence >= 0.55) || null,
    minSwing,
    atr,
  };
}

function buildFibonacciLevels(candidate) {
  if (!candidate || !Array.isArray(candidate.points) || candidate.points.length < 2) {
    return [];
  }
  const start = candidate.points[0].price;
  const end = candidate.points[candidate.points.length - 1].price;
  const delta = end - start;
  if (!Number.isFinite(delta) || delta === 0) {
    return [];
  }
  const retracements = [0.382, 0.5, 0.618].map((ratio) => ({
    kind: "retracement",
    label: `${(ratio * 100).toFixed(1)}%`,
    price: end - delta * ratio,
  }));
  const extensions = [1, 1.618].map((ratio) => ({
    kind: "extension",
    label: `${(ratio * 100).toFixed(ratio === 1 ? 0 : 1)}%`,
    price: start + delta * ratio,
  }));
  return [...retracements, ...extensions].filter((level) => Number.isFinite(level.price));
}

function buildPatternInterpretationLines(candidate, fibLevels, currentPrice) {
  if (!candidate) {
    return [
      "해석: 충분한 파동 후보 없음",
      "현재: 피벗 수/폭 부족으로 라벨 보류",
      "확인: 더 큰 swing 형성 후 재판정",
      "주의: 확정 신호 아님",
    ];
  }

  const lastPoint = candidate.points[candidate.points.length - 1];
  const previousPoint = candidate.points[candidate.points.length - 2];
  const directionKo = candidate.direction.includes("bullish") ? "상승" : "하락";
  const kindKo = candidate.kind === "impulse" ? "1-5 impulse" : "A-B-C correction";
  const retracements = fibLevels
    .filter((level) => level.kind === "retracement")
    .sort((a, b) => a.price - b.price);
  const nearestFib = retracements
    .map((level) => ({ ...level, distance: Math.abs(level.price - currentPrice) }))
    .sort((a, b) => a.distance - b.distance)[0];
  const invalidationPrice = previousPoint && Number.isFinite(previousPoint.price) ? previousPoint.price : null;
  const lastPrice = lastPoint && Number.isFinite(lastPoint.price) ? lastPoint.price : null;
  const currentVsLast = Number.isFinite(lastPrice) && Number.isFinite(currentPrice)
    ? currentPrice >= lastPrice
      ? "마지막 피벗 돌파/연장 확인"
      : "마지막 피벗 이후 되돌림 확인"
    : "현재 위치 확인 필요";

  const supportOrResistance = nearestFib
    ? `관찰: Fib ${nearestFib.label} ${formatAxisNumber(nearestFib.price)} 부근 반응`
    : "관찰: Fib 기준선 부족";
  const invalidation = Number.isFinite(invalidationPrice)
    ? `약화: 직전 피벗 ${formatAxisNumber(invalidationPrice)} 이탈/돌파`
    : "약화: 직전 피벗 확인 필요";

  return [
    `해석: ${directionKo} ${kindKo} 후보 ${candidate.confidence.toFixed(2)}`,
    `현재: ${currentVsLast}`,
    supportOrResistance,
    invalidation,
    "주의: 엘리엇 확정 카운트 아님",
  ];
}

function formatPctDistance(fromValue, toValue) {
  if (!Number.isFinite(fromValue) || !Number.isFinite(toValue) || fromValue === 0) {
    return "n/a";
  }
  const pct = ((toValue - fromValue) / fromValue) * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

function formatPriceWithDistance(price, currentPrice) {
  if (!Number.isFinite(price)) {
    return "n/a";
  }
  return `${formatAxisNumber(price)} (${formatPctDistance(currentPrice, price)})`;
}

function maPositionLabel(close, maValues) {
  const labels = [
    ["MA20", maValues.ma20],
    ["MA60", maValues.ma60],
    ["MA120", maValues.ma120],
  ].map(([label, value]) => {
    if (!Number.isFinite(close) || !Number.isFinite(value)) {
      return `${label} n/a`;
    }
    return `${label} ${close >= value ? "위" : "아래"}`;
  });
  return labels.join(" / ");
}

function movingAverageStructureKo(state) {
  if (state === "strong-bullish") return "정배열 강화";
  if (state === "bullish") return "상승 우위";
  if (state === "strong-bearish") return "역배열 부담";
  if (state === "bearish") return "하락 우위";
  if (state === "rebound-inside-downtrend") return "하락 추세 내 반등";
  if (state === "pullback-inside-uptrend") return "상승 추세 내 조정";
  if (state === "mixed") return "혼조";
  return "자료 부족";
}

function volumeRegimeKo(state) {
  if (state === "heavy") return "20일 평균 대비 증가";
  if (state === "light") return "20일 평균 대비 감소";
  if (state === "normal") return "20일 평균 부근";
  return "비교 부족";
}

function bollingerStateKo(state) {
  if (state === "above-upper-band") return "상단 밴드 위";
  if (state === "below-lower-band") return "하단 밴드 아래";
  if (state === "upper-half") return "밴드 상단부";
  if (state === "lower-half") return "밴드 하단부";
  if (state === "mid-band") return "중심선 부근";
  if (state === "inside-bands") return "밴드 내부";
  return "자료 부족";
}

function bandwidthRegimeKo(state) {
  if (state === "expanding") return "변동성 확대";
  if (state === "contracting") return "변동성 축소";
  if (state === "normal") return "변동성 보통";
  return "변동성 자료 부족";
}

function cloudPositionKo(state) {
  if (state === "above-cloud") return "구름 위";
  if (state === "below-cloud") return "구름 아래";
  if (state === "inside-cloud") return "구름 내부";
  return "구름 자료 부족";
}

function tkCrossKo(state) {
  if (state === "bullish") return "전환선>기준선";
  if (state === "bearish") return "전환선<기준선";
  if (state === "flat") return "전환선=기준선";
  return "전환/기준 자료 부족";
}

function rsiStateKo(state) {
  if (state === "overbought") return "과열권";
  if (state === "oversold") return "침체권";
  if (state === "neutral") return "중립권";
  return "자료 부족";
}

function macdCrossKo(state) {
  if (state === "bullish-cross") return "상향 돌파";
  if (state === "bearish-cross") return "하향 이탈";
  if (state === "bullish") return "MACD>Signal";
  if (state === "bearish") return "MACD<Signal";
  if (state === "flat") return "MACD=Signal";
  return "자료 부족";
}

function histogramStateKo(state) {
  if (state === "expanding") return "히스토그램 확대";
  if (state === "contracting") return "히스토그램 축소";
  if (state === "stable") return "히스토그램 보합";
  return "히스토그램 자료 부족";
}

function adxStrengthKo(state) {
  if (state === "strong-trend") return "강한 추세";
  if (state === "building-trend") return "추세 형성";
  if (state === "weak-trend") return "약한 추세";
  return "강도 자료 부족";
}

function dmiDirectionKo(state) {
  if (state === "bullish") return "+DI 우위";
  if (state === "bearish") return "-DI 우위";
  if (state === "flat") return "DI 중립";
  return "DI 자료 부족";
}

function buildMainInterpretationLines(metrics) {
  return [
    `해석: ${movingAverageStructureKo(metrics.movingAverageStructure)}`,
    `현재: ${maPositionLabel(metrics.latestClose, {
      ma20: metrics.ma20Value,
      ma60: metrics.ma60Value,
      ma120: metrics.ma120Value,
    })}`,
    `거래량: ${volumeRegimeKo(metrics.volumeRegime)} (${formatPercentRatio(metrics.volumeRatio, 1)})`,
    `확인: 20D 돌파 ${formatAxisNumber(metrics.breakoutLevel)} / 이탈 ${formatAxisNumber(metrics.breakdownLevel)}`,
    "주의: 이동평균은 후행 지표",
  ];
}

function buildOverlayInterpretationLines(metrics) {
  return [
    `해석: ${bollingerStateKo(metrics.bollinger.state)} / ${bandwidthRegimeKo(metrics.bollinger.bandwidthRegime)}`,
    `일목: ${cloudPositionKo(metrics.ichimoku.cloudPosition)} / ${tkCrossKo(metrics.ichimoku.tkCross)}`,
    `RSI: ${formatNumber(metrics.rsi14Value, 1)} (${rsiStateKo(metrics.rsiState)})`,
    `확인: 상단 ${formatAxisNumber(metrics.bollinger.upper)} / 하단 ${formatAxisNumber(metrics.bollinger.lower)} 반응`,
    "주의: 과열/침체는 반전 확정 아님",
  ];
}

function buildMomentumInterpretationLines(metrics) {
  return [
    `해석: ${macdCrossKo(metrics.macd.crossState)} / ${histogramStateKo(metrics.macd.histogramState)}`,
    `MACD: ${formatNumber(metrics.macd.macdValue, 1)} vs Signal ${formatNumber(metrics.macd.signalValue, 1)}`,
    `ADX: ${formatNumber(metrics.adx.adxValue, 1)} (${adxStrengthKo(metrics.adx.strengthState)})`,
    `DMI: ${dmiDirectionKo(metrics.adx.directionState)} (+${formatNumber(metrics.adx.plusDiValue, 1)} / -${formatNumber(metrics.adx.minusDiValue, 1)})`,
    "주의: 모멘텀 둔화 시 가격 확인 필요",
  ];
}

function buildStructureInterpretationLines(drawnZones, profile, currentPrice) {
  const supports = drawnZones
    .filter((zone) => zone.type === "support")
    .sort((a, b) => Math.abs(a.center - currentPrice) - Math.abs(b.center - currentPrice));
  const resistances = drawnZones
    .filter((zone) => zone.type === "resistance")
    .sort((a, b) => Math.abs(a.center - currentPrice) - Math.abs(b.center - currentPrice));
  const nearestSupport = supports[0] || null;
  const nearestResistance = resistances[0] || null;
  const pocBin = profile && profile.bins && Number.isInteger(profile.pocIndex) ? profile.bins[profile.pocIndex] : null;
  const pocPrice = pocBin ? (pocBin.priceLow + pocBin.priceHigh) / 2 : null;

  return [
    `해석: 가까운 지지 ${nearestSupport ? formatPriceWithDistance(nearestSupport.center, currentPrice) : "n/a"}`,
    `저항: ${nearestResistance ? formatPriceWithDistance(nearestResistance.center, currentPrice) : "n/a"}`,
    `POC: ${Number.isFinite(pocPrice) ? formatPriceWithDistance(pocPrice, currentPrice) : "n/a"}`,
    "확인: zone 재진입/돌파 후 종가 유지",
    "주의: zone 이탈 시 구조 재평가",
  ];
}

function writeWaveCSV(filePath, waveAnalysis) {
  const header = "candidate_id,kind,direction,status,confidence,label,date,index,type,price,min_swing";
  const rows = [];
  const candidates = waveAnalysis.candidates.length > 0
    ? waveAnalysis.candidates
    : [{
      kind: "none",
      direction: "insufficient wave candidate",
      status: "insufficient wave candidate",
      confidence: 0,
      labels: [],
      points: [],
    }];
  candidates.forEach((candidate, candidateIndex) => {
    if (!candidate.points.length) {
      rows.push(`${candidateIndex + 1},${candidate.kind},${candidate.direction},${candidate.status},${candidate.confidence.toFixed(4)},,,,,,${Math.round(waveAnalysis.minSwing || 0)}`);
      return;
    }
    candidate.points.forEach((point, pointIndex) => {
      const label = candidate.labels[pointIndex] || "";
      rows.push([
        candidateIndex + 1,
        candidate.kind,
        candidate.direction,
        candidate.status,
        candidate.confidence.toFixed(4),
        label,
        point.date || "",
        point.index,
        point.type,
        Math.round(point.price),
        Math.round(waveAnalysis.minSwing || 0),
      ].join(","));
    });
  });
  const csv = [header, ...rows].join("\n") + "\n";
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, csv);
}

function glyphWidth() {
  return 5;
}

function clamp(value, minValue, maxValue) {
  return Math.min(Math.max(value, minValue), maxValue);
}

function containsHangul(text) {
  return /[\uac00-\ud7a3]/.test(String(text || ""));
}

function loadExternalTextMask(text, scale = 1) {
  if (!containsHangul(text)) {
    return null;
  }
  return KR_FONT_RENDERER.loadMask(text, scale);
}

process.on("exit", () => KR_FONT_RENDERER.report());

function drawAlphaMask(buffer, width, height, x, y, mask, color) {
  if (!mask || mask.width <= 0 || mask.height <= 0) {
    return;
  }

  const alphaScale = color[3] === undefined ? 255 : color[3];
  for (let row = 0; row < mask.height; row += 1) {
    for (let col = 0; col < mask.width; col += 1) {
      const alpha = mask.alpha[row * mask.width + col];
      if (alpha > 0) {
        blendPixel(buffer, width, height, x + col, y + row, [
          color[0],
          color[1],
          color[2],
          Math.round((alpha * alphaScale) / 255),
        ]);
      }
    }
  }
}

function isHangulSyllable(character) {
  if (!character) {
    return false;
  }
  const code = character.codePointAt(0);
  return code >= HANGUL_BASE && code <= HANGUL_END;
}

function normalizeConsonantParts(jamo) {
  const doubled = {
    "ㄲ": ["ㄱ", "ㄱ"],
    "ㄸ": ["ㄷ", "ㄷ"],
    "ㅃ": ["ㅂ", "ㅂ"],
    "ㅆ": ["ㅅ", "ㅅ"],
    "ㅉ": ["ㅈ", "ㅈ"],
  };
  return doubled[jamo] || [jamo];
}

function decomposeHangulSyllable(character) {
  if (!isHangulSyllable(character)) {
    return null;
  }

  const syllableIndex = character.codePointAt(0) - HANGUL_BASE;
  const initialIndex = Math.floor(syllableIndex / 588);
  const medialIndex = Math.floor((syllableIndex % 588) / 28);
  const finalIndex = syllableIndex % 28;

  const initials = normalizeConsonantParts(HANGUL_INITIALS[initialIndex]).slice(0, 2);
  const medials = HANGUL_MEDIALS[medialIndex].slice(0, 2);
  const finals = HANGUL_FINALS[finalIndex]
    .flatMap((jamo) => normalizeConsonantParts(jamo))
    .slice(0, 2);

  return { initials, medials, finals };
}

function hangulGlyphWidth() {
  return 17;
}

function drawBitmap(buffer, width, height, x, y, bitmap, color, scale = 1) {
  bitmap.forEach((row, rowIndex) => {
    for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
      if (row[columnIndex] === "1") {
        fillRect(
          buffer,
          width,
          height,
          x + columnIndex * scale,
          y + rowIndex * scale,
          scale,
          scale,
          color,
        );
      }
    }
  });
}

function drawHangulGlyph(buffer, width, height, x, y, character, color, scale = 1) {
  const parts = decomposeHangulSyllable(character);
  if (!parts) {
    drawBitmap(buffer, width, height, x, y, FONT_5X7["?"], color, scale);
    return hangulGlyphWidth();
  }

  const initialXs = parts.initials.length > 1 ? [0, 3] : [0];
  const medialXs = parts.medials.length > 1 ? [6, 12] : [6];
  const finalXs = parts.finals.length > 1 ? [3, 9] : [6];

  parts.initials.forEach((jamo, index) => {
    const bitmap = JAMO_5X5[jamo];
    if (bitmap) {
      drawBitmap(buffer, width, height, x + initialXs[index] * scale, y, bitmap, color, scale);
    }
  });

  parts.medials.forEach((jamo, index) => {
    const bitmap = JAMO_5X5[jamo];
    if (bitmap) {
      drawBitmap(buffer, width, height, x + medialXs[index] * scale, y, bitmap, color, scale);
    }
  });

  parts.finals.forEach((jamo, index) => {
    const bitmap = JAMO_5X5[jamo];
    if (bitmap) {
      drawBitmap(buffer, width, height, x + finalXs[index] * scale, y + 6 * scale, bitmap, color, scale);
    }
  });

  return hangulGlyphWidth();
}

function measureCharacterWidth(character) {
  return isHangulSyllable(character) ? hangulGlyphWidth() : glyphWidth();
}

function measureText(text, scale = 1) {
  const externalMask = loadExternalTextMask(text, scale);
  if (externalMask) {
    return externalMask.width;
  }

  if (!text) {
    return 0;
  }
  const characters = Array.from(String(text));
  return characters.reduce((sum, character, index) => {
    const width = measureCharacterWidth(character);
    return sum + width * scale + (index === characters.length - 1 ? 0 : scale);
  }, 0);
}

function drawText(buffer, width, height, x, y, text, color, scale = 1, align = "left") {
  const externalMask = loadExternalTextMask(text, scale);
  const characters = Array.from(String(text));
  let cursorX = x;
  const totalWidth = externalMask ? externalMask.width : measureText(text, scale);
  if (align === "center") {
    cursorX -= Math.round(totalWidth / 2);
  } else if (align === "right") {
    cursorX -= totalWidth;
  }

  if (externalMask) {
    drawAlphaMask(buffer, width, height, Math.round(cursorX), Math.round(y), externalMask, color);
    return;
  }

  for (const character of characters) {
    if (isHangulSyllable(character)) {
      cursorX += drawHangulGlyph(buffer, width, height, cursorX, y, character, color, scale) * scale + scale;
      continue;
    }

    const glyphKey = /[a-z]/.test(character) ? character.toUpperCase() : character;
    const glyph = FONT_5X7[glyphKey] || FONT_5X7["?"];
    drawBitmap(buffer, width, height, cursorX, y, glyph, color, scale);
    cursorX += (glyphWidth() + 1) * scale;
  }
}

function drawLegendItem(buffer, width, height, x, y, color, label) {
  fillRect(buffer, width, height, x, y + 4, 16, 6, color);
  drawText(buffer, width, height, x + 24, y, label, [51, 65, 85, 255], 2);
  return x + 24 + measureText(label, 2) + 22;
}

function drawValueCallout(buffer, width, height, rightEdge, y, label, theme, panelTop, panelHeight) {
  const paddingX = 8;
  const boxHeight = 24;
  const boxWidth = measureText(label, 2) + paddingX * 2;
  const boxLeft = rightEdge - boxWidth;
  const boxTop = clamp(Math.round(y - boxHeight / 2), panelTop + 4, panelTop + panelHeight - boxHeight - 4);
  const fillColor = [255, 255, 255, 230];

  fillRect(buffer, width, height, boxLeft, boxTop, boxWidth, boxHeight, fillColor);
  drawLine(buffer, width, height, boxLeft, boxTop, boxLeft + boxWidth, boxTop, theme.border, 1);
  drawLine(buffer, width, height, boxLeft, boxTop + boxHeight, boxLeft + boxWidth, boxTop + boxHeight, theme.border, 1);
  drawLine(buffer, width, height, boxLeft, boxTop, boxLeft, boxTop + boxHeight, theme.border, 1);
  drawLine(buffer, width, height, boxLeft + boxWidth, boxTop, boxLeft + boxWidth, boxTop + boxHeight, theme.border, 1);
  drawText(buffer, width, height, boxLeft + paddingX, boxTop + 4, label, theme.close, 2);
}

function drawTextBox(buffer, width, height, x, y, boxWidth, lines, theme) {
  const paddingX = 12;
  const paddingY = 10;
  const lineHeight = 22;
  const boxHeight = paddingY * 2 + lines.length * lineHeight;
  fillRect(buffer, width, height, x, y, boxWidth, boxHeight, [255, 255, 255, 232]);
  drawLine(buffer, width, height, x, y, x + boxWidth, y, theme.border, 1);
  drawLine(buffer, width, height, x, y + boxHeight, x + boxWidth, y + boxHeight, theme.border, 1);
  drawLine(buffer, width, height, x, y, x, y + boxHeight, theme.border, 1);
  drawLine(buffer, width, height, x + boxWidth, y, x + boxWidth, y + boxHeight, theme.border, 1);
  lines.forEach((line, index) => {
    const color = index === 0 ? theme.text : theme.muted;
    drawText(buffer, width, height, x + paddingX, y + paddingY + index * lineHeight, line, color, 2);
  });
}

function drawCandlesticks(buffer, width, height, bars, xForSlot, minValue, maxValue, top, panelHeight, theme) {
  const candleWidth = Math.max(4, Math.floor((width * 0.00042)));
  bars.forEach((bar, index) => {
    if (!Number.isFinite(bar.open) || !Number.isFinite(bar.high) || !Number.isFinite(bar.low) || !Number.isFinite(bar.close)) {
      return;
    }

    const x = xForSlot(index);
    const highY = valueToY(bar.high, minValue, maxValue, top, panelHeight);
    const lowY = valueToY(bar.low, minValue, maxValue, top, panelHeight);
    const openY = valueToY(bar.open, minValue, maxValue, top, panelHeight);
    const closeY = valueToY(bar.close, minValue, maxValue, top, panelHeight);
    const isUp = bar.close >= bar.open;
    const wickColor = isUp ? theme.candleUp : theme.candleDown;
    const bodyColor = isUp ? theme.candleUpFill : theme.candleDownFill;
    const bodyTop = Math.min(openY, closeY);
    const bodyBottom = Math.max(openY, closeY);
    const bodyHeight = Math.max(2, Math.round(bodyBottom - bodyTop));

    drawLine(buffer, width, height, x, highY, x, lowY, wickColor, 1);
    fillRect(
      buffer,
      width,
      height,
      x - Math.floor(candleWidth / 2),
      Math.round(bodyTop),
      candleWidth,
      bodyHeight,
      bodyColor,
    );
    drawLine(
      buffer,
      width,
      height,
      x - Math.floor(candleWidth / 2),
      Math.round(bodyTop),
      x + Math.floor(candleWidth / 2),
      Math.round(bodyTop),
      wickColor,
      1,
    );
    drawLine(
      buffer,
      width,
      height,
      x - Math.floor(candleWidth / 2),
      Math.round(bodyTop + bodyHeight),
      x + Math.floor(candleWidth / 2),
      Math.round(bodyTop + bodyHeight),
      wickColor,
      1,
    );
  });
}

function buildCrcTable() {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let current = index;
    for (let bit = 0; bit < 8; bit += 1) {
      if (current & 1) {
        current = 0xedb88320 ^ (current >>> 1);
      } else {
        current >>>= 1;
      }
    }
    table[index] = current >>> 0;
  }
  return table;
}

const CRC_TABLE = buildCrcTable();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let index = 0; index < buffer.length; index += 1) {
    crc = CRC_TABLE[(crc ^ buffer[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32BE(data.length, 0);
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([lengthBuffer, typeBuffer, data, crcBuffer]);
}

function encodePng(width, height, rgbaBuffer) {
  const header = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let row = 0; row < height; row += 1) {
    const rawOffset = row * (stride + 1);
    raw[rawOffset] = 0;
    rgbaBuffer.copy(raw, rawOffset + 1, row * stride, row * stride + stride);
  }

  return Buffer.concat([
    header,
    makeChunk("IHDR", ihdr),
    makeChunk("IDAT", zlib.deflateSync(raw)),
    makeChunk("IEND", Buffer.alloc(0)),
  ]);
}

function pickTickIndices(length, count) {
  if (length <= 0) {
    return [];
  }
  const target = Math.min(count, length);
  const indices = new Set([0, length - 1]);
  if (target > 2) {
    for (let slot = 1; slot < target - 1; slot += 1) {
      indices.add(Math.round((slot * (length - 1)) / (target - 1)));
    }
  }
  return [...indices].sort((a, b) => a - b);
}

function dateLabel(dateString) {
  return dateString.slice(5);
}

function valueToY(value, minValue, maxValue, top, height) {
  return top + ((maxValue - value) / (maxValue - minValue)) * height;
}

function nonNullPoint(x, value, minValue, maxValue, top, height) {
  if (!Number.isFinite(value)) {
    return null;
  }
  return {
    x,
    y: valueToY(value, minValue, maxValue, top, height),
  };
}

function mapSeriesToPoints(series, xForSlot, slotOffset, minValue, maxValue, top, height, totalSlots) {
  const points = Array.from({ length: totalSlots }, () => null);
  series.forEach((value, index) => {
    const slot = index + slotOffset;
    if (slot >= 0 && slot < totalSlots && Number.isFinite(value)) {
      points[slot] = nonNullPoint(xForSlot(slot), value, minValue, maxValue, top, height);
    }
  });
  return points;
}

function appendSuffixToPath(targetPath, suffix) {
  const extension = path.extname(targetPath);
  if (extension) {
    return `${targetPath.slice(0, -extension.length)}-${suffix}${extension}`;
  }
  return `${targetPath}-${suffix}.png`;
}

function buildChartPngs(data, bars, metrics, options) {
  const width = options.width;
  const height = options.height;
  const chartBars = Math.max(30, options.chartBars);
  const barsWindow = bars.slice(-Math.min(chartBars, bars.length));
  const startIndex = bars.length - barsWindow.length;
  const leadSlots = 26;
  const totalSlots = barsWindow.length + leadSlots;

  const theme = {
    background: [248, 250, 252, 255],
    panel: [255, 255, 255, 255],
    border: [203, 213, 225, 255],
    grid: [226, 232, 240, 255],
    text: [30, 41, 59, 255],
    muted: [100, 116, 139, 255],
    close: [30, 64, 175, 255],
    lastPriceGuide: [30, 64, 175, 110],
    candleUp: [220, 38, 38, 255],
    candleUpFill: [248, 113, 113, 180],
    candleDown: [37, 99, 235, 255],
    candleDownFill: [96, 165, 250, 180],
    ma5: [34, 197, 94, 255],
    ma20: [239, 68, 68, 255],
    ma60: [249, 115, 22, 255],
    ma120: [147, 51, 234, 255],
    bollinger: [15, 23, 42, 255],
    bollingerFill: [15, 23, 42, 28],
    tenkan: [192, 38, 211, 255],
    kijun: [217, 119, 6, 255],
    senkouA: [34, 197, 94, 220],
    senkouB: [239, 68, 68, 220],
    cloudBull: [34, 197, 94, 42],
    cloudBear: [239, 68, 68, 42],
    volumeUp: [34, 197, 94, 255],
    volumeDown: [239, 68, 68, 255],
    rsi: [124, 58, 237, 255],
    rsiGuide: [148, 163, 184, 255],
    macd: [37, 99, 235, 255],
    signal: [249, 115, 22, 255],
    histogramPositive: [34, 197, 94, 220],
    histogramNegative: [239, 68, 68, 220],
    zeroGuide: [148, 163, 184, 255],
    adx: [30, 41, 59, 255],
    plusDi: [34, 197, 94, 255],
    minusDi: [239, 68, 68, 255],
    adxGuide: [148, 163, 184, 255],
    structureResistance: [231, 76, 60, 255],
    structureSupport: [52, 152, 219, 255],
    zoneSupport: [52, 152, 219, 46],
    zoneResistance: [231, 76, 60, 46],
    zoneFlipped: [155, 89, 182, 46],
    volumeProfileBar: [148, 163, 184, 200],
    volumeProfilePoc: [249, 115, 22, 230],
    waveLine: [14, 116, 144, 255],
    wavePoint: [8, 145, 178, 255],
    fibRetracement: [100, 116, 139, 200],
    fibExtension: [124, 58, 237, 200],
  };

  const margin = { left: 100, right: 120, top: 84, bottom: 78 };
  const plotWidth = width - margin.left - margin.right;
  const headerHeight = 92;
  const gap = 26;
  const basePlotHeight = height - margin.top - margin.bottom - headerHeight;
  const dualPanelHeight = basePlotHeight - gap;
  const mainVolumeHeight = Math.max(90, Math.min(150, Math.round(dualPanelHeight * 0.22)));
  const mainPriceHeight = dualPanelHeight - mainVolumeHeight;
  const overlayRsiHeight = Math.max(90, Math.min(150, Math.round(dualPanelHeight * 0.22)));
  const overlayPriceHeight = dualPanelHeight - overlayRsiHeight;
  const momentumHistogramHeight = Math.max(80, Math.min(120, Math.round(dualPanelHeight * 0.22)));
  const momentumAdxHeight = Math.max(90, Math.min(140, Math.round(dualPanelHeight * 0.28)));
  const momentumLineHeight = dualPanelHeight - momentumHistogramHeight - momentumAdxHeight - gap;

  const priceSeries = {
    close: barsWindow.map((bar) => bar.close),
    ma5: metrics.ma5Series.slice(startIndex),
    ma20: metrics.ma20Series.slice(startIndex),
    ma60: metrics.ma60Series.slice(startIndex),
    ma120: metrics.ma120Series.slice(startIndex),
    bbUpper: metrics.bollingerSeriesData.upper.slice(startIndex),
    bbLower: metrics.bollingerSeriesData.lower.slice(startIndex),
    tenkan: metrics.ichimokuSeriesData.tenkan.slice(startIndex),
    kijun: metrics.ichimokuSeriesData.kijun.slice(startIndex),
    macd: metrics.macdSeriesData.macd.slice(startIndex),
    signal: metrics.macdSeriesData.signal.slice(startIndex),
    histogram: metrics.macdSeriesData.histogram.slice(startIndex),
    adx: metrics.adxSeriesData.adx.slice(startIndex),
    plusDi: metrics.adxSeriesData.plusDi.slice(startIndex),
    minusDi: metrics.adxSeriesData.minusDi.slice(startIndex),
  };

  const volumeMax = Math.max(...barsWindow.map((bar) => (Number.isFinite(bar.volume) ? bar.volume : 0)), 1);
  const buildPriceRange = (seriesCollection) => {
    const values = [];
    barsWindow.forEach((bar) => {
      ["high", "low", "close"].forEach((key) => {
        if (Number.isFinite(bar[key])) {
          values.push(bar[key]);
        }
      });
    });
    seriesCollection.forEach((series) => {
      series.forEach((value) => {
        if (Number.isFinite(value)) {
          values.push(value);
        }
      });
    });
    let priceMin = Math.min(...values);
    let priceMax = Math.max(...values);
    if (priceMin === priceMax) {
      priceMin -= 1;
      priceMax += 1;
    }
    const pricePadding = (priceMax - priceMin) * 0.08;
    return {
      min: priceMin - pricePadding,
      max: priceMax + pricePadding,
    };
  };

  const drawPriceAxis = (buffer, panelTop, panelHeight, priceMin, priceMax) => {
    for (let tick = 0; tick <= 4; tick += 1) {
      const y = panelTop + (panelHeight * tick) / 4;
      drawLine(buffer, width, height, margin.left, y, margin.left + plotWidth, y, theme.grid, 1);
      const value = priceMax - ((priceMax - priceMin) * tick) / 4;
      drawText(buffer, width, height, margin.left + plotWidth + 10, y - 7, formatAxisNumber(value), theme.muted, 2);
    }
  };

  const drawVolumeAxis = (buffer, panelTop, panelHeight) => {
    for (let tick = 0; tick <= 2; tick += 1) {
      const y = panelTop + (panelHeight * tick) / 2;
      drawLine(buffer, width, height, margin.left, y, margin.left + plotWidth, y, theme.grid, 1);
      const value = Math.round(volumeMax - (volumeMax * tick) / 2);
      drawText(buffer, width, height, margin.left + plotWidth + 10, y - 7, formatAxisNumber(value), theme.muted, 2);
    }
  };

  const drawRsiAxis = (buffer, panelTop, panelHeight) => {
    [30, 50, 70].forEach((level) => {
      const y = valueToY(level, 0, 100, panelTop, panelHeight);
      drawLine(buffer, width, height, margin.left, y, margin.left + plotWidth, y, theme.rsiGuide, 1);
      drawText(buffer, width, height, margin.left + plotWidth + 10, y - 7, String(level), theme.muted, 2);
    });
  };

  const drawAdxAxis = (buffer, panelTop, panelHeight) => {
    [20, 25, 40].forEach((level) => {
      const y = valueToY(level, 0, 60, panelTop, panelHeight);
      drawLine(buffer, width, height, margin.left, y, margin.left + plotWidth, y, theme.adxGuide, 1);
      drawText(buffer, width, height, margin.left + plotWidth + 10, y - 7, String(level), theme.muted, 2);
    });
  };

  const buildIndicatorRange = (seriesCollection, options = {}) => {
    const values = [];
    seriesCollection.forEach((series) => {
      series.forEach((value) => {
        if (Number.isFinite(value)) {
          values.push(value);
        }
      });
    });
    if (options.includeZero) {
      values.push(0);
    }
    if (values.length === 0) {
      return { min: -1, max: 1 };
    }
    let minValue = Math.min(...values);
    let maxValue = Math.max(...values);
    if (minValue === maxValue) {
      minValue -= 1;
      maxValue += 1;
    }
    const padding = (maxValue - minValue) * 0.12;
    return {
      min: minValue - padding,
      max: maxValue + padding,
    };
  };

  const drawZeroGuide = (buffer, panelTop, panelHeight, range, color = theme.zeroGuide) => {
    if (!(range.min <= 0 && range.max >= 0)) {
      return;
    }
    const y = valueToY(0, range.min, range.max, panelTop, panelHeight);
    drawLine(buffer, width, height, margin.left, y, margin.left + plotWidth, y, color, 1);
    drawText(buffer, width, height, margin.left + plotWidth + 10, y - 7, "0", theme.muted, 2);
  };

  const drawDateTicks = (buffer, xForSlot, chartBottom, labelBottom, totalSlotsForGrid) => {
    const dateTickIndices = pickTickIndices(barsWindow.length, 6);
    dateTickIndices.forEach((index) => {
      const x = xForSlot(index);
      drawLine(buffer, width, height, x, margin.top + headerHeight, x, chartBottom, theme.grid, 1);
      drawText(buffer, width, height, x, labelBottom, dateLabel(barsWindow[index].date), theme.muted, 2, "center");
    });
    if (totalSlotsForGrid > barsWindow.length) {
      const latestX = xForSlot(barsWindow.length - 1);
      drawLine(buffer, width, height, latestX, margin.top + headerHeight, latestX, chartBottom, theme.border, 1);
    }
  };

  const writePng = (outputPath, rgbaBuffer) => {
    const png = encodePng(width, height, rgbaBuffer);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, png);
  };

  const chartPaths = {
    mainOutput: path.resolve(options.pngOut),
    overlayOutput: path.resolve(appendSuffixToPath(options.pngOut, "overlay")),
    momentumOutput: path.resolve(appendSuffixToPath(options.pngOut, "momentum")),
    structureOutput: path.resolve(appendSuffixToPath(options.pngOut, "structure")),
    patternOutput: path.resolve(appendSuffixToPath(options.pngOut, "pattern")),
    mainImagePath: options.imagePath || path.basename(options.pngOut),
    overlayImagePath: options.imagePath
      ? appendSuffixToPath(options.imagePath, "overlay")
      : appendSuffixToPath(path.basename(options.pngOut), "overlay"),
    momentumImagePath: options.imagePath
      ? appendSuffixToPath(options.imagePath, "momentum")
      : appendSuffixToPath(path.basename(options.pngOut), "momentum"),
    structureImagePath: options.imagePath
      ? appendSuffixToPath(options.imagePath, "structure")
      : appendSuffixToPath(path.basename(options.pngOut), "structure"),
    patternImagePath: options.imagePath
      ? appendSuffixToPath(options.imagePath, "pattern")
      : appendSuffixToPath(path.basename(options.pngOut), "pattern"),
  };

  const buildMomentumChart = () => {
    const buffer = createRgbaBuffer(width, height, theme.background);
    const totalSlotsForMomentum = barsWindow.length;
    const chartTitle = String(data.name || data.ticker || "UNKNOWN");
    const xForSlot = (slot) => {
      if (totalSlotsForMomentum <= 1) {
        return margin.left + plotWidth / 2;
      }
      return margin.left + (plotWidth * slot) / (totalSlotsForMomentum - 1);
    };

    const macdTop = margin.top + headerHeight;
    const histogramTop = macdTop + momentumLineHeight + gap;
    const adxTop = histogramTop + momentumHistogramHeight + gap;
    const macdRange = buildIndicatorRange([priceSeries.macd, priceSeries.signal], { includeZero: true });
    const histogramRange = buildIndicatorRange([priceSeries.histogram], { includeZero: true });
    const adxRange = { min: 0, max: 60 };

    fillRect(buffer, width, height, margin.left, macdTop, plotWidth, momentumLineHeight, theme.panel);
    fillRect(buffer, width, height, margin.left, histogramTop, plotWidth, momentumHistogramHeight, theme.panel);
    fillRect(buffer, width, height, margin.left, adxTop, plotWidth, momentumAdxHeight, theme.panel);

    drawLine(buffer, width, height, margin.left, macdTop, margin.left + plotWidth, macdTop, theme.border, 1);
    drawLine(buffer, width, height, margin.left, macdTop + momentumLineHeight, margin.left + plotWidth, macdTop + momentumLineHeight, theme.border, 1);
    drawLine(buffer, width, height, margin.left, histogramTop, margin.left + plotWidth, histogramTop, theme.border, 1);
    drawLine(buffer, width, height, margin.left, histogramTop + momentumHistogramHeight, margin.left + plotWidth, histogramTop + momentumHistogramHeight, theme.border, 1);
    drawLine(buffer, width, height, margin.left, adxTop, margin.left + plotWidth, adxTop, theme.border, 1);
    drawLine(buffer, width, height, margin.left, adxTop + momentumAdxHeight, margin.left + plotWidth, adxTop + momentumAdxHeight, theme.border, 1);
    drawLine(buffer, width, height, margin.left, macdTop, margin.left, adxTop + momentumAdxHeight, theme.border, 1);
    drawLine(buffer, width, height, margin.left + plotWidth, macdTop, margin.left + plotWidth, adxTop + momentumAdxHeight, theme.border, 1);

    drawText(buffer, width, height, margin.left, margin.top + 4, chartTitle, theme.text, 3);
    drawText(buffer, width, height, margin.left, margin.top + 34, `${data.ticker || "UNKNOWN"} MACD momentum`, theme.muted, 2);
    drawText(buffer, width, height, margin.left + plotWidth, margin.top + 10, `As of ${metrics.latest.date}`, theme.muted, 2, "right");

    let legendX = margin.left;
    const legendY = margin.top + 56;
    legendX = drawLegendItem(buffer, width, height, legendX, legendY, theme.macd, "MACD");
    legendX = drawLegendItem(buffer, width, height, legendX, legendY, theme.signal, "Signal");
    legendX = drawLegendItem(buffer, width, height, legendX, legendY, theme.histogramPositive, "Histogram +");
    legendX = drawLegendItem(buffer, width, height, legendX, legendY, theme.histogramNegative, "Histogram -");
    legendX = drawLegendItem(buffer, width, height, legendX, legendY, theme.adx, "ADX");
    legendX = drawLegendItem(buffer, width, height, legendX, legendY, theme.plusDi, "+DI");
    drawLegendItem(buffer, width, height, legendX, legendY, theme.minusDi, "-DI");

    drawText(buffer, width, height, margin.left - 56, macdTop + 6, "MACD", theme.muted, 2);
    drawText(buffer, width, height, margin.left - 86, histogramTop + 6, "Histogram", theme.muted, 2);
    drawText(buffer, width, height, margin.left - 60, adxTop + 6, "ADX/DMI", theme.muted, 2);

    drawPriceAxis(buffer, macdTop, momentumLineHeight, macdRange.min, macdRange.max);
    drawPriceAxis(buffer, histogramTop, momentumHistogramHeight, histogramRange.min, histogramRange.max);
    drawAdxAxis(buffer, adxTop, momentumAdxHeight);
    drawZeroGuide(buffer, macdTop, momentumLineHeight, macdRange);
    drawZeroGuide(buffer, histogramTop, momentumHistogramHeight, histogramRange);
    drawDateTicks(buffer, xForSlot, adxTop + momentumAdxHeight, adxTop + momentumAdxHeight + 14, totalSlotsForMomentum);
    drawText(buffer, width, height, margin.left + plotWidth / 2, adxTop + momentumAdxHeight + 42, "Date", theme.muted, 2, "center");

    const macdPoints = mapSeriesToPoints(priceSeries.macd, xForSlot, 0, macdRange.min, macdRange.max, macdTop, momentumLineHeight, totalSlotsForMomentum);
    const signalPoints = mapSeriesToPoints(priceSeries.signal, xForSlot, 0, macdRange.min, macdRange.max, macdTop, momentumLineHeight, totalSlotsForMomentum);
    const histogramPoints = mapSeriesToPoints(
      priceSeries.histogram,
      xForSlot,
      0,
      histogramRange.min,
      histogramRange.max,
      histogramTop,
      momentumHistogramHeight,
      totalSlotsForMomentum,
    );
    const adxPoints = mapSeriesToPoints(priceSeries.adx, xForSlot, 0, adxRange.min, adxRange.max, adxTop, momentumAdxHeight, totalSlotsForMomentum);
    const plusDiPoints = mapSeriesToPoints(priceSeries.plusDi, xForSlot, 0, adxRange.min, adxRange.max, adxTop, momentumAdxHeight, totalSlotsForMomentum);
    const minusDiPoints = mapSeriesToPoints(priceSeries.minusDi, xForSlot, 0, adxRange.min, adxRange.max, adxTop, momentumAdxHeight, totalSlotsForMomentum);
    const histogramZeroY = valueToY(0, histogramRange.min, histogramRange.max, histogramTop, momentumHistogramHeight);

    const histogramBarWidth = Math.max(4, Math.floor(plotWidth / Math.max(totalSlotsForMomentum * 1.9, 1)));
    priceSeries.histogram.forEach((value, index) => {
      const point = histogramPoints[index];
      if (!point || !Number.isFinite(value)) {
        return;
      }
      const topY = Math.min(point.y, histogramZeroY);
      const barHeight = Math.max(2, Math.abs(point.y - histogramZeroY));
      fillRect(
        buffer,
        width,
        height,
        point.x - histogramBarWidth / 2,
        topY,
        histogramBarWidth,
        barHeight,
        value >= 0 ? theme.histogramPositive : theme.histogramNegative,
      );
    });

    drawSeries(buffer, width, height, macdPoints, theme.macd, 3);
    drawSeries(buffer, width, height, signalPoints, theme.signal, 3);
    drawSeries(buffer, width, height, adxPoints, theme.adx, 3);
    drawSeries(buffer, width, height, plusDiPoints, theme.plusDi, 2);
    drawSeries(buffer, width, height, minusDiPoints, theme.minusDi, 2);

    const latestMacdPoint = macdPoints[barsWindow.length - 1];
    if (latestMacdPoint) {
      fillRect(buffer, width, height, latestMacdPoint.x - 4, latestMacdPoint.y - 4, 8, 8, theme.macd);
      drawValueCallout(
        buffer,
        width,
        height,
        margin.left + plotWidth - 8,
        latestMacdPoint.y,
        `MACD ${formatAxisNumber(metrics.macd.macdValue)}`,
        theme,
        macdTop,
        momentumLineHeight,
      );
    }

    const latestSignalPoint = signalPoints[barsWindow.length - 1];
    if (latestSignalPoint) {
      fillRect(buffer, width, height, latestSignalPoint.x - 4, latestSignalPoint.y - 4, 8, 8, theme.signal);
    }

    const latestAdxPoint = adxPoints[barsWindow.length - 1];
    if (latestAdxPoint) {
      fillRect(buffer, width, height, latestAdxPoint.x - 4, latestAdxPoint.y - 4, 8, 8, theme.adx);
    }

    drawTextBox(
      buffer,
      width,
      height,
      margin.left + 16,
      macdTop + 16,
      Math.min(620, plotWidth - 32),
      buildMomentumInterpretationLines(metrics),
      theme,
    );

    writePng(chartPaths.momentumOutput, buffer);
  };

  const buildMainTrendChart = () => {
    const buffer = createRgbaBuffer(width, height, theme.background);
    const totalSlotsForMain = barsWindow.length;
    const chartTitle = String(data.name || data.ticker || "UNKNOWN");
    const xForSlot = (slot) => {
      if (totalSlotsForMain <= 1) {
        return margin.left + plotWidth / 2;
      }
      return margin.left + (plotWidth * slot) / (totalSlotsForMain - 1);
    };

    const priceTop = margin.top + headerHeight;
    const volumeTop = priceTop + mainPriceHeight + gap;
    const priceRange = buildPriceRange([
      priceSeries.close,
      priceSeries.ma5,
      priceSeries.ma20,
      priceSeries.ma60,
      priceSeries.ma120,
    ]);

    fillRect(buffer, width, height, margin.left, priceTop, plotWidth, mainPriceHeight, theme.panel);
    fillRect(buffer, width, height, margin.left, volumeTop, plotWidth, mainVolumeHeight, theme.panel);

    drawLine(buffer, width, height, margin.left, priceTop, margin.left + plotWidth, priceTop, theme.border, 1);
    drawLine(buffer, width, height, margin.left, priceTop + mainPriceHeight, margin.left + plotWidth, priceTop + mainPriceHeight, theme.border, 1);
    drawLine(buffer, width, height, margin.left, volumeTop, margin.left + plotWidth, volumeTop, theme.border, 1);
    drawLine(buffer, width, height, margin.left, volumeTop + mainVolumeHeight, margin.left + plotWidth, volumeTop + mainVolumeHeight, theme.border, 1);
    drawLine(buffer, width, height, margin.left, priceTop, margin.left, volumeTop + mainVolumeHeight, theme.border, 1);
    drawLine(buffer, width, height, margin.left + plotWidth, priceTop, margin.left + plotWidth, volumeTop + mainVolumeHeight, theme.border, 1);

    drawText(buffer, width, height, margin.left, margin.top + 4, chartTitle, theme.text, 3);
    drawText(buffer, width, height, margin.left, margin.top + 34, `${data.ticker || "UNKNOWN"} 주가 추세`, theme.muted, 2);
    drawText(buffer, width, height, margin.left + plotWidth, margin.top + 10, `기준일 ${metrics.latest.date}`, theme.muted, 2, "right");

    const legendY = margin.top + 56;
    let legendX = margin.left;
    legendX = drawLegendItem(buffer, width, height, legendX, legendY, theme.candleUpFill, "캔들");
    legendX = drawLegendItem(buffer, width, height, legendX, legendY, theme.close, "종가선");
    legendX = drawLegendItem(buffer, width, height, legendX, legendY, theme.ma5, "5일선");
    legendX = drawLegendItem(buffer, width, height, legendX, legendY, theme.ma20, "20일선");
    legendX = drawLegendItem(buffer, width, height, legendX, legendY, theme.ma60, "60일선");
    drawLegendItem(buffer, width, height, legendX, legendY, theme.ma120, "120일선");

    drawText(buffer, width, height, margin.left - 54, priceTop + 6, "주가", theme.muted, 2);
    drawText(buffer, width, height, margin.left - 72, volumeTop + 6, "거래량", theme.muted, 2);

    drawPriceAxis(buffer, priceTop, mainPriceHeight, priceRange.min, priceRange.max);
    drawVolumeAxis(buffer, volumeTop, mainVolumeHeight);
    drawDateTicks(buffer, xForSlot, volumeTop + mainVolumeHeight, volumeTop + mainVolumeHeight + 14, totalSlotsForMain);
    drawText(buffer, width, height, margin.left + plotWidth / 2, volumeTop + mainVolumeHeight + 42, "날짜", theme.muted, 2, "center");

    const closePoints = mapSeriesToPoints(priceSeries.close, xForSlot, 0, priceRange.min, priceRange.max, priceTop, mainPriceHeight, totalSlotsForMain);
    const ma5Points = mapSeriesToPoints(priceSeries.ma5, xForSlot, 0, priceRange.min, priceRange.max, priceTop, mainPriceHeight, totalSlotsForMain);
    const ma20Points = mapSeriesToPoints(priceSeries.ma20, xForSlot, 0, priceRange.min, priceRange.max, priceTop, mainPriceHeight, totalSlotsForMain);
    const ma60Points = mapSeriesToPoints(priceSeries.ma60, xForSlot, 0, priceRange.min, priceRange.max, priceTop, mainPriceHeight, totalSlotsForMain);
    const ma120Points = mapSeriesToPoints(priceSeries.ma120, xForSlot, 0, priceRange.min, priceRange.max, priceTop, mainPriceHeight, totalSlotsForMain);

    drawCandlesticks(buffer, width, height, barsWindow, xForSlot, priceRange.min, priceRange.max, priceTop, mainPriceHeight, theme);
    drawSeries(buffer, width, height, closePoints, theme.close, 1);
    drawSeries(buffer, width, height, ma120Points, theme.ma120, 2);
    drawSeries(buffer, width, height, ma60Points, theme.ma60, 2);
    drawSeries(buffer, width, height, ma20Points, theme.ma20, 2);
    drawSeries(buffer, width, height, ma5Points, theme.ma5, 2);

    const latestClosePoint = closePoints[barsWindow.length - 1];
    if (latestClosePoint) {
      drawLine(
        buffer,
        width,
        height,
        margin.left,
        latestClosePoint.y,
        margin.left + plotWidth,
        latestClosePoint.y,
        theme.lastPriceGuide,
        1,
      );
      fillRect(buffer, width, height, latestClosePoint.x - 4, latestClosePoint.y - 4, 8, 8, theme.close);
      drawValueCallout(
        buffer,
        width,
        height,
        margin.left + plotWidth - 8,
        latestClosePoint.y,
        `현재가 ${formatAxisNumber(metrics.latestClose)}`,
        theme,
        priceTop,
        mainPriceHeight,
      );
    }

    const volumeBarWidth = Math.max(3, Math.floor(plotWidth / Math.max(barsWindow.length * 1.8, 1)));
    barsWindow.forEach((bar, index) => {
      if (!Number.isFinite(bar.volume)) {
        return;
      }
      const x = xForSlot(index);
      const previousClose = index === 0 ? bar.close : barsWindow[index - 1].close;
      const color = bar.close >= previousClose ? theme.volumeUp : theme.volumeDown;
      const barHeight = Math.max(2, Math.round((bar.volume / volumeMax) * (mainVolumeHeight - 4)));
      fillRect(buffer, width, height, x - volumeBarWidth / 2, volumeTop + mainVolumeHeight - barHeight, volumeBarWidth, barHeight, color);
    });

    drawTextBox(
      buffer,
      width,
      height,
      margin.left + 16,
      priceTop + 16,
      Math.min(620, plotWidth - 32),
      buildMainInterpretationLines(metrics),
      theme,
    );

    writePng(chartPaths.mainOutput, buffer);
  };

  const buildOverlayChart = () => {
    const buffer = createRgbaBuffer(width, height, theme.background);
    const chartTitle = String(data.name || data.ticker || "UNKNOWN");
    const xForSlot = (slot) => {
      if (totalSlots <= 1) {
        return margin.left + plotWidth / 2;
      }
      return margin.left + (plotWidth * slot) / (totalSlots - 1);
    };

    const priceTop = margin.top + headerHeight;
    const rsiTop = priceTop + overlayPriceHeight + gap;
    const priceRange = buildPriceRange([
      priceSeries.close,
      priceSeries.bbUpper,
      priceSeries.bbLower,
      priceSeries.tenkan,
      priceSeries.kijun,
      metrics.ichimokuSeriesData.senkouA.slice(startIndex),
      metrics.ichimokuSeriesData.senkouB.slice(startIndex),
    ]);

    fillRect(buffer, width, height, margin.left, priceTop, plotWidth, overlayPriceHeight, theme.panel);
    fillRect(buffer, width, height, margin.left, rsiTop, plotWidth, overlayRsiHeight, theme.panel);

    drawLine(buffer, width, height, margin.left, priceTop, margin.left + plotWidth, priceTop, theme.border, 1);
    drawLine(buffer, width, height, margin.left, priceTop + overlayPriceHeight, margin.left + plotWidth, priceTop + overlayPriceHeight, theme.border, 1);
    drawLine(buffer, width, height, margin.left, rsiTop, margin.left + plotWidth, rsiTop, theme.border, 1);
    drawLine(buffer, width, height, margin.left, rsiTop + overlayRsiHeight, margin.left + plotWidth, rsiTop + overlayRsiHeight, theme.border, 1);
    drawLine(buffer, width, height, margin.left, priceTop, margin.left, rsiTop + overlayRsiHeight, theme.border, 1);
    drawLine(buffer, width, height, margin.left + plotWidth, priceTop, margin.left + plotWidth, rsiTop + overlayRsiHeight, theme.border, 1);

    drawText(buffer, width, height, margin.left, margin.top + 4, chartTitle, theme.text, 3);
    drawText(buffer, width, height, margin.left, margin.top + 34, `${data.ticker || "UNKNOWN"} 보조지표`, theme.muted, 2);
    drawText(buffer, width, height, margin.left + plotWidth, margin.top + 10, `기준일 ${metrics.latest.date}`, theme.muted, 2, "right");

    const legendRow1Y = margin.top + 52;
    const legendRow2Y = margin.top + 72;
    let legendX = margin.left;
    legendX = drawLegendItem(buffer, width, height, legendX, legendRow1Y, theme.close, "종가선");
    legendX = drawLegendItem(buffer, width, height, legendX, legendRow1Y, theme.bollinger, "볼린저밴드");
    legendX = drawLegendItem(buffer, width, height, legendX, legendRow1Y, theme.tenkan, "전환선");
    drawLegendItem(buffer, width, height, legendX, legendRow1Y, theme.kijun, "기준선");

    legendX = margin.left;
    legendX = drawLegendItem(buffer, width, height, legendX, legendRow2Y, theme.senkouA, "일목 선행1");
    drawLegendItem(buffer, width, height, legendX, legendRow2Y, theme.senkouB, "일목 선행2");

    drawText(buffer, width, height, margin.left - 54, priceTop + 6, "주가", theme.muted, 2);
    drawText(buffer, width, height, margin.left - 86, rsiTop + 6, "상대강도", theme.muted, 2);

    drawPriceAxis(buffer, priceTop, overlayPriceHeight, priceRange.min, priceRange.max);
    drawRsiAxis(buffer, rsiTop, overlayRsiHeight);
    drawDateTicks(buffer, xForSlot, rsiTop + overlayRsiHeight, rsiTop + overlayRsiHeight + 14, totalSlots);
    drawText(buffer, width, height, margin.left + plotWidth / 2, rsiTop + overlayRsiHeight + 42, "날짜", theme.muted, 2, "center");

    const closePoints = mapSeriesToPoints(priceSeries.close, xForSlot, 0, priceRange.min, priceRange.max, priceTop, overlayPriceHeight, totalSlots);
    const bbUpperPoints = mapSeriesToPoints(priceSeries.bbUpper, xForSlot, 0, priceRange.min, priceRange.max, priceTop, overlayPriceHeight, totalSlots);
    const bbLowerPoints = mapSeriesToPoints(priceSeries.bbLower, xForSlot, 0, priceRange.min, priceRange.max, priceTop, overlayPriceHeight, totalSlots);
    const tenkanPoints = mapSeriesToPoints(priceSeries.tenkan, xForSlot, 0, priceRange.min, priceRange.max, priceTop, overlayPriceHeight, totalSlots);
    const kijunPoints = mapSeriesToPoints(priceSeries.kijun, xForSlot, 0, priceRange.min, priceRange.max, priceTop, overlayPriceHeight, totalSlots);
    const senkouAPoints = mapSeriesToPoints(metrics.ichimokuSeriesData.senkouA.slice(startIndex), xForSlot, 26, priceRange.min, priceRange.max, priceTop, overlayPriceHeight, totalSlots);
    const senkouBPoints = mapSeriesToPoints(metrics.ichimokuSeriesData.senkouB.slice(startIndex), xForSlot, 26, priceRange.min, priceRange.max, priceTop, overlayPriceHeight, totalSlots);
    const rsiPoints = mapSeriesToPoints(metrics.rsi14Series.slice(startIndex), xForSlot, 0, 0, 100, rsiTop, overlayRsiHeight, totalSlots);

    drawFilledBand(buffer, width, height, bbUpperPoints, bbLowerPoints, theme.bollingerFill);

    const cloudUpperPoints = [];
    const cloudLowerPoints = [];
    const cloudColors = [];
    for (let index = 0; index < totalSlots; index += 1) {
      const aPoint = senkouAPoints[index];
      const bPoint = senkouBPoints[index];
      if (aPoint && bPoint) {
        cloudUpperPoints[index] = aPoint.y <= bPoint.y ? aPoint : bPoint;
        cloudLowerPoints[index] = aPoint.y > bPoint.y ? aPoint : bPoint;
        cloudColors[index] = aPoint.y <= bPoint.y ? theme.cloudBull : theme.cloudBear;
      } else {
        cloudUpperPoints[index] = null;
        cloudLowerPoints[index] = null;
        cloudColors[index] = null;
      }
    }

    for (let index = 0; index < totalSlots; index += 1) {
      if (cloudUpperPoints[index] && cloudLowerPoints[index]) {
        drawVerticalBand(
          buffer,
          width,
          height,
          Math.round(cloudUpperPoints[index].x),
          cloudUpperPoints[index].y,
          cloudLowerPoints[index].y,
          cloudColors[index],
          3,
        );
      }
    }

    drawSeries(buffer, width, height, bbUpperPoints, theme.bollinger, 2);
    drawSeries(buffer, width, height, bbLowerPoints, theme.bollinger, 2);
    drawSeries(buffer, width, height, senkouAPoints, theme.senkouA, 2);
    drawSeries(buffer, width, height, senkouBPoints, theme.senkouB, 2);
    drawSeries(buffer, width, height, tenkanPoints, theme.tenkan, 2);
    drawSeries(buffer, width, height, kijunPoints, theme.kijun, 2);
    drawSeries(buffer, width, height, closePoints, theme.close, 3);
    drawSeries(buffer, width, height, rsiPoints, theme.rsi, 3);

    const latestClosePoint = closePoints[barsWindow.length - 1];
    if (latestClosePoint) {
      drawLine(
        buffer,
        width,
        height,
        margin.left,
        latestClosePoint.y,
        margin.left + plotWidth,
        latestClosePoint.y,
        theme.lastPriceGuide,
        1,
      );
      fillRect(buffer, width, height, latestClosePoint.x - 4, latestClosePoint.y - 4, 8, 8, theme.close);
      drawValueCallout(
        buffer,
        width,
        height,
        margin.left + plotWidth - 8,
        latestClosePoint.y,
        `현재가 ${formatAxisNumber(metrics.latestClose)}`,
        theme,
        priceTop,
        overlayPriceHeight,
      );
    }

    const latestRsiPoint = rsiPoints[barsWindow.length - 1];
    if (latestRsiPoint) {
      fillRect(buffer, width, height, latestRsiPoint.x - 4, latestRsiPoint.y - 4, 8, 8, theme.rsi);
    }

    drawTextBox(
      buffer,
      width,
      height,
      margin.left + 16,
      priceTop + 16,
      Math.min(620, plotWidth - 32),
      buildOverlayInterpretationLines(metrics),
      theme,
    );

    writePng(chartPaths.overlayOutput, buffer);
  };

  const buildStructureChart = () => {
    const buffer = createRgbaBuffer(width, height, theme.background);
    const totalSlotsForStructure = barsWindow.length;
    const chartTitle = String(data.name || data.ticker || "UNKNOWN");
    const gutterWidth = Math.max(100, Math.round(plotWidth * 0.18));
    const gutterGap = 12;
    const candleAreaWidth = plotWidth - gutterWidth - gutterGap;
    const gutterLeft = margin.left + candleAreaWidth + gutterGap;
    const xForSlot = (slot) => {
      if (totalSlotsForStructure <= 1) {
        return margin.left + candleAreaWidth / 2;
      }
      return margin.left + (candleAreaWidth * slot) / (totalSlotsForStructure - 1);
    };

    const priceTop = margin.top + headerHeight;
    const structurePriceHeight = basePlotHeight;
    const priceRange = buildPriceRange([priceSeries.close]);

    fillRect(buffer, width, height, margin.left, priceTop, candleAreaWidth, structurePriceHeight, theme.panel);
    fillRect(buffer, width, height, gutterLeft, priceTop, gutterWidth, structurePriceHeight, theme.panel);

    drawLine(buffer, width, height, margin.left, priceTop, margin.left + candleAreaWidth, priceTop, theme.border, 1);
    drawLine(buffer, width, height, margin.left, priceTop + structurePriceHeight, margin.left + candleAreaWidth, priceTop + structurePriceHeight, theme.border, 1);
    drawLine(buffer, width, height, margin.left, priceTop, margin.left, priceTop + structurePriceHeight, theme.border, 1);
    drawLine(buffer, width, height, margin.left + candleAreaWidth, priceTop, margin.left + candleAreaWidth, priceTop + structurePriceHeight, theme.border, 1);

    drawLine(buffer, width, height, gutterLeft, priceTop, gutterLeft + gutterWidth, priceTop, theme.border, 1);
    drawLine(buffer, width, height, gutterLeft, priceTop + structurePriceHeight, gutterLeft + gutterWidth, priceTop + structurePriceHeight, theme.border, 1);
    drawLine(buffer, width, height, gutterLeft, priceTop, gutterLeft, priceTop + structurePriceHeight, theme.border, 1);
    drawLine(buffer, width, height, gutterLeft + gutterWidth, priceTop, gutterLeft + gutterWidth, priceTop + structurePriceHeight, theme.border, 1);

    drawText(buffer, width, height, margin.left, margin.top + 4, chartTitle, theme.text, 3);
    drawText(buffer, width, height, margin.left, margin.top + 34, `${data.ticker || "UNKNOWN"} 구조 분석 (매물대 + 지지/저항 zone)`, theme.muted, 2);
    drawText(buffer, width, height, margin.left + plotWidth, margin.top + 10, `기준일 ${metrics.latest.date}`, theme.muted, 2, "right");

    const legendY = margin.top + 56;
    let legendX = margin.left;
    legendX = drawLegendItem(buffer, width, height, legendX, legendY, theme.candleUpFill, "캔들");
    legendX = drawLegendItem(buffer, width, height, legendX, legendY, [231, 76, 60, 120], "저항 zone");
    legendX = drawLegendItem(buffer, width, height, legendX, legendY, [52, 152, 219, 120], "지지 zone");
    legendX = drawLegendItem(buffer, width, height, legendX, legendY, theme.volumeProfileBar, "매물대");
    drawLegendItem(buffer, width, height, legendX, legendY, theme.volumeProfilePoc, "POC");

    drawText(buffer, width, height, margin.left - 54, priceTop + 6, "주가", theme.muted, 2);
    drawText(buffer, width, height, gutterLeft + 6, priceTop + 6, "매물대", theme.muted, 2);

    for (let tick = 0; tick <= 4; tick += 1) {
      const y = priceTop + (structurePriceHeight * tick) / 4;
      drawLine(buffer, width, height, margin.left, y, margin.left + candleAreaWidth, y, theme.grid, 1);
      const value = priceRange.max - ((priceRange.max - priceRange.min) * tick) / 4;
      drawText(buffer, width, height, margin.left + plotWidth + 10, y - 7, formatAxisNumber(value), theme.muted, 2);
    }

    const dateTickIndices = pickTickIndices(barsWindow.length, 6);
    dateTickIndices.forEach((index) => {
      const x = xForSlot(index);
      drawLine(buffer, width, height, x, priceTop, x, priceTop + structurePriceHeight, theme.grid, 1);
      drawText(buffer, width, height, x, priceTop + structurePriceHeight + 14, dateLabel(barsWindow[index].date), theme.muted, 2, "center");
    });
    drawText(buffer, width, height, margin.left + candleAreaWidth / 2, priceTop + structurePriceHeight + 42, "날짜", theme.muted, 2, "center");

    drawCandlesticks(buffer, width, height, barsWindow, xForSlot, priceRange.min, priceRange.max, priceTop, structurePriceHeight, theme);

    const lastBar = barsWindow[barsWindow.length - 1];
    const currentPrice = Number.isFinite(lastBar.close) ? lastBar.close : metrics.latestClose;
    const atr = computeATR14(barsWindow);
    const tolerance = Math.max((atr || 0) * 0.5, currentPrice * 0.005);
    const pivots = detectSwingPivots(barsWindow, 5);

    const highZones = clusterPriceZones(pivots.highs, tolerance);
    const lowZones = clusterPriceZones(pivots.lows, tolerance);
    const allZones = [...highZones, ...lowZones];
    recountZoneTouches(allZones, barsWindow);

    const classified = classifyAndFilterZones(allZones, barsWindow, currentPrice, 3);
    scoreZones(classified, barsWindow, currentPrice);

    const drawableSupport = classified
      .filter((z) => z.type === "support" && z.status !== "broken" && !z.excludedByDistance)
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, 3);
    const drawableResistance = classified
      .filter((z) => z.type === "resistance" && z.status !== "broken" && !z.excludedByDistance)
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, 3);
    const drawnZones = [...drawableSupport, ...drawableResistance];

    for (const zone of drawnZones) {
      const yTop = valueToY(zone.zoneHigh, priceRange.min, priceRange.max, priceTop, structurePriceHeight);
      const yBottom = valueToY(zone.zoneLow, priceRange.min, priceRange.max, priceTop, structurePriceHeight);
      const fillH = Math.max(3, yBottom - yTop);
      const fillColor = zone.status === "flipped"
        ? theme.zoneFlipped
        : zone.type === "support" ? theme.zoneSupport : theme.zoneResistance;
      fillRect(buffer, width, height, margin.left, yTop, candleAreaWidth, fillH, fillColor);
      const labelColor = zone.type === "support" ? theme.structureSupport : theme.structureResistance;
      const labelText = `${formatAxisNumber(Math.round(zone.center))} (x${zone.touchCount})`;
      const labelY = Math.round((yTop + yBottom) / 2) - 7;
      drawText(buffer, width, height, margin.left + candleAreaWidth - 8, labelY, labelText, labelColor, 2, "right");
    }

    const profile = computeVolumeProfile(barsWindow, 50);
    if (profile && profile.maxVolume > 0) {
      profile.bins.forEach((bin, binIndex) => {
        if (bin.volume <= 0) return;
        const yTop = valueToY(bin.priceHigh, priceRange.min, priceRange.max, priceTop, structurePriceHeight);
        const yBottom = valueToY(bin.priceLow, priceRange.min, priceRange.max, priceTop, structurePriceHeight);
        const binHeight = Math.max(2, yBottom - yTop - 1);
        const barLength = Math.max(2, Math.round((bin.volume / profile.maxVolume) * (gutterWidth - 12)));
        const isPoc = binIndex === profile.pocIndex;
        const color = isPoc ? theme.volumeProfilePoc : theme.volumeProfileBar;
        fillRect(buffer, width, height, gutterLeft + 4, yTop, barLength, binHeight, color);
      });

      const pocBin = profile.bins[profile.pocIndex];
      const pocMidPrice = (pocBin.priceLow + pocBin.priceHigh) / 2;
      const pocY = valueToY(pocMidPrice, priceRange.min, priceRange.max, priceTop, structurePriceHeight);
      drawLine(buffer, width, height, margin.left, pocY, margin.left + candleAreaWidth, pocY, theme.volumeProfilePoc, 1);
      drawValueCallout(
        buffer,
        width,
        height,
        margin.left + candleAreaWidth - 8,
        pocY,
        `POC ${formatAxisNumber(pocMidPrice)}`,
        { ...theme, close: theme.volumeProfilePoc },
        priceTop,
        structurePriceHeight,
      );
    }

    drawTextBox(
      buffer,
      width,
      height,
      margin.left + 16,
      priceTop + 16,
      Math.min(620, candleAreaWidth - 32),
      buildStructureInterpretationLines(drawnZones, profile, currentPrice),
      theme,
    );

    writePng(chartPaths.structureOutput, buffer);

    const drawnSet = new Set(drawnZones);
    const csvZones = [...classified].sort((a, b) => {
      const aDrawn = drawnSet.has(a) ? 0 : 1;
      const bDrawn = drawnSet.has(b) ? 0 : 1;
      if (aDrawn !== bDrawn) return aDrawn - bDrawn;
      return (b.score || 0) - (a.score || 0);
    });
    const csvPath = chartPaths.structureOutput.replace(/\.png$/, "-zones.csv");
    writeZonesCSV(csvPath, csvZones);

    const totalSupport = classified.filter((z) => z.type === "support").length;
    const totalResistance = classified.filter((z) => z.type === "resistance").length;
    const brokenDrawn = drawnZones.filter((z) => z.status === "broken").length;
    const allWithinDistance = drawnZones.every((z) => z.distancePct <= MAX_ZONE_DISTANCE_PCT);
    const distancePctStr = `${Math.round(MAX_ZONE_DISTANCE_PCT * 100)}%`;
    console.error("[structure-chart] self-check");
    console.error(`  diagonal SR lines drawn: 0`);
    console.error(`  support zones drawn: ${drawableSupport.length}/${totalSupport}`);
    console.error(`  resistance zones drawn: ${drawableResistance.length}/${totalResistance}`);
    console.error(`  broken zones drawn: ${brokenDrawn}`);
    console.error(`  all zones within ±${distancePctStr} of current price: ${allWithinDistance ? "yes" : "no"}`);
    console.error(`  CSV columns: 8`);

    return { drawnZones, allZones: csvZones, csvPath };
  };

  const buildPatternChart = () => {
    const buffer = createRgbaBuffer(width, height, theme.background);
    const totalSlotsForPattern = barsWindow.length;
    const chartTitle = String(data.name || data.ticker || "UNKNOWN");
    const xForSlot = (slot) => {
      if (totalSlotsForPattern <= 1) {
        return margin.left + plotWidth / 2;
      }
      return margin.left + (plotWidth * slot) / (totalSlotsForPattern - 1);
    };

    const priceTop = margin.top + headerHeight;
    const patternPriceHeight = basePlotHeight;
    const lastBar = barsWindow[barsWindow.length - 1];
    const currentPrice = Number.isFinite(lastBar.close) ? lastBar.close : metrics.latestClose;
    const waveAnalysis = detectWaveCandidates(barsWindow, currentPrice);
    const selected = waveAnalysis.selected;
    const fibLevels = buildFibonacciLevels(selected);
    const interpretationLines = buildPatternInterpretationLines(selected, fibLevels, currentPrice);
    const priceRange = buildPriceRange([
      priceSeries.close,
      fibLevels.map((level) => level.price),
      waveAnalysis.pivots.map((pivot) => pivot.price),
    ]);

    fillRect(buffer, width, height, margin.left, priceTop, plotWidth, patternPriceHeight, theme.panel);
    drawLine(buffer, width, height, margin.left, priceTop, margin.left + plotWidth, priceTop, theme.border, 1);
    drawLine(buffer, width, height, margin.left, priceTop + patternPriceHeight, margin.left + plotWidth, priceTop + patternPriceHeight, theme.border, 1);
    drawLine(buffer, width, height, margin.left, priceTop, margin.left, priceTop + patternPriceHeight, theme.border, 1);
    drawLine(buffer, width, height, margin.left + plotWidth, priceTop, margin.left + plotWidth, priceTop + patternPriceHeight, theme.border, 1);

    drawText(buffer, width, height, margin.left, margin.top + 4, chartTitle, theme.text, 3);
    drawText(buffer, width, height, margin.left, margin.top + 34, `${data.ticker || "UNKNOWN"} 패턴/파동 분석 (Wave + Fibonacci)`, theme.muted, 2);
    drawText(buffer, width, height, margin.left + plotWidth, margin.top + 10, `기준일 ${metrics.latest.date}`, theme.muted, 2, "right");

    const legendY = margin.top + 56;
    let legendX = margin.left;
    legendX = drawLegendItem(buffer, width, height, legendX, legendY, theme.candleUpFill, "캔들");
    legendX = drawLegendItem(buffer, width, height, legendX, legendY, theme.waveLine, "wave candidate");
    legendX = drawLegendItem(buffer, width, height, legendX, legendY, theme.fibRetracement, "Fib retrace");
    drawLegendItem(buffer, width, height, legendX, legendY, theme.fibExtension, "Fib extension");

    drawText(buffer, width, height, margin.left - 54, priceTop + 6, "주가", theme.muted, 2);
    drawPriceAxis(buffer, priceTop, patternPriceHeight, priceRange.min, priceRange.max);
    drawDateTicks(buffer, xForSlot, priceTop + patternPriceHeight, priceTop + patternPriceHeight + 14, totalSlotsForPattern);
    drawText(buffer, width, height, margin.left + plotWidth / 2, priceTop + patternPriceHeight + 42, "날짜", theme.muted, 2, "center");

    drawCandlesticks(buffer, width, height, barsWindow, xForSlot, priceRange.min, priceRange.max, priceTop, patternPriceHeight, theme);

    for (const level of fibLevels) {
      if (level.price < priceRange.min || level.price > priceRange.max) {
        continue;
      }
      const y = valueToY(level.price, priceRange.min, priceRange.max, priceTop, patternPriceHeight);
      const color = level.kind === "extension" ? theme.fibExtension : theme.fibRetracement;
      drawDashedLine(buffer, width, height, margin.left, y, margin.left + plotWidth, y, color, 1, 12, 8);
      drawText(
        buffer,
        width,
        height,
        margin.left + plotWidth - 8,
        y - 8,
        `${level.label} ${formatAxisNumber(level.price)}`,
        color,
        2,
        "right",
      );
    }

    drawTextBox(
      buffer,
      width,
      height,
      margin.left + 16,
      priceTop + 16,
      Math.min(560, plotWidth - 32),
      interpretationLines,
      theme,
    );

    if (selected) {
      const candidatePoints = selected.points.map((point) => ({
        x: xForSlot(point.index),
        y: valueToY(point.price, priceRange.min, priceRange.max, priceTop, patternPriceHeight),
        pivot: point,
      }));
      for (let index = 1; index < candidatePoints.length; index += 1) {
        drawLine(
          buffer,
          width,
          height,
          candidatePoints[index - 1].x,
          candidatePoints[index - 1].y,
          candidatePoints[index].x,
          candidatePoints[index].y,
          theme.waveLine,
          3,
        );
      }
      candidatePoints.forEach((point, index) => {
        fillRect(buffer, width, height, point.x - 5, point.y - 5, 10, 10, theme.wavePoint);
        const label = selected.labels[index] || "";
        if (label) {
          const offsetY = point.pivot.type === "high" ? -26 : 14;
          drawText(buffer, width, height, point.x, point.y + offsetY, label, theme.waveLine, 3, "center");
        }
      });
      drawText(
        buffer,
        width,
        height,
        margin.left + plotWidth,
        margin.top + 34,
        `${selected.kind} ${selected.direction} candidate ${selected.confidence.toFixed(2)}`,
        theme.waveLine,
        2,
        "right",
      );
    } else {
      drawText(
        buffer,
        width,
        height,
        margin.left + plotWidth / 2,
        priceTop + patternPriceHeight / 2 - 10,
        "insufficient wave candidate",
        theme.muted,
        2,
        "center",
      );
    }

    const csvPath = chartPaths.patternOutput.replace(/\.png$/, "-waves.csv");
    writeWaveCSV(csvPath, waveAnalysis);
    writePng(chartPaths.patternOutput, buffer);

    console.error("[pattern-chart] self-check");
    console.error(`  candidate count: ${waveAnalysis.candidates.length}`);
    console.error(`  selected candidate: ${selected ? `${selected.kind}/${selected.direction}/${selected.confidence.toFixed(2)}` : "none"}`);
    console.error(`  CSV columns: 11`);

    return { waveAnalysis, selected, csvPath };
  };

  buildMainTrendChart();
  buildOverlayChart();
  buildMomentumChart();
  const structureResult = buildStructureChart();
  const patternResult = buildPatternChart();

  return {
    imagePaths: {
      main: chartPaths.mainImagePath,
      overlay: chartPaths.overlayImagePath,
      momentum: chartPaths.momentumImagePath,
      structure: chartPaths.structureImagePath,
      pattern: chartPaths.patternImagePath,
    },
    chartBarsUsed: barsWindow.length,
    leadBarsUsed: leadSlots,
    structureZones: structureResult ? structureResult.drawnZones : [],
    structureCsvPath: structureResult ? structureResult.csvPath : null,
    patternCandidates: patternResult ? patternResult.waveAnalysis.candidates : [],
    patternSelected: patternResult ? patternResult.selected : null,
    patternCsvPath: patternResult ? patternResult.csvPath : null,
  };
}

function renderRead(metrics) {
  const formatLevel = (value) => (Number.isFinite(value) ? formatAxisNumber(value) : "n/a");
  const aboveLevels = ([
    metrics.ichimoku.tenkan,
    metrics.ma20Value,
    metrics.ichimoku.kijun,
    metrics.breakoutLevel,
    metrics.ichimoku.currentCloudA,
    metrics.ichimoku.currentCloudB,
  ])
    .filter((value) => Number.isFinite(value) && value > metrics.latestClose)
    .sort((left, right) => left - right);
  const belowLevels = ([
    metrics.breakdownLevel,
    metrics.bollinger.lower,
    metrics.ma120Value,
    metrics.ichimoku.currentCloudA,
    metrics.ichimoku.currentCloudB,
  ])
    .filter((value) => Number.isFinite(value) && value < metrics.latestClose)
    .sort((left, right) => right - left);
  const nearestRecovery = aboveLevels.length > 0 ? aboveLevels[0] : null;
  const nextRecovery = aboveLevels.length > 1 ? aboveLevels[1] : null;
  const nearestSupport = belowLevels.length > 0 ? belowLevels[0] : null;

  const trendLine = (() => {
    if (metrics.movingAverageStructure === "strong-bullish") {
      return `- Trend structure: price is above MA5, MA20, MA60, and MA120, so the trend stack is fully bullish.`;
    }
    if (metrics.movingAverageStructure === "strong-bearish") {
      return `- Trend structure: price is below MA5, MA20, MA60, and MA120, so the trend stack remains firmly bearish.`;
    }
    if (metrics.movingAverageStructure === "rebound-inside-downtrend") {
      return `- Trend structure: price has lifted above MA20 but still sits below MA60, so this is a rebound attempt inside a broader downtrend.`;
    }
    if (metrics.movingAverageStructure === "pullback-inside-uptrend") {
      return `- Trend structure: price is below MA20 but still above MA60, which keeps this closer to a pullback than a full trend break.`;
    }
    if (metrics.movingAverageStructure === "bullish") {
      return `- Trend structure: price is above the medium- and long-term averages, so the broader trend still leans constructive.`;
    }
    if (metrics.movingAverageStructure === "bearish") {
      return `- Trend structure: price is below MA20, MA60, and MA120, so rallies still need confirmation before they count as trend recovery.`;
    }
    return `- Trend structure: moving averages are mixed, so trend confirmation is still limited.`;
  })();

  const volatilityLine = (() => {
    let bandText = "price is around the middle of the Bollinger range";
    if (metrics.bollinger.state === "above-upper-band") {
      bandText = "price is pushing above the upper Bollinger band";
    } else if (metrics.bollinger.state === "below-lower-band") {
      bandText = "price is pressing below the lower Bollinger band";
    } else if (metrics.bollinger.state === "upper-half") {
      bandText = "price is in the upper half of the Bollinger range";
    } else if (metrics.bollinger.state === "lower-half") {
      bandText = "price is in the lower half of the Bollinger range";
    }

    let widthText = "band width is stable";
    if (metrics.bollinger.bandwidthRegime === "expanding") {
      widthText = "band width is expanding, so volatility is widening";
    } else if (metrics.bollinger.bandwidthRegime === "contracting") {
      widthText = "band width is contracting, so volatility is compressing";
    }

    return `- Volatility: ${bandText}, and ${widthText}.`;
  })();

  const cloudLine = (() => {
    const cloudText =
      metrics.ichimoku.cloudPosition === "above-cloud"
        ? "price is above the current cloud"
        : metrics.ichimoku.cloudPosition === "below-cloud"
          ? "price is below the current cloud"
          : metrics.ichimoku.cloudPosition === "inside-cloud"
            ? "price is inside the current cloud"
            : "current cloud positioning is unavailable";
    const tkText =
      metrics.ichimoku.tkCross === "bullish"
        ? "Tenkan is above Kijun"
        : metrics.ichimoku.tkCross === "bearish"
          ? "Tenkan is below Kijun"
          : metrics.ichimoku.tkCross === "flat"
            ? "Tenkan and Kijun are flat"
            : "Tenkan/Kijun positioning is unavailable";
    const futureText =
      metrics.ichimoku.futureCloudBias === "bullish"
        ? "the projected cloud is bullish"
        : metrics.ichimoku.futureCloudBias === "bearish"
          ? "the projected cloud is bearish"
          : metrics.ichimoku.futureCloudBias === "flat"
            ? "the projected cloud is flat"
            : "the projected cloud is unavailable";
    return `- Cloud read: ${cloudText}, ${tkText.toLowerCase()}, and ${futureText}.`;
  })();

  const momentumLine = (() => {
    const rsiText =
      metrics.rsiState === "overbought"
        ? `RSI14 is overbought at ${formatNumber(metrics.rsi14Value)}`
        : metrics.rsiState === "oversold"
          ? `RSI14 is oversold at ${formatNumber(metrics.rsi14Value)}`
          : metrics.rsiState === "neutral"
            ? `RSI14 is neutral at ${formatNumber(metrics.rsi14Value)}`
            : "RSI14 is unavailable";
    const macdCrossText =
      metrics.macd.crossState === "bullish-cross"
        ? "MACD has just crossed bullishly through signal"
        : metrics.macd.crossState === "bearish-cross"
          ? "MACD has just crossed bearishly through signal"
          : metrics.macd.crossState === "bullish"
            ? "MACD remains above signal"
            : metrics.macd.crossState === "bearish"
              ? "MACD remains below signal"
              : "MACD/signal relationship is limited";
    const zeroText =
      metrics.macd.zeroState === "above-zero"
        ? "MACD is above zero"
        : metrics.macd.zeroState === "below-zero"
          ? "MACD is below zero"
          : metrics.macd.zeroState === "at-zero"
            ? "MACD is sitting on zero"
            : "";
    const histogramText =
      metrics.macd.histogramState === "expanding"
        ? "histogram momentum is expanding"
        : metrics.macd.histogramState === "contracting"
          ? "histogram momentum is contracting"
          : metrics.macd.histogramState === "stable"
            ? "histogram momentum is stable"
            : "histogram trend is unavailable";
    const adxText =
      metrics.adx.strengthState === "strong-trend"
        ? `ADX shows a strong trend, with ${
            metrics.adx.directionState === "bullish"
              ? "+DI in front"
              : metrics.adx.directionState === "bearish"
                ? "-DI in front"
                : "directional lines overlapping"
          }`
        : metrics.adx.strengthState === "building-trend"
          ? `ADX shows a trend that is building, with ${
              metrics.adx.directionState === "bullish"
                ? "+DI slightly ahead"
                : metrics.adx.directionState === "bearish"
                  ? "-DI slightly ahead"
                  : "directional lines still close"
            }`
          : metrics.adx.strengthState === "weak-trend"
            ? "ADX still reads as a weak-trend environment"
            : "ADX trend-strength read is unavailable";
    const adxSlopeText =
      metrics.adx.slopeState === "rising"
        ? "trend strength is rising"
        : metrics.adx.slopeState === "falling"
          ? "trend strength is fading"
          : metrics.adx.slopeState === "flat"
            ? "trend strength is flat"
            : "trend-strength slope is unavailable";
    const volumeText =
      metrics.volumeRegime === "heavy"
        ? "volume is running heavy versus the 20-day average"
        : metrics.volumeRegime === "light"
          ? "volume is light versus the 20-day average"
          : metrics.volumeRegime === "normal"
            ? "volume is close to the 20-day average"
            : "volume comparison is unavailable";
    const macdSummary = zeroText ? `${macdCrossText}, and ${zeroText}` : macdCrossText;
    return `- Momentum and participation: ${rsiText}; ${macdSummary}; ${histogramText}; ${adxText}, and ${adxSlopeText}; ${volumeText}.`;
  })();

  const practicalLine = (() => {
    const recoveryText = Number.isFinite(nearestRecovery)
      ? `first recovery check is ${formatLevel(nearestRecovery)}`
      : "near-term recovery level is unavailable";
    const nextRecoveryText = Number.isFinite(nextRecovery)
      ? `then ${formatLevel(nextRecovery)}`
      : null;
    const supportText = Number.isFinite(nearestSupport)
      ? `nearest support watch is ${formatLevel(nearestSupport)}`
      : "support watch is unavailable";
    const breakoutText = Number.isFinite(metrics.breakoutLevel)
      ? `20-day breakout level sits at ${formatLevel(metrics.breakoutLevel)}`
      : "20-day breakout level is unavailable";
    const breakdownText = Number.isFinite(metrics.breakdownLevel)
      ? `20-day breakdown level sits at ${formatLevel(metrics.breakdownLevel)}`
      : "20-day breakdown level is unavailable";

    let flowText = "chart-only flow is range-bound or base-building";
    if (metrics.chartFlow === "bullish continuation") {
      flowText = "chart-only flow still reads as bullish continuation";
    } else if (metrics.chartFlow === "bearish continuation") {
      flowText = "chart-only flow still reads as bearish continuation";
    } else if (metrics.chartFlow === "technical rebound inside broader downtrend") {
      flowText = "chart-only flow looks like a technical rebound inside a broader downtrend";
    } else if (metrics.chartFlow === "pullback inside broader uptrend") {
      flowText = "chart-only flow looks like a pullback inside a broader uptrend";
    }

    return `- Practical checklist: ${supportText}; ${recoveryText}${nextRecoveryText ? `, ${nextRecoveryText}` : ""}; ${breakoutText}; ${breakdownText}; ${flowText}.`;
  })();

  console.log(trendLine);
  console.log(volatilityLine);
  console.log(cloudLine);
  console.log(momentumLine);
  console.log(practicalLine);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.input) {
    console.log(usage());
    process.exit(args.help ? 0 : 1);
  }

  if (!Number.isInteger(args.chartBars) || args.chartBars < 30) {
    throw new Error("--chart-bars must be an integer of at least 30.");
  }
  if (!Number.isInteger(args.width) || args.width < 800) {
    throw new Error("--width must be an integer of at least 800.");
  }
  if (!Number.isInteger(args.height) || args.height < 700) {
    throw new Error("--height must be an integer of at least 700.");
  }

  const data = readJson(args.input);
  requireNamedChartInput(data, args);
  const bars = normalizeTechnicalBars(data.bars || []);
  requireValidTechnicalBars(bars);
  const metrics = buildTechnicalMetrics(bars);
  const pngInfo = args.pngOut ? buildChartPngs(data, bars, metrics, args) : null;

  console.log(`# Advanced Chart Analysis: ${data.ticker || "Unknown"}`);
  console.log("");
  if (data.name) {
    console.log(`- Name: ${data.name}`);
  }
  console.log(`- Latest date: ${metrics.latest.date}`);
  console.log(`- Latest close: ${formatNumber(metrics.latestClose)}`);
  console.log(`- Moving-average structure: ${metrics.movingAverageStructure}`);
  console.log(`- Bollinger read: ${metrics.bollinger.state}`);
  console.log(`- Ichimoku read: ${metrics.ichimoku.cloudPosition}`);
  console.log(`- RSI state: ${metrics.rsiState}`);
  console.log(`- MACD state: ${metrics.macd.crossState} / ${metrics.macd.zeroState}`);
  console.log(`- ADX state: ${metrics.adx.strengthState} / ${metrics.adx.directionState} / ${metrics.adx.slopeState}`);
  console.log(`- Volume regime: ${metrics.volumeRegime}`);
  console.log(`- Chart-only flow: ${metrics.chartFlow}`);
  console.log("");

  if (pngInfo) {
    console.log("## Chart Images");
    console.log("");
    console.log(`![${data.name || data.ticker || "Chart"} main trend chart](${pngInfo.imagePaths.main})`);
    console.log("");
    console.log(`![${data.name || data.ticker || "Chart"} overlay chart](${pngInfo.imagePaths.overlay})`);
    console.log("");
    console.log(`![${data.name || data.ticker || "Chart"} momentum chart](${pngInfo.imagePaths.momentum})`);
    console.log("");
    console.log(`![${data.name || data.ticker || "Chart"} structure chart](${pngInfo.imagePaths.structure})`);
    console.log("");
    console.log(`![${data.name || data.ticker || "Chart"} pattern wave chart](${pngInfo.imagePaths.pattern})`);
    console.log("");
    console.log(
      `The main chart uses OHLC candlesticks with upper and lower wicks, plus MA5, MA20, MA60, MA120, and volume. The overlay chart separates Bollinger Bands, Ichimoku cloud lines, and RSI14, and reserves ${pngInfo.leadBarsUsed} forward slots for the projected cloud. The momentum chart focuses on MACD, signal, histogram, and ADX/DMI so crossovers, momentum acceleration, and trend strength are easier to see. The structure chart pairs candles with a horizontal volume-by-price gutter (POC highlighted) and ATR-tolerance clustered support/resistance zones drawn as horizontal price bands (up to 3 each, within ±30% of current price). The pattern chart adds recent swing-pivot wave candidates and Fibonacci retracement/extension levels; labels are drawn only for candidates with confidence >= 0.55, while all candidates are exported to a sibling \`-waves.csv\`. The full zone roster — including broken or distance-filtered zones — is exported to a sibling \`-zones.csv\`.`,
    );
    console.log("");

    if (Array.isArray(pngInfo.structureZones) && pngInfo.structureZones.length > 0) {
      console.log("## Support / Resistance Zones (Structure Chart)");
      console.log("");
      console.log("| Type | Zone | Center | Touches | Last Touch | Score | Status |");
      console.log("| --- | --- | --- | --- | --- | --- | --- |");
      const sorted = [...pngInfo.structureZones].sort((a, b) => (b.score || 0) - (a.score || 0));
      for (const z of sorted) {
        const zoneText = `${formatAxisNumber(Math.round(z.zoneLow))} ~ ${formatAxisNumber(Math.round(z.zoneHigh))}`;
        const center = formatAxisNumber(Math.round(z.center));
        const score = Number.isFinite(z.score) ? z.score.toFixed(3) : "n/a";
        const lastTouch = z.lastTouchDate || "n/a";
        console.log(`| ${z.type} | ${zoneText} | ${center} | ${z.touchCount} | ${lastTouch} | ${score} | ${z.status} |`);
      }
      console.log("");
      if (pngInfo.structureCsvPath) {
        console.log(`Full zone roster (including broken / distance-filtered): \`${path.basename(pngInfo.structureCsvPath)}\``);
        console.log("");
      }
    }

    console.log("## Pattern / Wave Candidates");
    console.log("");
    if (pngInfo.patternSelected) {
      const candidate = pngInfo.patternSelected;
      console.log(`Selected drawable candidate: ${candidate.kind} / ${candidate.direction} / confidence ${candidate.confidence.toFixed(3)}.`);
    } else {
      console.log("Selected drawable candidate: insufficient wave candidate.");
    }
    if (Array.isArray(pngInfo.patternCandidates) && pngInfo.patternCandidates.length > 0) {
      console.log("");
      console.log("| Kind | Direction | Status | Confidence | Points |");
      console.log("| --- | --- | --- | --- | --- |");
      for (const candidate of pngInfo.patternCandidates.slice(0, 5)) {
        const points = candidate.points
          .map((point, index) => `${candidate.labels[index] || "start"}:${point.date || point.index}@${formatAxisNumber(point.price)}`)
          .join(" → ");
        console.log(`| ${candidate.kind} | ${candidate.direction} | ${candidate.status} | ${candidate.confidence.toFixed(3)} | ${points} |`);
      }
    }
    if (pngInfo.patternCsvPath) {
      console.log("");
      console.log(`Full wave roster: \`${path.basename(pngInfo.patternCsvPath)}\``);
    }
    console.log("");
  }

  console.log("## Indicators");
  console.log("");
  console.log("| Metric | Value |");
  console.log("| --- | --- |");
  console.log(`| MA 5 | ${formatNumber(metrics.ma5Value)} |`);
  console.log(`| MA 20 | ${formatNumber(metrics.ma20Value)} |`);
  console.log(`| MA 60 | ${formatNumber(metrics.ma60Value)} |`);
  console.log(`| MA 120 | ${formatNumber(metrics.ma120Value)} |`);
  console.log(`| Bollinger Upper | ${formatNumber(metrics.bollinger.upper)} |`);
  console.log(`| Bollinger Middle | ${formatNumber(metrics.bollinger.middle)} |`);
  console.log(`| Bollinger Lower | ${formatNumber(metrics.bollinger.lower)} |`);
  console.log(`| Bollinger Width | ${formatPercentRatio(metrics.bollinger.bandwidth, 2)} |`);
  console.log(`| Tenkan | ${formatNumber(metrics.ichimoku.tenkan)} |`);
  console.log(`| Kijun | ${formatNumber(metrics.ichimoku.kijun)} |`);
  console.log(`| Current Cloud A | ${formatNumber(metrics.ichimoku.currentCloudA)} |`);
  console.log(`| Current Cloud B | ${formatNumber(metrics.ichimoku.currentCloudB)} |`);
  console.log(`| Future Cloud A | ${formatNumber(metrics.ichimoku.futureCloudA)} |`);
  console.log(`| Future Cloud B | ${formatNumber(metrics.ichimoku.futureCloudB)} |`);
  console.log(`| RSI 14 | ${formatNumber(metrics.rsi14Value)} |`);
  console.log(`| MACD | ${formatNumber(metrics.macd.macdValue)} |`);
  console.log(`| Signal | ${formatNumber(metrics.macd.signalValue)} |`);
  console.log(`| Histogram | ${formatNumber(metrics.macd.histogramValue)} |`);
  console.log(`| MACD State | ${metrics.macd.crossState} / ${metrics.macd.zeroState} |`);
  console.log(`| Histogram State | ${metrics.macd.histogramState} |`);
  console.log(`| ADX 14 | ${formatNumber(metrics.adx.adxValue)} |`);
  console.log(`| +DI | ${formatNumber(metrics.adx.plusDiValue)} |`);
  console.log(`| -DI | ${formatNumber(metrics.adx.minusDiValue)} |`);
  console.log(`| ADX State | ${metrics.adx.strengthState} / ${metrics.adx.directionState} / ${metrics.adx.slopeState} |`);
  console.log(`| Avg Volume 20 | ${formatInteger(metrics.avgVolume20)} |`);
  console.log(`| Volume vs Avg 20 | ${formatPercentRatio(metrics.volumeRatio, 1)} |`);
  console.log(`| 20D Breakout Level | ${formatNumber(metrics.breakoutLevel)} |`);
  console.log(`| 20D Breakdown Level | ${formatNumber(metrics.breakdownLevel)} |`);
  console.log("");

  console.log("## Read");
  console.log("");
  renderRead(metrics);
}

try {
  main();
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exit(1);
}
