import {
  analyzeTimeframe,
  chartTimeframes,
  summarizeMarket,
  tradingModeConfigs,
  type Candle,
  type ChartTimeframe,
  type MarketAnalysis,
  type TimeframeAnalysis,
  type TradingMode,
  type TradePlanCandidate
} from "../src/lib/marketAnalysis";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

type Side = "long" | "short";
type Regime = "bull" | "bear" | "range";
type Outcome = "target1" | "target2" | "invalidation" | "timeout" | "ambiguous" | "noEntry" | "invalidatedBeforeEntry";

interface Candidate {
  symbol: string;
  mode: TradingMode;
  status: "entry" | "watch";
  watchKind?: "aligned" | "counter";
  regime: Regime;
  timeframe: ChartTimeframe;
  side: Side;
  quality: TradePlanCandidate["quality"];
  score: number;
  confidence: number;
  readiness: MarketAnalysis["readiness"];
  currentPrice: number;
  entryLow: number;
  entryHigh: number;
  invalidation: number;
  target1: number;
  target2: number;
  rr1: number;
  rr2: number;
  timestamp: number;
  index: number;
  proximity: "inside" | "near" | "wait" | "missed";
  distancePercent: number;
  riskFlags: string[];
  ctx: {
    msb: string;
    choch: string;
    premiumDiscount: string;
    pocPosition: string;
    inOb: boolean;
    inFvg: boolean;
    oteZone: string;
  };
}

interface EvaluatedCandidate extends Candidate {
  outcome: Outcome;
  barsToOutcome: number;
  barsToEntry: number | null;
  maxFavorablePercent: number;
  maxAdversePercent: number;
}

interface ProximityInfo {
  proximity: Candidate["proximity"];
  distancePercent: number;
}

const symbol = process.env.BACKTEST_SYMBOL ?? "BTCUSDT.P";
const tradingModes: TradingMode[] = ["scalp", "swing"];
const days = Number(process.env.BACKTEST_DAYS ?? "180");
const researchRelaxation = Number(process.env.BACKTEST_RELAX ?? "0");
const targetR1Override = Number(process.env.BACKTEST_TARGET_R1 ?? "NaN");
const targetR2Override = Number(process.env.BACKTEST_TARGET_R2 ?? "NaN");
const fetchDelayMs = Number(process.env.BACKTEST_FETCH_DELAY_MS ?? "280");
const cacheRoot = process.env.BACKTEST_CACHE_DIR ?? ".backtest-cache";
const reportDir = process.env.BACKTEST_REPORT_DIR ?? "reports";
const intervalMs: Record<ChartTimeframe, number> = {
  "5m": 5 * 60 * 1000,
  "15m": 15 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "4h": 4 * 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000
};
const intervalMap: Record<ChartTimeframe, string> = {
  "5m": "5m",
  "15m": "15m",
  "1h": "1h",
  "4h": "4h",
  "1d": "1d"
};
const lookbackByTimeframe: Record<ChartTimeframe, number> = {
  "5m": 260,
  "15m": 220,
  "1h": 180,
  "4h": 140,
  "1d": 90
};
const forwardBarsByTimeframe: Record<ChartTimeframe, number> = {
  "5m": 48,
  "15m": 48,
  "1h": 36,
  "4h": 24,
  "1d": 14
};
const stepByTimeframe: Record<ChartTimeframe, number> = {
  "5m": 24,
  "15m": 8,
  "1h": 3,
  "4h": 1,
  "1d": 1
};
const proximityHardLimit: Record<ChartTimeframe, number> = {
  "5m": 0.8,
  "15m": 1.5,
  "1h": 3.0,
  "4h": 6.0,
  "1d": 12.0
};
const proximityNearLimit: Record<ChartTimeframe, number> = {
  "5m": 0.12,
  "15m": 0.15,
  "1h": 1.0,
  "4h": 2.0,
  "1d": 4.0
};
const minimumScoutScore: Record<TradingMode, number> = {
  scalp: tradingModeConfigs.scalp.minimumScoutScore,
  swing: tradingModeConfigs.swing.minimumScoutScore
};
const minimumWatchScore: Record<TradingMode, number> = {
  scalp: 35,
  swing: 55
};

function normalizedExchangeSymbol() {
  return symbol.replace(".P", "");
}

function candleTimeMs(candle: Candle) {
  return candle.time * 1000;
}

function cachePath(timeframe: ChartTimeframe) {
  return join(cacheRoot, normalizedExchangeSymbol(), `${timeframe}.json`);
}

async function readCachedCandles(timeframe: ChartTimeframe): Promise<Candle[]> {
  try {
    const raw = await readFile(cachePath(timeframe), "utf8");
    const parsed = JSON.parse(raw) as Candle[];
    return dedupeCandles(parsed.filter(isValidCandle));
  } catch {
    return [];
  }
}

