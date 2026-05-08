// 기술지표 레이더의 보조지표 계산과 해석을 모으는 모듈
import type { Candle } from "@/lib/marketAnalysis";

export type TechnicalTone = "bullish" | "bearish" | "neutral" | "warning";

export interface IndicatorReading {
  label: string;
  value: string;
  tone: TechnicalTone;
  score: number;
  description: string;
}

export interface CandlestickPattern {
  name: string;
  tone: TechnicalTone;
  confidence: number;
  description: string;
  detectedAt: number | null;
}

export interface FibonacciLevel {
  label: string;
  ratio: number;
  price: number;
}

export interface TechnicalRadarReport {
  price: number;
  trendLabel: string;
  momentumLabel: string;
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  fearGreed: {
    score: number;
    label: string;
    description: string;
  };
  supportResistance: {
    support: number | null;
    resistance: number | null;
    supportDistancePercent: number | null;
    resistanceDistancePercent: number | null;
  };
  candlestickPatterns: CandlestickPattern[];
  trendIndicators: IndicatorReading[];
  momentumIndicators: IndicatorReading[];
  volatilityIndicators: IndicatorReading[];
  volumeIndicators: IndicatorReading[];
  fibonacci: {
    low: number | null;
    high: number | null;
    positionPercent: number | null;
    levels: FibonacciLevel[];
  };
  summary: string;
}

const emptyReport: TechnicalRadarReport = {
  price: 0,
  trendLabel: "데이터 부족",
  momentumLabel: "확인 대기",
  bullishCount: 0,
  bearishCount: 0,
  neutralCount: 0,
  fearGreed: {
    score: 50,
    label: "중립",
    description: "캔들 데이터가 부족해 시장 심리 참고값을 계산하지 못했습니다."
  },
  supportResistance: {
    support: null,
    resistance: null,
    supportDistancePercent: null,
    resistanceDistancePercent: null
  },
  candlestickPatterns: [],
  trendIndicators: [],
  momentumIndicators: [],
  volatilityIndicators: [],
  volumeIndicators: [],
  fibonacci: {
    low: null,
    high: null,
    positionPercent: null,
    levels: []
  },
  summary: "캔들 데이터가 충분히 쌓이면 기술지표 레이더가 표시됩니다."
};

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function last<T>(values: T[]) {
  return values.length ? values[values.length - 1] : null;
}

