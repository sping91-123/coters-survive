import {
  analyzeTimeframe,
  chartTimeframes,
  fetchBinanceCandles,
  summarizeMarket,
  tradingModeConfigs,
  type Candle,
  type ChartTimeframe,
  type MarketAnalysis,
  type TimeframeAnalysis,
  type TradingMode,
  type TradePlanCandidate
} from "../src/lib/marketAnalysis";

type Side = "long" | "short";
type Outcome =
  | "target1"
  | "target2"
  | "invalidation"
  | "timeout"
  | "ambiguous"
  | "noEntry"
  | "invalidatedBeforeEntry";

interface Candidate {
  symbol: string;
  mode: TradingMode;
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
  riskFlags: string[];
  opportunityFlags: string[];
  timestamp: number;
  index: number;
  proximity: "inside" | "near" | "wait" | "missed";
  distancePercent: number;
  activeContext: {
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

const symbols = ["BTCUSDT.P", "ETHUSDT.P", "SOLUSDT.P", "XRPUSDT.P", "DOGEUSDT.P", "BNBUSDT.P"];
const tradingModes: TradingMode[] = ["scalp", "swing"];
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
const shortScoutSetupsEnabled = false;
const criticalRiskFlags = ["상위 시간대 구조가 반대 방향", "최근 반대 방향 CISD 발생"] as const;

function analyzeProximity(
  plan: TradePlanCandidate,
  currentPrice: number,
  timeframe: ChartTimeframe
): ProximityInfo {
  const insideZone = currentPrice >= plan.entryLow && currentPrice <= plan.entryHigh;
  if (insideZone) return { distancePercent: 0, proximity: "inside" };

  if (plan.side === "long") {
    if (currentPrice < plan.entryLow) {
      return {
        distancePercent: -((plan.entryLow - currentPrice) / currentPrice) * 100,
        proximity: "missed"
      };
    }
    const distancePercent = ((currentPrice - plan.entryHigh) / currentPrice) * 100;
    return {
      distancePercent,
      proximity: distancePercent <= proximityNearLimit[timeframe] ? "near" : "wait"
    };
  }

  if (currentPrice > plan.entryHigh) {
    return {
      distancePercent: -((currentPrice - plan.entryHigh) / currentPrice) * 100,
      proximity: "missed"
    };
  }

  const distancePercent = ((plan.entryLow - currentPrice) / currentPrice) * 100;
  return {
    distancePercent,
    proximity: distancePercent <= proximityNearLimit[timeframe] ? "near" : "wait"
  };
}

function computeScoutScore(
  market: MarketAnalysis,
  analyses: TimeframeAnalysis[],
  proximity: ProximityInfo,
  mode: TradingMode
) {
  const plan = market.proPlan;
  if (!plan) return 0;
  const direction = plan.side === "long" ? "bullish" : "bearish";
  const modeConfig = tradingModeConfigs[mode];
  let score = plan.confidence;

  const higherAligned = analyses
    .filter((a) => modeConfig.contextTimeframes.includes(a.timeframe))
    .filter((a) => a.msb === direction).length;
  score += higherAligned * 3;

  if (market.readiness === "high") score += 4;
  else if (market.readiness === "low") score -= 4;

  score -= Math.min(market.riskFlags.length * 3, 15);
  if (criticalRiskFlags.some((flag) => hasRiskFlag(market, flag))) score -= 18;
  if (hasRiskFlag(market, "최근 반대 방향 스윕")) score -= 8;
  if (hasRiskFlag(market, "POC 아래 위치") || hasRiskFlag(market, "디스카운트 추격")) score -= 10;

  const active = analyses.find((a) => a.timeframe === market.activeTimeframe);
  const hasHardZone = hasHardReactionZone(active, plan);
  if (hasHardZone) score += 6;
  else if (active?.oteZone === plan.side) score -= 4;
  else score -= 10;

  if (active?.oteZone === plan.side) score += 4;

  if (proximity.proximity === "inside") score -= 10;
  else if (proximity.proximity === "near") score += 4;
  else if (proximity.proximity === "wait") score -= 4;

  if (active?.volumeProfile?.position === "near") score += 2;
  if (plan.side === "long" && active?.volumeProfile?.position === "below") score -= 14;
  if (plan.side === "short" && active?.volumeProfile?.position === "above") score -= 4;
  if (plan.side === "long" && active?.volumeProfile?.position === "above") score += 2;
  if (plan.side === "short" && active?.volumeProfile?.position === "below") score -= 12;

  const cap = getScoutScoreCap(market, analyses, proximity, mode);
  return Math.round(Math.max(0, Math.min(cap, score)));
}

function hasRiskFlag(market: MarketAnalysis, pattern: string) {
  return market.riskFlags.some((flag) => flag.includes(pattern));
}

function planDirection(plan: TradePlanCandidate) {
  return plan.side === "long" ? "bullish" : "bearish";
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

function hasBlockingScoutCondition(
  market: MarketAnalysis,
  analyses: TimeframeAnalysis[],
  proximity: ProximityInfo,
  mode: TradingMode
) {
  const plan = market.proPlan;
  if (!plan) return true;
  const active = analyses.find((a) => a.timeframe === market.activeTimeframe);
  const direction = planDirection(plan);
  const opposite = plan.side === "long" ? "bearish" : "bullish";
  const hasHardZone = hasHardReactionZone(active, plan);
  const hasFreshSameDirectionTrigger =
    (active?.latestSweep?.direction === direction && active.latestSweep.age <= 6) ||
    (active?.latestCisd?.direction === direction && active.latestCisd.age <= 6);

  if (!active) return true;
  if (!shortScoutSetupsEnabled && plan.side === "short") return true;
  if (criticalRiskFlags.some((flag) => hasRiskFlag(market, flag))) return true;
  if (!hasUsablePlanZone(active, plan)) return true;
  if (active.msb !== direction || active.choch !== direction) return true;
  if (active.latestSweep?.direction === opposite && active.latestSweep.age <= 8) return true;
  if (active.latestCisd?.direction === opposite && active.latestCisd.age <= 8) return true;
  if (proximity.proximity === "inside") return true;
  if (mode === "scalp" && proximity.proximity === "wait") return true;
  if (plan.side === "long" && active?.volumeProfile?.position === "below") return true;
  if (plan.side === "long" && active?.premiumDiscount === "premium") return true;
  if (plan.side === "short" && active?.premiumDiscount === "discount") return true;
  if (active?.oteZone !== "none" && active?.oteZone !== plan.side) return true;
  if (mode === "swing" && active.timeframe === "15m" && !hasHardZone) return true;
  if (mode === "scalp" && active.timeframe === "5m" && !hasHardZone && active.oteZone !== plan.side) return true;
  if (mode === "scalp" && !hasHardZone && !hasFreshSameDirectionTrigger) return true;

  return false;
}

function getScoutScoreCap(
  market: MarketAnalysis,
  analyses: TimeframeAnalysis[],
  proximity: ProximityInfo,
  mode: TradingMode
) {
  const plan = market.proPlan;
  if (!plan) return 0;
  const active = analyses.find((a) => a.timeframe === market.activeTimeframe);
  const hasHardZone = hasHardReactionZone(active, plan);
  const hasOnlyOteZone = Boolean(active && !hasHardZone && active.oteZone === plan.side);
  let cap = 100;

  if (proximity.proximity === "wait") cap = Math.min(cap, 82);
  if (proximity.proximity === "inside") cap = Math.min(cap, 62);
  if (mode === "scalp" && proximity.proximity === "near") cap = Math.min(cap, 86);
  if (plan.side === "short") cap = Math.min(cap, 62);
  if (hasOnlyOteZone) cap = Math.min(cap, 70);
  if (active?.timeframe === "15m" && !hasHardZone) cap = Math.min(cap, 66);
  if (criticalRiskFlags.some((flag) => hasRiskFlag(market, flag))) cap = Math.min(cap, 58);
  if (hasRiskFlag(market, "최근 반대 방향 스윕")) cap = Math.min(cap, 78);
  if (plan.side === "long" && active?.premiumDiscount === "premium") cap = Math.min(cap, 74);
  if (plan.side === "long" && active?.volumeProfile?.position === "below") cap = Math.min(cap, 62);
  if (plan.side === "short" && active?.volumeProfile?.position !== "above") cap = Math.min(cap, 58);
  if (active?.oteZone !== "none" && active?.oteZone !== plan.side) cap = Math.min(cap, 60);

  return cap;
}

function buildCandidate(
  symbol: string,
  mode: TradingMode,
  timeframe: ChartTimeframe,
  allCandles: Map<ChartTimeframe, Candle[]>,
  index: number
): Candidate | null {
  const higherTimeframes = tradingModeConfigs[mode].contextTimeframes;
  const targetTimeframes = Array.from(new Set<ChartTimeframe>([timeframe, ...higherTimeframes]));
  const activeCandles = allCandles.get(timeframe)?.slice(0, index + 1);
  if (!activeCandles || activeCandles.length < 220) return null;

  const analyses: TimeframeAnalysis[] = [];
  for (const tf of targetTimeframes) {
    const source = allCandles.get(tf);
    if (!source || source.length < 220) return null;

    const activeTime = activeCandles[activeCandles.length - 1].time;
    const tfCandles = source.filter((candle) => candle.time <= activeTime);
    const lookback = lookbackByTimeframe[tf];
    if (tfCandles.length < Math.max(80, lookback)) return null;

    const oteAnchorCandles = (allCandles.get("4h") ?? tfCandles)
      .filter((candle) => candle.time <= activeTime)
      .slice(-lookbackByTimeframe["4h"]);
    analyses.push(
      analyzeTimeframe(tf, tfCandles.slice(-lookback), {
        oteAnchorCandles,
        useCloseForMsb: true
      })
    );
  }

  const current = activeCandles[activeCandles.length - 1];
  const market = summarizeMarket(symbol, timeframe, analyses, current.close, mode);
  if (!market.proPlan) return null;

  const proximity = analyzeProximity(market.proPlan, current.close, timeframe);
  if (proximity.proximity === "missed") return null;
  if (Math.abs(proximity.distancePercent) > proximityHardLimit[timeframe]) return null;

  const score = computeScoutScore(market, analyses, proximity, mode);
  if (hasBlockingScoutCondition(market, analyses, proximity, mode)) return null;
  if (score < minimumScoutScore[mode]) return null;

  const active = analyses.find((item) => item.timeframe === timeframe);
  return {
    symbol,
    mode,
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
    target1: market.proPlan.target1,
    target2: market.proPlan.target2,
    rr1: market.proPlan.rr1,
    rr2: market.proPlan.rr2,
    riskFlags: market.riskFlags,
    opportunityFlags: market.opportunityFlags,
    timestamp: current.time,
    index,
    proximity: proximity.proximity,
    distancePercent: proximity.distancePercent,
    activeContext: {
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

function evaluateCandidate(candidate: Candidate, candles: Candle[]): EvaluatedCandidate {
  const start = candidate.index + 1;
  const forwardBars = forwardBarsByTimeframe[candidate.timeframe];
  const end = Math.min(candles.length - 1, candidate.index + forwardBars);
  let maxFavorablePercent = 0;
  let maxAdversePercent = 0;
  let entered = candidate.proximity === "inside";
  let barsToEntry: number | null = entered ? 0 : null;

  const base = {
    ...candidate,
    barsToEntry
  };

  for (let index = start; index <= end; index += 1) {
    const candle = candles[index];
    if (!candle) break;

    const touchedEntryZone = candle.low <= candidate.entryHigh && candle.high >= candidate.entryLow;
    const hitInvalidation =
      candidate.side === "long"
        ? candle.low <= candidate.invalidation
        : candle.high >= candidate.invalidation;
    const hitTarget2 =
      candidate.side === "long" ? candle.high >= candidate.target2 : candle.low <= candidate.target2;
    const hitTarget1 =
      candidate.side === "long" ? candle.high >= candidate.target1 : candle.low <= candidate.target1;

    if (!entered) {
      if (hitInvalidation) {
        return {
          ...base,
          outcome: "invalidatedBeforeEntry",
          barsToOutcome: index - candidate.index,
          barsToEntry,
          maxFavorablePercent,
          maxAdversePercent
        };
      }

      if (!touchedEntryZone) {
        continue;
      }

      entered = true;
      barsToEntry = index - candidate.index;

      if (hitTarget1 || hitTarget2) {
        return {
          ...base,
          outcome: "ambiguous",
          barsToOutcome: index - candidate.index,
          barsToEntry,
          maxFavorablePercent,
          maxAdversePercent
        };
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
      return {
        ...candidate,
        outcome: "ambiguous",
        barsToOutcome: index - candidate.index,
        barsToEntry,
        maxFavorablePercent,
        maxAdversePercent
      };
    }

    if (hitInvalidation) {
      return {
        ...candidate,
        outcome: "invalidation",
        barsToOutcome: index - candidate.index,
        barsToEntry,
        maxFavorablePercent,
        maxAdversePercent
      };
    }

    if (hitTarget2) {
      return {
        ...candidate,
        outcome: "target2",
        barsToOutcome: index - candidate.index,
        barsToEntry,
        maxFavorablePercent,
        maxAdversePercent
      };
    }

    if (hitTarget1) {
      return {
        ...candidate,
        outcome: "target1",
        barsToOutcome: index - candidate.index,
        barsToEntry,
        maxFavorablePercent,
        maxAdversePercent
      };
    }
  }

  if (!entered) {
    return {
      ...candidate,
      outcome: "noEntry",
      barsToOutcome: end - candidate.index,
      barsToEntry: null,
      maxFavorablePercent,
      maxAdversePercent
    };
  }

  return {
    ...candidate,
    outcome: "timeout",
    barsToOutcome: end - candidate.index,
    barsToEntry,
    maxFavorablePercent,
    maxAdversePercent
  };
}

function summarize(label: string, items: EvaluatedCandidate[]) {
  const resolved = items.filter((item) => item.outcome === "target1" || item.outcome === "target2" || item.outcome === "invalidation");
  const wins = items.filter((item) => item.outcome === "target1" || item.outcome === "target2");
  const losses = items.filter((item) => item.outcome === "invalidation");
  const ambiguous = items.filter((item) => item.outcome === "ambiguous");
  const timeouts = items.filter((item) => item.outcome === "timeout");
  const noEntries = items.filter((item) => item.outcome === "noEntry" || item.outcome === "invalidatedBeforeEntry");
  const entered = items.filter((item) => item.barsToEntry !== null);
  const avgMfe = avg(items.map((item) => item.maxFavorablePercent));
  const avgMae = avg(items.map((item) => item.maxAdversePercent));
  const avgScore = avg(items.map((item) => item.score));
  const winRateAll = items.length ? (wins.length / items.length) * 100 : 0;
  const winRateResolved = resolved.length ? (wins.length / resolved.length) * 100 : 0;
  const entryRate = items.length ? (entered.length / items.length) * 100 : 0;

  return {
    label,
    total: items.length,
    wins: wins.length,
    losses: losses.length,
    ambiguous: ambiguous.length,
    timeouts: timeouts.length,
    noEntries: noEntries.length,
    entryRate: Number(entryRate.toFixed(1)),
    winRateAll: Number(winRateAll.toFixed(1)),
    winRateResolved: Number(winRateResolved.toFixed(1)),
    avgScore: Number(avgScore.toFixed(1)),
    avgMfePercent: Number(avgMfe.toFixed(2)),
    avgMaePercent: Number(avgMae.toFixed(2))
  };
}

function avg(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
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

async function main() {
  const evaluated: EvaluatedCandidate[] = [];

  for (const symbol of symbols) {
    console.log(`[verify] fetching ${symbol}`);
    const candleSets = await Promise.all(
      chartTimeframes.map(async (tf) => [tf, await fetchBinanceCandles(symbol, tf, 1000)] as const)
    );
    const allCandles = new Map<ChartTimeframe, Candle[]>(candleSets);

    for (const mode of tradingModes) {
      for (const timeframe of tradingModeConfigs[mode].activeTimeframes) {
        const activeCandles = allCandles.get(timeframe);
        if (!activeCandles) continue;

        const startIndex = Math.max(260, activeCandles.length - 520);
        const endIndex = activeCandles.length - forwardBarsByTimeframe[timeframe] - 1;
        const step = timeframe === "5m" ? 6 : timeframe === "15m" ? 4 : timeframe === "1h" ? 2 : 1;

        for (let index = startIndex; index <= endIndex; index += step) {
          const candidate = buildCandidate(symbol, mode, timeframe, allCandles, index);
          if (!candidate) continue;
          evaluated.push(evaluateCandidate(candidate, activeCandles));
        }
      }
    }
  }

  const topBad = evaluated
    .filter((item) => item.outcome === "invalidation")
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map((item) => ({
      time: toKst(item.timestamp),
      symbol: item.symbol,
      mode: item.mode,
      tf: item.timeframe,
      side: item.side,
      score: item.score,
      quality: item.quality,
      proximity: item.proximity,
      distance: Number(item.distancePercent.toFixed(2)),
      bars: item.barsToOutcome,
      entryBars: item.barsToEntry,
      mae: Number(item.maxAdversePercent.toFixed(2)),
      mfe: Number(item.maxFavorablePercent.toFixed(2)),
      risks: item.riskFlags.slice(0, 3),
      ctx: item.activeContext
    }));

  const report = {
    generatedAt: new Date().toISOString(),
    notes: [
      "This is a mechanical validation of scanner candidates on recent Binance futures candles.",
      "It checks whether target1/target2 or invalidation is touched first within a fixed forward window.",
      "Ambiguous means both target and invalidation were touched in the same candle, so intrabar order is unknown."
    ],
    overall: summarize("overall", evaluated),
    byMode: groupBy(evaluated, (item) => item.mode).map((group) => summarize(group.key, group.value)),
    byTimeframe: groupBy(evaluated, (item) => item.timeframe).map((group) => summarize(group.key, group.value)),
    byModeAndTimeframe: groupBy(evaluated, (item) => `${item.mode}:${item.timeframe}`).map((group) =>
      summarize(group.key, group.value)
    ),
    bySymbol: groupBy(evaluated, (item) => item.symbol).map((group) => summarize(group.key, group.value)),
    bySide: groupBy(evaluated, (item) => item.side).map((group) => summarize(group.key, group.value)),
    bySideAndTimeframe: groupBy(evaluated, (item) => `${item.side}:${item.timeframe}`).map((group) =>
      summarize(group.key, group.value)
    ),
    byProximity: groupBy(evaluated, (item) => item.proximity).map((group) => summarize(group.key, group.value)),
    bySideAndProximity: groupBy(evaluated, (item) => `${item.side}:${item.proximity}`).map((group) =>
      summarize(group.key, group.value)
    ),
    byPocPosition: groupBy(evaluated, (item) => item.activeContext.pocPosition).map((group) => summarize(group.key, group.value)),
    bySideAndPocPosition: groupBy(evaluated, (item) => `${item.side}:${item.activeContext.pocPosition}`).map((group) =>
      summarize(group.key, group.value)
    ),
    byPremiumDiscount: groupBy(evaluated, (item) => item.activeContext.premiumDiscount).map((group) =>
      summarize(group.key, group.value)
    ),
    bySideAndPremiumDiscount: groupBy(evaluated, (item) => `${item.side}:${item.activeContext.premiumDiscount}`).map((group) =>
      summarize(group.key, group.value)
    ),
    byQuality: groupBy(evaluated, (item) => item.quality).map((group) => summarize(group.key, group.value)),
    byScoreBand: groupBy(evaluated, (item) => {
      if (item.score >= 90) return "90+";
      if (item.score >= 80) return "80-89";
      if (item.score >= 70) return "70-79";
      if (item.score >= 60) return "60-69";
      return "under-60";
    }).map((group) => summarize(group.key, group.value)),
    byRiskFlag: groupBy(
      evaluated.flatMap((item) => (item.riskFlags.length ? item.riskFlags.map((flag) => ({ ...item, flag })) : [{ ...item, flag: "none" }])),
      (item) => item.flag
    ).map((group) => summarize(group.key, group.value)),
    highestScoreInvalidations: topBad
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