async function writeCachedCandles(timeframe: ChartTimeframe, candles: Candle[]) {
  const file = cachePath(timeframe);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(dedupeCandles(candles)), "utf8");
}

function isValidCandle(value: Candle) {
  return (
    typeof value?.time === "number" &&
    typeof value.open === "number" &&
    typeof value.high === "number" &&
    typeof value.low === "number" &&
    typeof value.close === "number" &&
    typeof value.volume === "number"
  );
}

function dedupeCandles(candles: Candle[]) {
  return Array.from(new Map(candles.map((candle) => [candle.time, candle])).values()).sort((a, b) => a.time - b.time);
}

async function fetchCandlesRange(timeframe: ChartTimeframe, startMs: number, endMs: number): Promise<Candle[]> {
  const normalizedSymbol = symbol.replace(".P", "");
  const output: Candle[] = [];
  let cursor = startMs;

  while (cursor < endMs) {
    const params = new URLSearchParams({
      symbol: normalizedSymbol,
      interval: intervalMap[timeframe],
      limit: "1500",
      startTime: String(cursor),
      endTime: String(endMs)
    });
    let response: Response | null = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      response = await fetch(`https://fapi.binance.com/fapi/v1/klines?${params.toString()}`);
      if (response.status !== 429 && response.status < 500) break;
      const retryAfter = Number(response.headers.get("retry-after") ?? "0");
      const waitMs = Math.max(retryAfter * 1000, 1500 * (attempt + 1));
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    if (!response) throw new Error(`Binance ${timeframe} no response`);
    if (!response.ok) throw new Error(`Binance ${timeframe} HTTP ${response.status}`);
    const rows = (await response.json()) as unknown[][];
    if (!rows.length) break;

    for (const row of rows) {
      output.push({
        time: Math.floor(Number(row[0]) / 1000),
        open: Number(row[1]),
        high: Number(row[2]),
        low: Number(row[3]),
        close: Number(row[4]),
        volume: Number(row[5])
      });
    }

    const lastOpen = Number(rows[rows.length - 1][0]);
    const next = lastOpen + intervalMs[timeframe];
    if (next <= cursor) break;
    cursor = next;
    await new Promise((resolve) => setTimeout(resolve, fetchDelayMs));
  }

  return dedupeCandles(output);
}

async function fetchHistoricalCandles(timeframe: ChartTimeframe, startMs: number, endMs: number): Promise<Candle[]> {
  const cached = await readCachedCandles(timeframe);
  const paddedStartMs = startMs - intervalMs[timeframe] * 3;

  if (!cached.length) {
    console.log(`[backtest] cache miss ${timeframe} full ${new Date(paddedStartMs).toISOString()} -> ${new Date(endMs).toISOString()}`);
    const fresh = await fetchCandlesRange(timeframe, paddedStartMs, endMs);
    await writeCachedCandles(timeframe, fresh);
    return fresh.filter((candle) => candleTimeMs(candle) >= startMs && candleTimeMs(candle) <= endMs);
  }

  const cachedStart = candleTimeMs(cached[0]);
  const cachedEnd = candleTimeMs(cached[cached.length - 1]);
  const fetched: Candle[] = [];

  if (cachedStart > paddedStartMs) {
    const missingEnd = Math.min(endMs, cachedStart - intervalMs[timeframe]);
    if (missingEnd > paddedStartMs) {
      console.log(`[backtest] cache miss ${timeframe} left ${new Date(paddedStartMs).toISOString()} -> ${new Date(missingEnd).toISOString()}`);
      fetched.push(...(await fetchCandlesRange(timeframe, paddedStartMs, missingEnd)));
    }
  }

  if (cachedEnd < endMs - intervalMs[timeframe] * 2) {
    const missingStart = Math.max(paddedStartMs, cachedEnd + intervalMs[timeframe]);
    if (endMs > missingStart) {
      console.log(`[backtest] cache miss ${timeframe} right ${new Date(missingStart).toISOString()} -> ${new Date(endMs).toISOString()}`);
      fetched.push(...(await fetchCandlesRange(timeframe, missingStart, endMs)));
    }
  }

  const merged = dedupeCandles([...cached, ...fetched]);
  if (fetched.length > 0) await writeCachedCandles(timeframe, merged);
  return merged.filter((candle) => candleTimeMs(candle) >= startMs && candleTimeMs(candle) <= endMs);
}

function ema(values: number[], len: number) {
  if (values.length < len) return null;
  const k = 2 / (len + 1);
  let current = values.slice(0, len).reduce((sum, value) => sum + value, 0) / len;
  for (let i = len; i < values.length; i += 1) current = values[i] * k + current * (1 - k);
  return current;
}