function average(values: number[]) {
  const valid = values.filter((value) => Number.isFinite(value));
  if (!valid.length) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function formatNumber(value: number | null, digits = 2) {
  if (value === null || !Number.isFinite(value)) return "미확인";
  return value.toLocaleString("ko-KR", { maximumFractionDigits: digits });
}

function formatPercent(value: number | null, digits = 2) {
  if (value === null || !Number.isFinite(value)) return "미확인";
  return `${value.toFixed(digits)}%`;
}

function closes(candles: Candle[]) {
  return candles.map((candle) => candle.close);
}

function typicalPrices(candles: Candle[]) {
  return candles.map((candle) => (candle.high + candle.low + candle.close) / 3);
}

function sma(values: number[], length: number) {
  if (values.length < length) return null;
  return average(values.slice(-length));
}

function emaSeries(values: number[], length: number) {
  if (!values.length) return [];
  const multiplier = 2 / (length + 1);
  const result: number[] = [];
  let previous = values[0];
  result.push(previous);

  for (let i = 1; i < values.length; i += 1) {
    previous = values[i] * multiplier + previous * (1 - multiplier);
    result.push(previous);
  }

  return result;
}

function rsi(values: number[], length = 14) {
  if (values.length <= length) return null;
  let gains = 0;
  let losses = 0;
  const start = values.length - length;

  for (let i = start; i < values.length; i += 1) {
    const change = values[i] - values[i - 1];
    if (change >= 0) gains += change;
    else losses += Math.abs(change);
  }

  const averageGain = gains / length;
  const averageLoss = losses / length;
  if (averageLoss === 0) return 100;
  const rs = averageGain / averageLoss;
  return 100 - 100 / (1 + rs);
}

function macd(values: number[]) {
  if (values.length < 35) return { line: null, signal: null, histogram: null };
  const ema12 = emaSeries(values, 12);
  const ema26 = emaSeries(values, 26);
  const lineSeries = values.map((_, index) => ema12[index] - ema26[index]);
  const signalSeries = emaSeries(lineSeries.slice(25), 9);
  const line = last(lineSeries);
  const signal = last(signalSeries);
  return {
    line,
    signal,
    histogram: line !== null && signal !== null ? line - signal : null
  };
}

function stochastic(candles: Candle[], length = 14, smooth = 3) {
  if (candles.length < length + smooth) return { k: null, d: null };
  const kValues: number[] = [];

  for (let i = candles.length - smooth; i < candles.length; i += 1) {
    const window = candles.slice(i - length + 1, i + 1);
    const highest = Math.max(...window.map((candle) => candle.high));
    const lowest = Math.min(...window.map((candle) => candle.low));
    const range = highest - lowest;
    kValues.push(range === 0 ? 50 : ((candles[i].close - lowest) / range) * 100);
  }

  return { k: last(kValues), d: average(kValues) };
}

function cci(candles: Candle[], length = 20) {
  if (candles.length < length) return null;
  const typical = typicalPrices(candles).slice(-length);
  const mean = average(typical);
  if (mean === null) return null;
  const deviation = average(typical.map((value) => Math.abs(value - mean)));
  if (!deviation) return 0;
  return ((last(typical) ?? mean) - mean) / (0.015 * deviation);
}

function mfi(candles: Candle[], length = 14) {
  if (candles.length <= length) return null;
  const slice = candles.slice(-(length + 1));
  let positive = 0;
  let negative = 0;

  for (let i = 1; i < slice.length; i += 1) {
    const currentTypical = (slice[i].high + slice[i].low + slice[i].close) / 3;
    const previousTypical = (slice[i - 1].high + slice[i - 1].low + slice[i - 1].close) / 3;
    const flow = currentTypical * slice[i].volume;
    if (currentTypical >= previousTypical) positive += flow;
    else negative += flow;
  }

  if (negative === 0) return 100;
  const ratio = positive / negative;
  return 100 - 100 / (1 + ratio);
}

function trueRange(candle: Candle, previousClose?: number) {
  if (previousClose === undefined) return candle.high - candle.low;
  return Math.max(candle.high - candle.low, Math.abs(candle.high - previousClose), Math.abs(candle.low - previousClose));
}

function atr(candles: Candle[], length = 14) {
  if (candles.length <= length) return null;
  const ranges = candles.slice(-length).map((candle, index, slice) => {
    const originalIndex = candles.length - length + index;
    return trueRange(candle, originalIndex > 0 ? candles[originalIndex - 1].close : slice[index - 1]?.close);
  });
  return average(ranges);
}

function bollinger(values: number[], length = 20, multiplier = 2) {
  if (values.length < length) return { upper: null, middle: null, lower: null, positionPercent: null };
  const slice = values.slice(-length);
  const middle = average(slice);
  if (middle === null) return { upper: null, middle: null, lower: null, positionPercent: null };
  const variance = average(slice.map((value) => (value - middle) ** 2)) ?? 0;
  const deviation = Math.sqrt(variance);
  const upper = middle + deviation * multiplier;
  const lower = middle - deviation * multiplier;
  const price = last(values) ?? middle;
  const positionPercent = upper === lower ? 50 : ((price - lower) / (upper - lower)) * 100;
  return { upper, middle, lower, positionPercent };
}

function obv(candles: Candle[]) {
  if (candles.length < 2) return null;
  let total = 0;
  for (let i = 1; i < candles.length; i += 1) {
    if (candles[i].close > candles[i - 1].close) total += candles[i].volume;
    else if (candles[i].close < candles[i - 1].close) total -= candles[i].volume;
  }
  return total;
}

function vwap(candles: Candle[], length = 80) {
  const slice = candles.slice(-length);
  const volumeSum = slice.reduce((sum, candle) => sum + candle.volume, 0);
  if (!volumeSum) return null;
  return slice.reduce((sum, candle) => sum + ((candle.high + candle.low + candle.close) / 3) * candle.volume, 0) / volumeSum;
}

function cmf(candles: Candle[], length = 20) {
  if (candles.length < length) return null;
  const slice = candles.slice(-length);
  const volumeSum = slice.reduce((sum, candle) => sum + candle.volume, 0);
  if (!volumeSum) return null;
  const flow = slice.reduce((sum, candle) => {
    const range = candle.high - candle.low;
    const multiplier = range === 0 ? 0 : ((candle.close - candle.low) - (candle.high - candle.close)) / range;
    return sum + multiplier * candle.volume;
  }, 0);
  return flow / volumeSum;
}

function adx(candles: Candle[], length = 14) {
  if (candles.length <= length + 1) return null;
  const slice = candles.slice(-(length + 1));
  let trSum = 0;
  let plusDmSum = 0;
  let minusDmSum = 0;

  for (let i = 1; i < slice.length; i += 1) {
    const upMove = slice[i].high - slice[i - 1].high;
    const downMove = slice[i - 1].low - slice[i].low;
    plusDmSum += upMove > downMove && upMove > 0 ? upMove : 0;
    minusDmSum += downMove > upMove && downMove > 0 ? downMove : 0;
    trSum += trueRange(slice[i], slice[i - 1].close);
  }

  if (!trSum) return null;
  const plusDi = (plusDmSum / trSum) * 100;
  const minusDi = (minusDmSum / trSum) * 100;
  const dx = plusDi + minusDi === 0 ? 0 : (Math.abs(plusDi - minusDi) / (plusDi + minusDi)) * 100;
  return { adx: dx, plusDi, minusDi };
}

function detectPatterns(candles: Candle[]) {
  if (candles.length < 3) return [];
  const latest = candles[candles.length - 1];
  const previous = candles[candles.length - 2];
  const third = candles[candles.length - 3];
  const patterns: CandlestickPattern[] = [];
  const body = Math.abs(latest.close - latest.open);
  const range = latest.high - latest.low || 1;
  const upperWick = latest.high - Math.max(latest.open, latest.close);
  const lowerWick = Math.min(latest.open, latest.close) - latest.low;
  const latestBull = latest.close > latest.open;
  const previousBear = previous.close < previous.open;
  const previousBull = previous.close > previous.open;

  if (body / range <= 0.1) {
    patterns.push({
      name: "Doji",
      tone: "neutral",
      confidence: 58,
      description: "몸통이 작아 매수와 매도 힘이 충돌하고 있습니다.",
      detectedAt: latest.time
    });
  }

  if (latestBull && previousBear && latest.close > previous.open && latest.open <= previous.close) {
    patterns.push({
      name: "Bullish Engulfing",
      tone: "bullish",
      confidence: 72,
      description: "직전 음봉을 양봉이 감싸며 단기 매수 반응이 커졌습니다.",
      detectedAt: latest.time
    });
  }

  if (!latestBull && previousBull && latest.close < previous.open && latest.open >= previous.close) {
    patterns.push({
      name: "Bearish Engulfing",
      tone: "bearish",
      confidence: 72,
      description: "직전 양봉을 음봉이 감싸며 단기 매도 압력이 커졌습니다.",
      detectedAt: latest.time
    });
  }

  if (lowerWick > body * 2 && upperWick < body * 1.2 && latestBull) {
    patterns.push({
      name: "Hammer",
      tone: "bullish",
      confidence: 64,
      description: "아래꼬리가 길어 저가 매수 반응이 확인됩니다.",
      detectedAt: latest.time
    });
  }

  if (upperWick > body * 2 && lowerWick < body * 1.2 && !latestBull) {
    patterns.push({
      name: "Shooting Star",
      tone: "bearish",
      confidence: 64,
      description: "윗꼬리가 길어 고가 매도 반응이 확인됩니다.",
      detectedAt: latest.time
    });
  }

  if (third.close < third.open && body / range > 0.35 && latest.close > (third.open + third.close) / 2 && latestBull) {
    patterns.push({
      name: "Morning Star",
      tone: "bullish",
      confidence: 68,
      description: "하락 뒤 반등 캔들이 나오며 단기 전환 가능성이 생겼습니다.",
      detectedAt: latest.time
    });
  }

  if (third.close > third.open && body / range > 0.35 && latest.close < (third.open + third.close) / 2 && !latestBull) {
    patterns.push({
      name: "Evening Star",
      tone: "bearish",
      confidence: 68,
      description: "상승 뒤 매도 캔들이 나오며 단기 조정 가능성이 생겼습니다.",
      detectedAt: latest.time
    });
  }

  return patterns.sort((a, b) => b.confidence - a.confidence).slice(0, 3);
}

function nearestSupportResistance(candles: Candle[], price: number) {
  const slice = candles.slice(-120);
  const pivotLows: number[] = [];
  const pivotHighs: number[] = [];

  for (let i = 2; i < slice.length - 2; i += 1) {
    const current = slice[i];
    if (current.low <= slice[i - 1].low && current.low <= slice[i - 2].low && current.low <= slice[i + 1].low && current.low <= slice[i + 2].low) {
      pivotLows.push(current.low);
    }
    if (current.high >= slice[i - 1].high && current.high >= slice[i - 2].high && current.high >= slice[i + 1].high && current.high >= slice[i + 2].high) {
      pivotHighs.push(current.high);
    }
  }

  const support = pivotLows.filter((value) => value < price).sort((a, b) => b - a)[0] ?? Math.min(...slice.map((candle) => candle.low));
  const resistance = pivotHighs.filter((value) => value > price).sort((a, b) => a - b)[0] ?? Math.max(...slice.map((candle) => candle.high));

  return {
    support,
    resistance,
    supportDistancePercent: support ? ((price - support) / price) * 100 : null,
    resistanceDistancePercent: resistance ? ((resistance - price) / price) * 100 : null
  };
}

function fibonacci(candles: Candle[], price: number) {
  const slice = candles.slice(-120);
  if (slice.length < 20) {
    return { low: null, high: null, positionPercent: null, levels: [] };
  }

  const high = Math.max(...slice.map((candle) => candle.high));
  const low = Math.min(...slice.map((candle) => candle.low));
  const range = high - low;
  if (!range) return { low, high, positionPercent: 50, levels: [] };

  const ratios = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
  return {
    low,
    high,
    positionPercent: clamp(((price - low) / range) * 100),
    levels: ratios.map((ratio) => ({
      label: `${(ratio * 100).toFixed(ratio === 0 || ratio === 1 ? 0 : 1)}%`,
      ratio,
      price: high - range * ratio
    }))
  };
}

function toneFromScore(score: number): TechnicalTone {
  if (score >= 62) return "bullish";
  if (score <= 38) return "bearish";
  if (score >= 54 || score <= 46) return "warning";
  return "neutral";
}

function reading(label: string, value: string, score: number, description: string): IndicatorReading {
  return {
    label,
    value,
    score: clamp(score),
    tone: toneFromScore(score),
    description
  };
}

function fearGreedLabel(score: number) {
  if (score >= 80) return "극단적 탐욕";
  if (score >= 65) return "탐욕";
  if (score >= 55) return "약한 탐욕";
  if (score > 45) return "중립";
  if (score > 35) return "약한 공포";
  if (score > 20) return "공포";
  return "극단적 공포";
}

export function analyzeTechnicalRadar(candles: Candle[]): TechnicalRadarReport {
  if (candles.length < 60) return emptyReport;

  const price = candles[candles.length - 1].close;
  const closeValues = closes(candles);
  const sma5 = sma(closeValues, 5);
  const sma20 = sma(closeValues, 20);
  const sma60 = sma(closeValues, 60);
  const sma120 = sma(closeValues, 120);
  const ema10 = last(emaSeries(closeValues, 10));
  const ema30 = last(emaSeries(closeValues, 30));
  const ema50 = last(emaSeries(closeValues, 50));
  const ema200 = closeValues.length >= 200 ? last(emaSeries(closeValues, 200)) : null;
  const macdValue = macd(closeValues);
  const adxValue = adx(candles);
  const rsi14 = rsi(closeValues);
  const stochasticValue = stochastic(candles);
  const cci20 = cci(candles);
  const mfi14 = mfi(candles);
  const atr14 = atr(candles);
  const atrPercent = atr14 ? (atr14 / price) * 100 : null;
  const bands = bollinger(closeValues);
  const obvValue = obv(candles);
  const volumeMa20 = sma(candles.map((candle) => candle.volume), 20);
  const currentVolume = candles[candles.length - 1].volume;
  const volumeRatio = volumeMa20 ? currentVolume / volumeMa20 : null;
  const vwapValue = vwap(candles);
  const cmf20 = cmf(candles);
  const patterns = detectPatterns(candles);
  const supportResistance = nearestSupportResistance(candles, price);
  const fib = fibonacci(candles, price);

  const trendIndicators = [
    reading(
      "이동평균",
      `MA5 ${formatNumber(sma5)} / MA20 ${formatNumber(sma20)} / MA60 ${formatNumber(sma60)}`,
      sma5 && sma20 && sma60 ? (price > sma5 && sma5 > sma20 && sma20 > sma60 ? 82 : price < sma5 && sma5 < sma20 && sma20 < sma60 ? 18 : 50) : 50,
      sma5 && sma20 && sma60 && price > sma20 ? "단기 가격이 주요 이동평균 위에 있어 상승 흐름이 우세합니다." : "이동평균 정렬이 약하거나 가격이 평균선 아래에 있습니다."
    ),
    reading(
      "지수이동평균",
      `EMA10 ${formatNumber(ema10)} / EMA30 ${formatNumber(ema30)} / EMA200 ${formatNumber(ema200)}`,
      ema10 && ema30 ? (ema10 > ema30 && price > ema10 ? 78 : ema10 < ema30 && price < ema10 ? 22 : 50) : 50,
      ema10 && ema30 && ema10 > ema30 ? "단기 EMA가 장기 EMA 위에 있어 추세 유지력이 있습니다." : "EMA 기준 추세 탄력이 약합니다."
    ),
    reading(
      "MACD",
      `Line ${formatNumber(macdValue.line)} / Signal ${formatNumber(macdValue.signal)} / Hist ${formatNumber(macdValue.histogram)}`,
      macdValue.histogram !== null ? (macdValue.histogram > 0 ? 72 : 28) : 50,
      macdValue.histogram !== null && macdValue.histogram > 0 ? "MACD 히스토그램이 양수라 상승 모멘텀이 남아 있습니다." : "MACD 히스토그램이 약해져 하락 또는 둔화 압력이 있습니다."
    ),
    reading(
      "ADX",
      `ADX ${formatNumber(adxValue?.adx ?? null)} / +DI ${formatNumber(adxValue?.plusDi ?? null)} / -DI ${formatNumber(adxValue?.minusDi ?? null)}`,
      adxValue ? (adxValue.plusDi > adxValue.minusDi ? 65 + Math.min(15, adxValue.adx / 3) : 35 - Math.min(15, adxValue.adx / 3)) : 50,
      adxValue && adxValue.adx >= 25 ? "추세 강도가 살아 있어 방향성이 이어질 수 있습니다." : "ADX 기준 방향성은 아직 강하지 않습니다."
    )
  ];

  const momentumIndicators = [
    reading(
      "RSI 14",
      formatNumber(rsi14, 1),
      rsi14 === null ? 50 : rsi14 >= 70 ? 58 : rsi14 <= 30 ? 42 : rsi14,
      rsi14 !== null && rsi14 >= 70 ? "과열권에 가까워 추세는 강하지만 조정 가능성도 같이 봐야 합니다." : rsi14 !== null && rsi14 <= 30 ? "과매도권에 가까워 반등 가능성과 추가 하락을 함께 봐야 합니다." : "RSI는 중립 구간에서 방향성을 확인 중입니다."
    ),
    reading(
      "스토캐스틱",
      `%K ${formatNumber(stochasticValue.k, 1)} / %D ${formatNumber(stochasticValue.d, 1)}`,
      stochasticValue.k === null || stochasticValue.d === null ? 50 : stochasticValue.k > stochasticValue.d ? 64 : 36,
      stochasticValue.k !== null && stochasticValue.k >= 80 ? "단기 과열권입니다. 추격보다는 눌림 여부가 중요합니다." : stochasticValue.k !== null && stochasticValue.k <= 20 ? "단기 과매도권입니다. 반등 시도 여부가 중요합니다." : "스토캐스틱은 중립권에서 단기 방향을 확인 중입니다."
    ),
    reading(
      "CCI 20",
      formatNumber(cci20, 1),
      cci20 === null ? 50 : cci20 > 100 ? 72 : cci20 < -100 ? 28 : 50 + cci20 / 8,
      cci20 !== null && cci20 > 100 ? "CCI가 강한 상승 모멘텀을 가리킵니다." : cci20 !== null && cci20 < -100 ? "CCI가 강한 하락 모멘텀을 가리킵니다." : "CCI는 중립권에서 힘을 모으는 중입니다."
    ),
    reading(
      "MFI 14",
      formatNumber(mfi14, 1),
      mfi14 === null ? 50 : mfi14,
      mfi14 !== null && mfi14 >= 80 ? "자금 흐름이 과열권입니다." : mfi14 !== null && mfi14 <= 20 ? "자금 흐름이 과매도권입니다." : "자금 흐름은 중립권에서 움직이고 있습니다."
    )
  ];

  const volatilityIndicators = [
    reading(
      "ATR 14",
      `${formatNumber(atr14)} / ${formatPercent(atrPercent)}`,
      atrPercent === null ? 50 : atrPercent >= 3 ? 70 : atrPercent <= 0.7 ? 35 : 52,
      atrPercent !== null && atrPercent >= 3 ? "변동성이 커져 손절폭과 포지션 크기를 더 보수적으로 봐야 합니다." : "변동성은 비교적 일반적인 범위입니다."
    ),
    reading(
      "볼린저밴드",
      `상단 ${formatNumber(bands.upper)} / 중단 ${formatNumber(bands.middle)} / 하단 ${formatNumber(bands.lower)}`,
      bands.positionPercent === null ? 50 : bands.positionPercent >= 80 ? 62 : bands.positionPercent <= 20 ? 38 : 50,
      bands.positionPercent !== null && bands.positionPercent >= 80 ? "현재가가 상단 밴드 쪽에 가까워 과열 여부를 봐야 합니다." : bands.positionPercent !== null && bands.positionPercent <= 20 ? "현재가가 하단 밴드 쪽에 가까워 매도 과열 여부를 봐야 합니다." : "현재가는 볼린저밴드 중간권에 있습니다."
    )
  ];

  const volumeIndicators = [
    reading(
      "온밸런스 볼륨",
      formatNumber(obvValue, 0),
      obvValue === null ? 50 : obvValue > 0 ? 66 : 34,
      obvValue !== null && obvValue > 0 ? "OBV가 누적 매수 우위를 가리킵니다." : "OBV가 누적 매도 우위 또는 둔화를 가리킵니다."
    ),
    reading(
      "볼륨 이동평균",
      `현재 ${formatNumber(currentVolume, 0)} / VMA20 ${formatNumber(volumeMa20, 0)} / ${formatNumber(volumeRatio, 2)}x`,
      volumeRatio === null ? 50 : volumeRatio >= 1.5 ? 68 : volumeRatio <= 0.7 ? 42 : 50,
      volumeRatio !== null && volumeRatio >= 1.5 ? "평균보다 거래량이 늘어 움직임의 신뢰도가 높아졌습니다." : "거래량은 평균 수준이거나 다소 약합니다."
    ),
    reading(
      "VWAP",
      formatNumber(vwapValue),
      vwapValue === null ? 50 : price >= vwapValue ? 66 : 34,
      vwapValue !== null && price >= vwapValue ? "현재가가 VWAP 위에 있어 매수 평균 단가보다 강합니다." : "현재가가 VWAP 아래에 있어 매도 압력이 남아 있습니다."
    ),
    reading(
      "CMF 20",
      formatNumber(cmf20, 3),
      cmf20 === null ? 50 : cmf20 > 0.05 ? 66 : cmf20 < -0.05 ? 34 : 50,
      cmf20 !== null && cmf20 > 0.05 ? "차이킨 자금 흐름이 양수라 매수 유입이 우세합니다." : cmf20 !== null && cmf20 < -0.05 ? "차이킨 자금 흐름이 음수라 매도 유출이 우세합니다." : "자금 흐름은 균형권입니다."
    )
  ];

  const allReadings = [...trendIndicators, ...momentumIndicators, ...volatilityIndicators, ...volumeIndicators];
  const bullishCount = allReadings.filter((item) => item.tone === "bullish").length;
  const bearishCount = allReadings.filter((item) => item.tone === "bearish").length;
  const neutralCount = allReadings.length - bullishCount - bearishCount;
  const averageScore = average(allReadings.map((item) => item.score)) ?? 50;
  const greedScore = clamp(
    averageScore +
      (volumeRatio !== null ? clamp((volumeRatio - 1) * 8, -8, 8) : 0) +
      (bands.positionPercent !== null ? clamp((bands.positionPercent - 50) / 8, -8, 8) : 0)
  );
  const fearGreed = {
    score: Math.round(greedScore),
    label: fearGreedLabel(greedScore),
    description:
      greedScore >= 65
        ? "매수 심리가 강한 편입니다. 다만 과열권에서는 추격보다 조정 후 반응 확인이 중요합니다."
        : greedScore <= 35
          ? "위험 회피 심리가 강한 편입니다. 반등보다 지지 이탈 여부를 먼저 확인해야 합니다."
          : "심리는 중립권입니다. 방향성보다 지지와 저항 반응 확인이 우선입니다."
  };

  const trendLabel = averageScore >= 70 ? "강한 상승" : averageScore >= 58 ? "상승 우위" : averageScore <= 30 ? "강한 하락" : averageScore <= 42 ? "하락 우위" : "횡보";
  const momentumLabel =
    bullishCount > bearishCount + 2
      ? "상승 지속 가능성"
      : bearishCount > bullishCount + 2
        ? "하락 지속 가능성"
        : "방향 확인 필요";

  return {
    price,
    trendLabel,
    momentumLabel,
    bullishCount,
    bearishCount,
    neutralCount,
    fearGreed,
    supportResistance,
    candlestickPatterns: patterns,
    trendIndicators,
    momentumIndicators,
    volatilityIndicators,
    volumeIndicators,
    fibonacci: fib,
    summary: `기술지표 기준으로는 ${trendLabel}에 가깝고, 모멘텀은 ${momentumLabel}입니다. ICT 기준과 다르게 이 화면은 보조지표의 힘과 과열 여부를 빠르게 확인하는 용도입니다.`
  };
}
