const TRADING_DAYS_52W = 252;

function toOptionalNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeBars(rawBars) {
  return [...rawBars]
    .map((bar) => ({
      date: String(bar.date),
      open: toOptionalNumber(bar.open),
      high: toOptionalNumber(bar.high),
      low: toOptionalNumber(bar.low),
      close: toOptionalNumber(bar.close),
      volume: toOptionalNumber(bar.volume),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function requireValidBars(bars) {
  if (!Array.isArray(bars) || bars.length < 5) {
    throw new Error("Input JSON must include at least 5 price bars.");
  }

  for (const bar of bars) {
    if (!bar.date) {
      throw new Error("Every bar must include a date.");
    }
    if (!Number.isFinite(bar.close)) {
      throw new Error("Every bar must include a numeric close field.");
    }
  }
}

function average(values) {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values) {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid];
  }
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function standardDeviation(values) {
  if (values.length === 0) {
    return null;
  }
  const mean = average(values);
  const variance = average(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance);
}

function windowValues(values, endIndex, period) {
  if (endIndex + 1 < period) {
    return null;
  }
  const slice = values.slice(endIndex + 1 - period, endIndex + 1);
  return slice.every((value) => Number.isFinite(value)) ? slice : null;
}

function rollingAverageSeries(values, period) {
  return values.map((_, index) => {
    const window = windowValues(values, index, period);
    return window ? average(window) : null;
  });
}

function emaSeries(values, period) {
  const result = Array(values.length).fill(null);
  const multiplier = 2 / (period + 1);
  const seed = [];
  let ema = null;

  values.forEach((value, index) => {
    if (!Number.isFinite(value)) {
      result[index] = null;
      return;
    }

    if (!Number.isFinite(ema)) {
      seed.push(value);
      if (seed.length < period) {
        result[index] = null;
        return;
      }
      if (seed.length === period) {
        ema = average(seed);
        result[index] = ema;
        return;
      }
    }

    ema = value * multiplier + ema * (1 - multiplier);
    result[index] = ema;
  });

  return result;
}

function rsiSeries(values, period = 14) {
  return values.map((_, index) => {
    if (index < period) {
      return null;
    }
    let gains = 0;
    let losses = 0;
    for (let cursor = index + 1 - period; cursor <= index; cursor += 1) {
      const change = values[cursor] - values[cursor - 1];
      if (!Number.isFinite(change)) {
        return null;
      }
      if (change >= 0) {
        gains += change;
      } else {
        losses += Math.abs(change);
      }
    }
    const avgGain = gains / period;
    const avgLoss = losses / period;
    if (avgLoss === 0) {
      return 100;
    }
    const rs = avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
  });
}

function bollingerSeries(values, period = 20, multiplier = 2) {
  const middle = rollingAverageSeries(values, period);
  const upper = values.map((_, index) => {
    const window = windowValues(values, index, period);
    if (!window) {
      return null;
    }
    const mean = middle[index];
    const deviation = standardDeviation(window);
    return mean + multiplier * deviation;
  });
  const lower = values.map((_, index) => {
    const window = windowValues(values, index, period);
    if (!window) {
      return null;
    }
    const mean = middle[index];
    const deviation = standardDeviation(window);
    return mean - multiplier * deviation;
  });
  const bandwidth = upper.map((value, index) => {
    if (!Number.isFinite(value) || !Number.isFinite(lower[index]) || !Number.isFinite(middle[index]) || middle[index] === 0) {
      return null;
    }
    return (value - lower[index]) / middle[index];
  });
  return { middle, upper, lower, bandwidth };
}

function macdSeries(values, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  const fast = emaSeries(values, fastPeriod);
  const slow = emaSeries(values, slowPeriod);
  const macd = values.map((_, index) => {
    if (!Number.isFinite(fast[index]) || !Number.isFinite(slow[index])) {
      return null;
    }
    return fast[index] - slow[index];
  });
  const signal = emaSeries(macd, signalPeriod);
  const histogram = macd.map((value, index) => {
    if (!Number.isFinite(value) || !Number.isFinite(signal[index])) {
      return null;
    }
    return value - signal[index];
  });
  return { fast, slow, macd, signal, histogram };
}

function adxSeries(highs, lows, closes, period = 14) {
  const length = closes.length;
  const tr = Array(length).fill(null);
  const plusDm = Array(length).fill(null);
  const minusDm = Array(length).fill(null);

  for (let index = 1; index < length; index += 1) {
    if (![highs[index], lows[index], closes[index - 1], highs[index - 1], lows[index - 1]].every(Number.isFinite)) {
      continue;
    }

    const highDiff = highs[index] - highs[index - 1];
    const lowDiff = lows[index - 1] - lows[index];
    plusDm[index] = highDiff > lowDiff && highDiff > 0 ? highDiff : 0;
    minusDm[index] = lowDiff > highDiff && lowDiff > 0 ? lowDiff : 0;
    tr[index] = Math.max(
      highs[index] - lows[index],
      Math.abs(highs[index] - closes[index - 1]),
      Math.abs(lows[index] - closes[index - 1]),
    );
  }

  const smoothTr = Array(length).fill(null);
  const smoothPlusDm = Array(length).fill(null);
  const smoothMinusDm = Array(length).fill(null);
  const plusDi = Array(length).fill(null);
  const minusDi = Array(length).fill(null);
  const dx = Array(length).fill(null);
  const adx = Array(length).fill(null);

  if (length <= period * 2) {
    return { plusDi, minusDi, adx, dx };
  }

  let initialTr = 0;
  let initialPlusDm = 0;
  let initialMinusDm = 0;
  for (let index = 1; index <= period; index += 1) {
    if (![tr[index], plusDm[index], minusDm[index]].every(Number.isFinite)) {
      return { plusDi, minusDi, adx, dx };
    }
    initialTr += tr[index];
    initialPlusDm += plusDm[index];
    initialMinusDm += minusDm[index];
  }

  smoothTr[period] = initialTr;
  smoothPlusDm[period] = initialPlusDm;
  smoothMinusDm[period] = initialMinusDm;

  for (let index = period; index < length; index += 1) {
    if (index > period) {
      if (![tr[index], plusDm[index], minusDm[index]].every(Number.isFinite)) {
        continue;
      }
      smoothTr[index] = smoothTr[index - 1] - smoothTr[index - 1] / period + tr[index];
      smoothPlusDm[index] = smoothPlusDm[index - 1] - smoothPlusDm[index - 1] / period + plusDm[index];
      smoothMinusDm[index] = smoothMinusDm[index - 1] - smoothMinusDm[index - 1] / period + minusDm[index];
    }

    if (![smoothTr[index], smoothPlusDm[index], smoothMinusDm[index]].every(Number.isFinite) || smoothTr[index] === 0) {
      continue;
    }

    plusDi[index] = (smoothPlusDm[index] / smoothTr[index]) * 100;
    minusDi[index] = (smoothMinusDm[index] / smoothTr[index]) * 100;
    const denominator = plusDi[index] + minusDi[index];
    dx[index] = denominator === 0 ? 0 : (Math.abs(plusDi[index] - minusDi[index]) / denominator) * 100;
  }

  let adxSeed = 0;
  for (let index = period; index < period * 2; index += 1) {
    if (!Number.isFinite(dx[index])) {
      return { plusDi, minusDi, adx, dx };
    }
    adxSeed += dx[index];
  }
  adx[period * 2 - 1] = adxSeed / period;

  for (let index = period * 2; index < length; index += 1) {
    if (!Number.isFinite(dx[index]) || !Number.isFinite(adx[index - 1])) {
      continue;
    }
    adx[index] = ((adx[index - 1] * (period - 1)) + dx[index]) / period;
  }

  return { plusDi, minusDi, adx, dx };
}

function midpoint(highs, lows, index, period) {
  const highWindow = windowValues(highs, index, period);
  const lowWindow = windowValues(lows, index, period);
  if (!highWindow || !lowWindow) {
    return null;
  }
  return (Math.max(...highWindow) + Math.min(...lowWindow)) / 2;
}

function ichimokuSeries(highs, lows, closes) {
  const tenkan = closes.map((_, index) => midpoint(highs, lows, index, 9));
  const kijun = closes.map((_, index) => midpoint(highs, lows, index, 26));
  const senkouA = closes.map((_, index) => {
    if (!Number.isFinite(tenkan[index]) || !Number.isFinite(kijun[index])) {
      return null;
    }
    return (tenkan[index] + kijun[index]) / 2;
  });
  const senkouB = closes.map((_, index) => midpoint(highs, lows, index, 52));
  const chikou = closes.map((value) => value);
  return {
    tenkan,
    kijun,
    senkouA,
    senkouB,
    chikou,
    shift: 26,
  };
}

function lastFinite(values) {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (Number.isFinite(values[index])) {
      return values[index];
    }
  }
  return null;
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

function compute52WeekStats(closes, lookback = TRADING_DAYS_52W) {
  if (closes.length < lookback) {
    return {
      close52WeekHigh: null,
      close52WeekLow: null,
      priceVs52WeekHighRatio: null,
      priceVs52WeekLowRatio: null,
      daysSince52WeekHigh: null,
      last52WeekHighIndex: null,
      recent52WeekHighCount60: null,
      has52WeekHistory: false,
    };
  }

  const recentCloses = closes.slice(-lookback);
  const close52WeekHigh = Math.max(...recentCloses);
  const close52WeekLow = Math.min(...recentCloses);
  const latestClose = closes[closes.length - 1];
  let last52WeekHighIndex = null;

  for (let index = closes.length - 1; index >= closes.length - lookback; index -= 1) {
    if (closes[index] === close52WeekHigh) {
      last52WeekHighIndex = index;
      break;
    }
  }

  let recent52WeekHighCount60 = 0;
  const startIndex = Math.max(lookback - 1, closes.length - 60);
  for (let index = startIndex; index < closes.length; index += 1) {
    const priorWindow = closes.slice(Math.max(0, index - lookback + 1), index);
    if (priorWindow.length === 0 || priorWindow.some((value) => !Number.isFinite(value))) {
      continue;
    }
    const priorMax = Math.max(...priorWindow);
    if (Number.isFinite(closes[index]) && closes[index] > priorMax) {
      recent52WeekHighCount60 += 1;
    }
  }

  return {
    close52WeekHigh,
    close52WeekLow,
    priceVs52WeekHighRatio: Number.isFinite(close52WeekHigh) && close52WeekHigh !== 0 ? latestClose / close52WeekHigh : null,
    priceVs52WeekLowRatio: Number.isFinite(close52WeekLow) && close52WeekLow !== 0 ? latestClose / close52WeekLow : null,
    daysSince52WeekHigh: Number.isInteger(last52WeekHighIndex) ? (closes.length - 1) - last52WeekHighIndex : null,
    last52WeekHighIndex,
    recent52WeekHighCount60,
    has52WeekHistory: true,
  };
}

function buildMetrics(bars) {
  const closes = bars.map((bar) => bar.close);
  const highs = bars.map((bar) => bar.high);
  const lows = bars.map((bar) => bar.low);
  const volumes = bars.map((bar) => bar.volume);
  const latest = bars[bars.length - 1];
  const latestClose = latest.close;

  const ma5Series = rollingAverageSeries(closes, 5);
  const ma20Series = rollingAverageSeries(closes, 20);
  const ma50Series = rollingAverageSeries(closes, 50);
  const ma60Series = rollingAverageSeries(closes, 60);
  const ma120Series = rollingAverageSeries(closes, 120);
  const ma150Series = rollingAverageSeries(closes, 150);
  const ma200Series = rollingAverageSeries(closes, 200);
  const rsi14Series = rsiSeries(closes, 14);
  const macd = macdSeries(closes, 12, 26, 9);
  const adx = adxSeries(highs, lows, closes, 14);
  const volume20Series = rollingAverageSeries(volumes, 20);
  const volume60Series = rollingAverageSeries(volumes, 60);
  const bollinger = bollingerSeries(closes, 20, 2);
  const ichimoku = ichimokuSeries(highs, lows, closes);

  const latestIndex = bars.length - 1;
  const volumeRatio =
    Number.isFinite(volume20Series[latestIndex]) && Number.isFinite(latest.volume) && volume20Series[latestIndex] !== 0
      ? latest.volume / volume20Series[latestIndex]
      : null;

  const highWindow = windowValues(highs.slice(0, -1), highs.length - 2, 20);
  const lowWindow = windowValues(lows.slice(0, -1), lows.length - 2, 20);
  const breakoutLevel = highWindow ? Math.max(...highWindow) : null;
  const breakdownLevel = lowWindow ? Math.min(...lowWindow) : null;
  const bandwidthMedian60 = median(bollinger.bandwidth.filter(Number.isFinite).slice(-60));
  const close52WeekStats = compute52WeekStats(closes);

  const maValues = {
    ma5: ma5Series[latestIndex],
    ma20: ma20Series[latestIndex],
    ma60: ma60Series[latestIndex],
    ma120: ma120Series[latestIndex],
  };

  const metrics = {
    latest,
    latestClose,
    closes,
    ma5Series,
    ma20Series,
    ma50Series,
    ma60Series,
    ma120Series,
    ma150Series,
    ma200Series,
    ma5Value: ma5Series[latestIndex],
    ma20Value: ma20Series[latestIndex],
    ma50Value: ma50Series[latestIndex],
    ma60Value: ma60Series[latestIndex],
    ma120Value: ma120Series[latestIndex],
    ma150Value: ma150Series[latestIndex],
    ma200Value: ma200Series[latestIndex],
    movingAverageStructure: classifyMovingAverageStructure(latestClose, maValues),
    rsi14Series,
    rsi14Value: rsi14Series[latestIndex],
    rsiState: classifyRsi(rsi14Series[latestIndex]),
    macdSeriesData: macd,
    adxSeriesData: adx,
    avgVolume20: volume20Series[latestIndex],
    volume20Series,
    volume60Series,
    volumeRatio,
    volumeRegime: classifyVolume(volumeRatio),
    breakoutLevel,
    breakdownLevel,
    bollinger: classifyBollinger(latestClose, bollinger, bandwidthMedian60),
    bollingerSeriesData: bollinger,
    ichimoku: classifyIchimoku(latestClose, ichimoku, bars.length),
    ichimokuSeriesData: ichimoku,
    hasVolumeHistory: Number.isFinite(volume20Series[latestIndex]),
    hasBreakoutHistory: Number.isFinite(breakoutLevel) && Number.isFinite(breakdownLevel),
    close52WeekHigh: close52WeekStats.close52WeekHigh,
    close52WeekLow: close52WeekStats.close52WeekLow,
    priceVs52WeekHighRatio: close52WeekStats.priceVs52WeekHighRatio,
    priceVs52WeekLowRatio: close52WeekStats.priceVs52WeekLowRatio,
    daysSince52WeekHigh: close52WeekStats.daysSince52WeekHigh,
    last52WeekHighIndex: close52WeekStats.last52WeekHighIndex,
    recent52WeekHighCount60: close52WeekStats.recent52WeekHighCount60,
    has52WeekHistory: close52WeekStats.has52WeekHistory,
  };

  metrics.macd = classifyMacd(macd, latestIndex);
  metrics.adx = classifyAdx(adx, latestIndex);
  metrics.chartFlow = classifyChartFlow(metrics);
  return metrics;
}

module.exports = {
  TRADING_DAYS_52W,
  toOptionalNumber,
  normalizeBars,
  requireValidBars,
  average,
  median,
  standardDeviation,
  windowValues,
  rollingAverageSeries,
  emaSeries,
  rsiSeries,
  bollingerSeries,
  macdSeries,
  adxSeries,
  ichimokuSeries,
  lastFinite,
  compute52WeekStats,
  buildMetrics,
};