function regimeAt(timestamp: number, fourHour: Candle[]): Regime {
  const history = fourHour.filter((candle) => candle.time <= timestamp);
  if (history.length < 220) return "range";
  const closes = history.map((candle) => candle.close);
  const last = closes[closes.length - 1];
  const past = closes[closes.length - 81];
  const return80 = ((last - past) / past) * 100;
  const ema200 = ema(closes.slice(-240), 200);
  const recent = history.slice(-40);
  const high = Math.max(...recent.map((candle) => candle.high));
  const low = Math.min(...recent.map((candle) => candle.low));
  const rangePct = ((high - low) / last) * 100;

  if (ema200 && last > ema200 && return80 > 7) return "bull";
  if (ema200 && last < ema200 && return80 < -7) return "bear";
  if (Math.abs(return80) < 6 || rangePct < 11) return "range";
  return return80 > 0 ? "bull" : "bear";
}

function analyzeProximity(plan: TradePlanCandidate, currentPrice: number, timeframe: ChartTimeframe): ProximityInfo {
  const insideZone = currentPrice >= plan.entryLow && currentPrice <= plan.entryHigh;
  if (insideZone) return { distancePercent: 0, proximity: "inside" };
  if (plan.side === "long") {
    if (currentPrice < plan.entryLow) {
      return { distancePercent: -((plan.entryLow - currentPrice) / currentPrice) * 100, proximity: "missed" };
    }
    const distancePercent = ((currentPrice - plan.entryHigh) / currentPrice) * 100;
    return { distancePercent, proximity: distancePercent <= proximityNearLimit[timeframe] ? "near" : "wait" };
  }
  if (currentPrice > plan.entryHigh) {
    return { distancePercent: -((currentPrice - plan.entryHigh) / currentPrice) * 100, proximity: "missed" };
  }
  const distancePercent = ((plan.entryLow - currentPrice) / currentPrice) * 100;
  return { distancePercent, proximity: distancePercent <= proximityNearLimit[timeframe] ? "near" : "wait" };
}

function planDirection(plan: TradePlanCandidate) {
  return plan.side === "long" ? "bullish" : "bearish";
}

function planEntryForRisk(plan: TradePlanCandidate) {
  return plan.side === "long" ? plan.entryHigh : plan.entryLow;
}

function targetPriceFromR(plan: TradePlanCandidate, targetR: number) {
  const entry = planEntryForRisk(plan);
  const risk = Math.abs(entry - plan.invalidation);
  return plan.side === "long" ? entry + risk * targetR : entry - risk * targetR;
}

function targetR1For(plan: TradePlanCandidate) {
  return Number.isFinite(targetR1Override) && targetR1Override > 0 ? targetR1Override : plan.rr1;
}

function targetR2For(plan: TradePlanCandidate) {
  return Number.isFinite(targetR2Override) && targetR2Override > 0 ? targetR2Override : plan.rr2;
}

function hasRiskFlag(market: MarketAnalysis, pattern: string) {
  return market.riskFlags.some((flag) => flag.includes(pattern));
}

function hasHardReactionZone(active: TimeframeAnalysis | undefined, plan: TradePlanCandidate) {
  const direction = planDirection(plan);
  return Boolean(
    active &&
      ((active.inOb && active.latestOb?.direction === direction) ||
        (active.inFvg && active.latestFvg?.direction === direction))
  );
}

function hasUsablePlanZone(active: TimeframeAnalysis | undefined, plan: TradePlanCandidate) {
  const direction = planDirection(plan);
  return Boolean(
    active &&
      (hasHardReactionZone(active, plan) ||
        active.oteZone === plan.side ||
        active.latestOb?.direction === direction ||
        active.latestFvg?.direction === direction)
  );
}

interface WatchZoneCandidate {
  bottom: number;
  top: number;
  label: string;
}

function zoneDistanceToPrice(zone: WatchZoneCandidate, price: number) {
  if (price >= zone.bottom && price <= zone.top) return 0;
  return Math.min(Math.abs(price - zone.bottom), Math.abs(price - zone.top));
}

function pickWatchZone(active: TimeframeAnalysis, side: TradePlanCandidate["side"], price: number): WatchZoneCandidate | null {
  const direction = side === "long" ? "bullish" : "bearish";
  const zones: WatchZoneCandidate[] = [];

  if (active.latestOb?.direction === direction) {
    zones.push({
      bottom: active.latestOb.bottom,
      top: active.latestOb.top,
      label: `${active.timeframe} ${side === "long" ? "상승" : "하락"} OB 관찰 구간`
    });
  }
  if (active.latestFvg?.direction === direction) {
    zones.push({
      bottom: active.latestFvg.bottom,
      top: active.latestFvg.top,
      label: `${active.timeframe} ${active.latestFvg.state === "ifvg" ? "iFVG" : "FVG"} 관찰 구간`
    });
  }
  if (active.latestBb?.direction === direction) {
    zones.push({
      bottom: active.latestBb.bottom,
      top: active.latestBb.top,
      label: `${active.timeframe} ${side === "long" ? "상승" : "하락"} BB 관찰 구간`
    });
  }
  if (active.oteLevels) {
    zones.push(
      side === "long"
        ? { bottom: active.oteLevels.longLow, top: active.oteLevels.longHigh, label: `${active.timeframe} OTE 롱 관찰 구간` }
        : { bottom: active.oteLevels.shortLow, top: active.oteLevels.shortHigh, label: `${active.timeframe} OTE 숏 관찰 구간` }
    );
  }

  const validZones = zones
    .map((zone) => ({ ...zone, bottom: Math.min(zone.bottom, zone.top), top: Math.max(zone.bottom, zone.top) }))
    .filter((zone) => Number.isFinite(zone.bottom) && Number.isFinite(zone.top) && zone.bottom > 0 && zone.top > 0);

  if (validZones.length === 0) return null;
  return validZones.sort((a, b) => zoneDistanceToPrice(a, price) - zoneDistanceToPrice(b, price))[0];
}

function inferWatchSide(market: MarketAnalysis, active: TimeframeAnalysis): TradePlanCandidate["side"] | null {
  if (active.msb === "bullish" && active.choch === "bullish") return "long";
  if (active.msb === "bearish" && active.choch === "bearish") return "short";
  if (market.bias === "long" || market.bias === "short") return market.bias;
  if (active.msb === "bullish") return "long";
  if (active.msb === "bearish") return "short";
  if (active.choch === "bullish") return "long";
  if (active.choch === "bearish") return "short";
  return null;
}

function buildWatchOnlyPlan(
  market: MarketAnalysis,
  analyses: TimeframeAnalysis[],
  price: number,
  mode: TradingMode
): TradePlanCandidate | null {
  const active = analyses.find((a) => a.timeframe === market.activeTimeframe);
  if (!active || price <= 0) return null;

  const side = inferWatchSide(market, active);
  if (!side) return null;

  const fallbackSide = side === "long" ? "short" : "long";
  const candidateSides: TradePlanCandidate["side"][] = [side, fallbackSide];
  const picked = candidateSides
    .map((candidateSide) => ({ side: candidateSide, zone: pickWatchZone(active, candidateSide, price) }))
    .find((candidate): candidate is { side: TradePlanCandidate["side"]; zone: WatchZoneCandidate } => candidate.zone !== null);
  if (!picked) return null;

  const pickedSide = picked.side;
  const zone = picked.zone;
  const entryLow = Math.min(zone.bottom, zone.top);
  const entryHigh = Math.max(zone.bottom, zone.top);
  const entry = pickedSide === "long" ? entryHigh : entryLow;
  const pad = active.timeframe === "5m" ? 0.0025 : 0.004;
  const invalidation = pickedSide === "long" ? entryLow * (1 - pad) : entryHigh * (1 + pad);
  const risk = Math.abs(entry - invalidation);
  if (!Number.isFinite(risk) || risk <= 0) return null;

  const config = tradingModeConfigs[mode];
  const direction = pickedSide === "long" ? "bullish" : "bearish";
  const alignedHigher = analyses
    .filter((item) => config.contextTimeframes.includes(item.timeframe))
    .filter((item) => item.msb === direction).length;
  const confirmationCount = [
    active.msb === direction,
    active.choch === direction,
    active.latestSweep?.direction === direction && active.latestSweep.age <= 12,
    active.latestCisd?.direction === direction && active.latestCisd.age <= 12,
    active.inOb && active.latestOb?.direction === direction,
    active.inFvg && active.latestFvg?.direction === direction,
    pickedSide === "long" ? active.premiumDiscount === "discount" : active.premiumDiscount === "premium"
  ].filter(Boolean).length;
  const confidence = Math.max(42, Math.min(68, 42 + confirmationCount * 4 + alignedHigher * 4 - market.riskFlags.length * 2));

  return {
    mode,
    side: pickedSide,
    quality: confidence >= 62 ? "B" : "C",
    title: `${pickedSide === "long" ? "롱" : "숏"} 관찰 카드`,
    entryLabel: zone.label,
    entryLow,
    entryHigh,
    invalidation,
    target1: pickedSide === "long" ? entry + risk * config.targetR1 : entry - risk * config.targetR1,
    target2: pickedSide === "long" ? entry + risk * config.targetR2 : entry - risk * config.targetR2,
    rr1: config.targetR1,
    rr2: config.targetR2,
    confidence,
    reason: "진입 후보는 아니지만, 구조상 계속 관찰할 만한 반응 구간입니다.",
    cautions: ["관찰 카드입니다. 조건이 추가로 맞기 전까지 진입 신호로 보지 마세요."]
  };
}

function getWatchKind(market: MarketAnalysis, analyses: TimeframeAnalysis[]): NonNullable<Candidate["watchKind"]> {
  const plan = market.proPlan;
  const active = analyses.find((a) => a.timeframe === market.activeTimeframe);
  if (!plan || !active) return "aligned";
  const direction = planDirection(plan);
  return market.bias === plan.side || active.msb === direction || active.choch === direction ? "aligned" : "counter";
}

function getScoutScoreCap(market: MarketAnalysis, analyses: TimeframeAnalysis[], proximity: ProximityInfo, mode: TradingMode) {
  const plan = market.proPlan;
  if (!plan) return 0;
  const active = analyses.find((a) => a.timeframe === market.activeTimeframe);
  const hasHardZone = hasHardReactionZone(active, plan);
  const hasOnlyOteZone = Boolean(active && !hasHardZone && active.oteZone === plan.side);
  let cap = 100;

  if (proximity.proximity === "wait") cap = Math.min(cap, mode === "scalp" ? 62 : 82);
  if (proximity.proximity === "inside") cap = Math.min(cap, 62);
  if (mode === "scalp" && proximity.proximity === "near") cap = Math.min(cap, 86);
  if (mode === "scalp" && market.killzone === "off") cap = Math.min(cap, 44);
  if (mode === "scalp" && active?.volumeProfile?.position === "near") cap = Math.min(cap, 44);
  if (hasOnlyOteZone) cap = Math.min(cap, plan.side === "short" ? 64 : 70);
  if (active?.timeframe === "15m" && !hasHardZone) cap = Math.min(cap, 66);
  if (hasRiskFlag(market, "최근 반대 방향 스윕")) cap = Math.min(cap, 78);
  if (plan.side === "long" && active?.premiumDiscount === "premium") cap = Math.min(cap, 58);
  if (plan.side === "short" && active?.premiumDiscount === "discount") cap = Math.min(cap, 58);
  if (plan.side === "long" && active?.volumeProfile?.position === "below") cap = Math.min(cap, 62);
  if (plan.side === "short" && active?.volumeProfile?.position === "above") cap = Math.min(cap, 62);
  if (active?.oteZone !== "none" && active?.oteZone !== plan.side) cap = Math.min(cap, 60);

  return cap;
}

function computeScoutScore(market: MarketAnalysis, analyses: TimeframeAnalysis[], proximity: ProximityInfo, mode: TradingMode) {
  const plan = market.proPlan;
  if (!plan) return 0;
  const direction = planDirection(plan);
  const active = analyses.find((a) => a.timeframe === market.activeTimeframe);
  const modeConfig = tradingModeConfigs[mode];
  const hasHardZone = hasHardReactionZone(active, plan);
  let score = plan.confidence;

  score += analyses.filter((a) => modeConfig.contextTimeframes.includes(a.timeframe) && a.msb === direction).length * 3;
  if (market.readiness === "high") score += 4;
  else if (market.readiness === "low") score -= 4;
  score -= Math.min(market.riskFlags.length * 3, 15);
  if (hasRiskFlag(market, "상위 시간대 구조가 반대 방향")) score -= 18;
  if (hasRiskFlag(market, "최근 반대 방향 CISD")) score -= 18;
  if (hasRiskFlag(market, "최근 반대 방향 스윕")) score -= 8;
  if (hasHardZone) score += 6;
  else if (active?.oteZone === plan.side) score -= 4;
  else score -= 10;
  if (active?.oteZone === plan.side) score += 4;
  if (proximity.proximity === "inside") score -= 10;
  else if (proximity.proximity === "near") score += 4;
  else if (proximity.proximity === "wait") score -= 4;
  if (active?.volumeProfile?.position === "near") score += 2;
  if (plan.side === "long" && active?.volumeProfile?.position === "below") score -= 14;
  if (plan.side === "short" && active?.volumeProfile?.position === "above") score -= 14;
  if (plan.side === "long" && active?.volumeProfile?.position === "above") score += 2;
  if (plan.side === "short" && active?.volumeProfile?.position === "below") score += 2;

  return Math.round(Math.max(0, Math.min(getScoutScoreCap(market, analyses, proximity, mode), score)));
}

function blocked(market: MarketAnalysis, analyses: TimeframeAnalysis[], proximity: ProximityInfo, mode: TradingMode) {
  const plan = market.proPlan;
  if (!plan) return true;
  const active = analyses.find((a) => a.timeframe === market.activeTimeframe);
  if (!active) return true;
  const direction = planDirection(plan);
  const opposite = plan.side === "long" ? "bearish" : "bullish";
  const hasHardZone = hasHardReactionZone(active, plan);
  const hasFreshSameDirectionTrigger =
    (active.latestSweep?.direction === direction && active.latestSweep.age <= 6) ||
    (active.latestCisd?.direction === direction && active.latestCisd.age <= 6);

  if (!hasUsablePlanZone(active, plan)) return true;
  if (mode === "scalp" && market.killzone === "off") return true;
  if (active.msb !== direction || active.choch !== direction) return true;
  if (active.latestSweep?.direction === opposite && active.latestSweep.age <= 8) return true;
  if (active.latestCisd?.direction === opposite && active.latestCisd.age <= 8) return true;
  if (proximity.proximity === "inside") return true;
  if (mode === "scalp" && proximity.proximity === "wait") return researchRelaxation < 1;
  if (mode === "scalp" && active.volumeProfile?.position === "near") return researchRelaxation < 1;
  if (plan.side === "long" && active.volumeProfile?.position === "below") return true;
  if (plan.side === "short" && active.volumeProfile?.position === "above") return true;
  if (plan.side === "long" && active.premiumDiscount === "premium") return true;
  if (plan.side === "short" && active.premiumDiscount === "discount") return true;
  if (active.oteZone !== "none" && active.oteZone !== plan.side) return true;
  if (mode === "scalp" && !hasHardZone && !hasFreshSameDirectionTrigger) return researchRelaxation < 2;
  if (mode === "scalp" && active.timeframe === "5m" && !hasHardZone && active.oteZone !== plan.side) return true;
  if (mode === "swing" && active.timeframe === "4h" && !hasHardZone && active.oteZone !== plan.side) return true;
  return false;
}

function buildCandidate(
  mode: TradingMode,
  timeframe: ChartTimeframe,
  allCandles: Map<ChartTimeframe, Candle[]>,
  index: number
): Candidate | null {
  const activeCandles = allCandles.get(timeframe)?.slice(0, index + 1);
  const fourHour = allCandles.get("4h");
  if (!activeCandles || !fourHour || activeCandles.length < 220) return null;
  const targetTimeframes = Array.from(new Set<ChartTimeframe>([timeframe, ...tradingModeConfigs[mode].contextTimeframes]));
  const analyses: TimeframeAnalysis[] = [];

  for (const tf of targetTimeframes) {
    const source = allCandles.get(tf);
    if (!source) return null;
    const activeTime = activeCandles[activeCandles.length - 1].time;
    const tfCandles = source.filter((candle) => candle.time <= activeTime);
    const lookback = lookbackByTimeframe[tf];
    if (tfCandles.length < Math.max(80, lookback)) return null;
    const oteAnchorCandles = fourHour.filter((candle) => candle.time <= activeTime).slice(-lookbackByTimeframe["4h"]);
    analyses.push(analyzeTimeframe(tf, tfCandles.slice(-lookback), { oteAnchorCandles, useCloseForMsb: true }));
  }

  const current = activeCandles[activeCandles.length - 1];
  const market = summarizeMarket(symbol, timeframe, analyses, current.close, mode);
  if (!market.proPlan) {
    market.proPlan = buildWatchOnlyPlan(market, analyses, current.close, mode);
  }
  if (!market.proPlan) return null;
  const proximity = analyzeProximity(market.proPlan, current.close, timeframe);
  if (proximity.proximity === "missed") return null;
  if (Math.abs(proximity.distancePercent) > proximityHardLimit[timeframe]) return null;
  const score = computeScoutScore(market, analyses, proximity, mode);
  const isEntry = !blocked(market, analyses, proximity, mode) && score >= minimumScoutScore[mode] - researchRelaxation * 8;
  if (!isEntry && score < minimumWatchScore[mode]) return null;
  const active = analyses.find((item) => item.timeframe === timeframe);

  return {
    symbol,
    mode,
    status: isEntry ? "entry" : "watch",
    watchKind: isEntry ? undefined : getWatchKind(market, analyses),
    regime: regimeAt(current.time, fourHour),
    timeframe,
    side: market.proPlan.side,
    quality: market.proPlan.quality,
    score,
    confidence: market.proPlan.confidence,
    readiness: market.readiness,
    currentPrice: current.close,
    entryLow: market.proPlan.entryLow,
    entryHigh: market.proPlan.entryHigh,
    invalidation: market.proPlan.invalidation,
    target1: targetPriceFromR(market.proPlan, targetR1For(market.proPlan)),
    target2: targetPriceFromR(market.proPlan, targetR2For(market.proPlan)),
    rr1: targetR1For(market.proPlan),
    rr2: targetR2For(market.proPlan),
    timestamp: current.time,
    index,
    proximity: proximity.proximity,
    distancePercent: proximity.distancePercent,
    riskFlags: market.riskFlags,
    ctx: {
      msb: active?.msb ?? "unknown",
      choch: active?.choch ?? "unknown",
      premiumDiscount: active?.premiumDiscount ?? "unknown",
      pocPosition: active?.volumeProfile?.position ?? "unknown",
      inOb: active?.inOb ?? false,
      inFvg: active?.inFvg ?? false,
      oteZone: active?.oteZone ?? "none"
    }
  };
}

function evaluate(candidate: Candidate, candles: Candle[]): EvaluatedCandidate {
  const start = candidate.index + 1;
  const end = Math.min(candles.length - 1, candidate.index + forwardBarsByTimeframe[candidate.timeframe]);
  let maxFavorablePercent = 0;
  let maxAdversePercent = 0;
  let entered = candidate.proximity === "inside";
  let barsToEntry: number | null = entered ? 0 : null;

  for (let index = start; index <= end; index += 1) {
    const candle = candles[index];
    if (!candle) break;
    const touchedEntryZone = candle.low <= candidate.entryHigh && candle.high >= candidate.entryLow;
    const hitInvalidation = candidate.side === "long" ? candle.low <= candidate.invalidation : candle.high >= candidate.invalidation;
    const hitTarget2 = candidate.side === "long" ? candle.high >= candidate.target2 : candle.low <= candidate.target2;
    const hitTarget1 = candidate.side === "long" ? candle.high >= candidate.target1 : candle.low <= candidate.target1;

    if (!entered) {
      if (hitInvalidation) {
        return { ...candidate, outcome: "invalidatedBeforeEntry", barsToOutcome: index - candidate.index, barsToEntry, maxFavorablePercent, maxAdversePercent };
      }
      if (!touchedEntryZone) continue;
      entered = true;
      barsToEntry = index - candidate.index;
      if (hitTarget1 || hitTarget2) {
        return { ...candidate, outcome: "ambiguous", barsToOutcome: index - candidate.index, barsToEntry, maxFavorablePercent, maxAdversePercent };
      }
    }

    const favorable =
      candidate.side === "long"
        ? ((candle.high - candidate.currentPrice) / candidate.currentPrice) * 100
        : ((candidate.currentPrice - candle.low) / candidate.currentPrice) * 100;
    const adverse =
      candidate.side === "long"
        ? ((candidate.currentPrice - candle.low) / candidate.currentPrice) * 100
        : ((candle.high - candidate.currentPrice) / candidate.currentPrice) * 100;
    maxFavorablePercent = Math.max(maxFavorablePercent, favorable);
    maxAdversePercent = Math.max(maxAdversePercent, adverse);

    if (hitInvalidation && (hitTarget1 || hitTarget2)) {
      return { ...candidate, outcome: "ambiguous", barsToOutcome: index - candidate.index, barsToEntry, maxFavorablePercent, maxAdversePercent };
    }
    if (hitInvalidation) {
      return { ...candidate, outcome: "invalidation", barsToOutcome: index - candidate.index, barsToEntry, maxFavorablePercent, maxAdversePercent };
    }
    if (hitTarget2) {
      return { ...candidate, outcome: "target2", barsToOutcome: index - candidate.index, barsToEntry, maxFavorablePercent, maxAdversePercent };
    }
    if (hitTarget1) {
      return { ...candidate, outcome: "target1", barsToOutcome: index - candidate.index, barsToEntry, maxFavorablePercent, maxAdversePercent };
    }
  }

  if (!entered) return { ...candidate, outcome: "noEntry", barsToOutcome: end - candidate.index, barsToEntry: null, maxFavorablePercent, maxAdversePercent };
  return { ...candidate, outcome: "timeout", barsToOutcome: end - candidate.index, barsToEntry, maxFavorablePercent, maxAdversePercent };
}

function summarize(label: string, items: EvaluatedCandidate[]) {
  const wins = items.filter((item) => item.outcome === "target1" || item.outcome === "target2");
  const losses = items.filter((item) => item.outcome === "invalidation");
  const resolved = [...wins, ...losses];
  const entered = items.filter((item) => item.barsToEntry !== null);
  const rMultiple = items.map((item) => {
    if (item.outcome === "target2") return item.rr2;
    if (item.outcome === "target1") return item.rr1;
    if (item.outcome === "invalidation") return -1;
    return 0;
  });
  return {
    label,
    total: items.length,
    wins: wins.length,
    losses: losses.length,
    ambiguous: items.filter((item) => item.outcome === "ambiguous").length,
    timeouts: items.filter((item) => item.outcome === "timeout").length,
    noEntries: items.filter((item) => item.outcome === "noEntry" || item.outcome === "invalidatedBeforeEntry").length,
    entryRate: pct(entered.length, items.length),
    winRateAll: pct(wins.length, items.length),
    winRateResolved: pct(wins.length, resolved.length),
    avgR: round(avg(rMultiple), 2),
    avgScore: round(avg(items.map((item) => item.score)), 1),
    avgMfePercent: round(avg(items.map((item) => item.maxFavorablePercent)), 2),
    avgMaePercent: round(avg(items.map((item) => item.maxAdversePercent)), 2)
  };
}

function pct(a: number, b: number) {
  return b ? round((a / b) * 100, 1) : 0;
}

function avg(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function round(value: number, digits: number) {
  return Number(value.toFixed(digits));
}

function groupBy<T>(items: T[], keyFn: (item: T) => string) {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    map.set(key, [...(map.get(key) ?? []), item]);
  }
  return Array.from(map.entries()).map(([key, value]) => ({ key, value }));
}

function toKst(sec: number) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(sec * 1000));
}

function reportPath() {
  const relax = researchRelaxation > 0 ? `relax${researchRelaxation}` : "strict";
  return join(reportDir, `${normalizedExchangeSymbol().toLowerCase()}-${days}d-${relax}.json`);
}

function candidateDumpPath() {
  const relax = researchRelaxation > 0 ? `relax${researchRelaxation}` : "strict";
  return join(reportDir, `${normalizedExchangeSymbol().toLowerCase()}-${days}d-${relax}.candidates.json`);
}

function shouldSampleIndex(candle: Candle, timeframe: ChartTimeframe) {
  const sampleEverySeconds = (intervalMs[timeframe] / 1000) * stepByTimeframe[timeframe];
  return candle.time % sampleEverySeconds === 0;
}

async function main() {
  const endMs = Date.now();
  const startMs = endMs - days * 24 * 60 * 60 * 1000;
  const candleSets: Array<readonly [ChartTimeframe, Candle[]]> = [];
  for (const tf of chartTimeframes) {
    console.log(`[backtest] fetching ${symbol} ${tf} ${days}d`);
    candleSets.push([tf, await fetchHistoricalCandles(tf, startMs, endMs)] as const);
  }
  const allCandles = new Map<ChartTimeframe, Candle[]>(candleSets);
  const evaluated: EvaluatedCandidate[] = [];

  for (const mode of tradingModes) {
    for (const timeframe of tradingModeConfigs[mode].activeTimeframes) {
      const activeCandles = allCandles.get(timeframe);
      if (!activeCandles) continue;
      const startIndex = Math.max(300, Math.floor(activeCandles.length * 0.08));
      const endIndex = activeCandles.length - forwardBarsByTimeframe[timeframe] - 1;

      for (let index = startIndex; index <= endIndex; index += 1) {
        if (!shouldSampleIndex(activeCandles[index], timeframe)) continue;
        const candidate = buildCandidate(mode, timeframe, allCandles, index);
        if (!candidate) continue;
        evaluated.push(evaluate(candidate, activeCandles));
      }
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    symbol,
    days,
    researchRelaxation,
    totalCandles: Object.fromEntries(Array.from(allCandles.entries()).map(([tf, candles]) => [tf, candles.length])),
    notes: [
      `${symbol} futures only.`,
      "Regime is classified from 4H trend: bull/bear/range.",
      `Target R settings: R1=${Number.isFinite(targetR1Override) ? targetR1Override : "mode default"}, R2=${Number.isFinite(targetR2Override) ? targetR2Override : "mode default"}.`,
      "This is a mechanical candidate validation, not a full exchange fill simulation.",
      "Entry candidates and watch-only cards are separated by status; watch cards are not entry signals."
    ],
    overall: summarize("overall", evaluated),
    entryOnly: summarize("entryOnly", evaluated.filter((item) => item.status === "entry")),
    watchOnly: summarize("watchOnly", evaluated.filter((item) => item.status === "watch")),
    byMode: groupBy(evaluated, (item) => item.mode).map((group) => summarize(group.key, group.value)),
    byStatus: groupBy(evaluated, (item) => item.status).map((group) => summarize(group.key, group.value)),
    byRegime: groupBy(evaluated, (item) => item.regime).map((group) => summarize(group.key, group.value)),
    bySide: groupBy(evaluated, (item) => item.side).map((group) => summarize(group.key, group.value)),
    byModeStatus: groupBy(evaluated, (item) => `${item.mode}:${item.status}`).map((group) => summarize(group.key, group.value)),
    byModeSideRegime: groupBy(evaluated, (item) => `${item.mode}:${item.side}:${item.regime}`).map((group) =>
      summarize(group.key, group.value)
    ),
    byModeTimeframe: groupBy(evaluated, (item) => `${item.mode}:${item.timeframe}`).map((group) =>
      summarize(group.key, group.value)
    ),
    worstInvalidations: evaluated
      .filter((item) => item.outcome === "invalidation")
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
      .map((item) => ({
        time: toKst(item.timestamp),
        mode: item.mode,
        status: item.status,
        watchKind: item.watchKind,
        regime: item.regime,
        tf: item.timeframe,
        side: item.side,
        score: item.score,
        proximity: item.proximity,
        mae: round(item.maxAdversePercent, 2),
        mfe: round(item.maxFavorablePercent, 2),
        ctx: item.ctx,
        risks: item.riskFlags.slice(0, 3)
      }))
  };

  await mkdir(reportDir, { recursive: true });
  await writeFile(reportPath(), JSON.stringify(report, null, 2), "utf8");
  if (process.env.BACKTEST_DUMP_CANDIDATES === "1") {
    await writeFile(candidateDumpPath(), JSON.stringify(evaluated, null, 2), "utf8");
    console.log(`[backtest] wrote ${candidateDumpPath()}`);
  }
  console.log(`[backtest] wrote ${reportPath()}`);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
