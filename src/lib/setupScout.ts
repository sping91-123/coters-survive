import {
  analyzeTimeframe,
  fetchBinanceCandles,
  summarizeMarket,
  type Candle,
  type ChartTimeframe,
  type MarketAnalysis,
  type TimeframeAnalysis,
  type TradePlanCandidate
} from "./marketAnalysis";

export const scoutSymbols = ["BTCUSDT.P", "ETHUSDT.P", "SOLUSDT.P", "XRPUSDT.P", "DOGEUSDT.P"] as const;
export type ScoutSymbol = (typeof scoutSymbols)[number];

// 스윙/데이트레이딩 핵심 TF만 기본 스캔 — 5m/1d는 노이즈/속도 균형상 제외
export const scoutTimeframes: ChartTimeframe[] = ["15m", "1h", "4h"];
export const scoutHigherTimeframes: ChartTimeframe[] = ["4h", "1d"];

export interface ScoutSetup {
  symbol: ScoutSymbol;
  timeframe: ChartTimeframe;
  analysis: MarketAnalysis;
  plan: TradePlanCandidate;
  /** 0~100 정수. PRO 플랜 confidence 기반 + 정합성 가산 */
  score: number;
  /** 사용자에게 보여줄 짧은 헤드라인 (룰 기반, AI 코멘트는 추후 덧붙임) */
  headline: string;
  scannedAt: string;
}

interface ScannerOptions {
  /** 스캔할 종목. 기본 전체 5개 */
  symbols?: readonly ScoutSymbol[];
  /** 활성 TF (TOP 3에 후보로 들어갈 TF). 기본 15m, 1h, 4h */
  timeframes?: ChartTimeframe[];
  /** 분석에 함께 사용할 상위 TF. 기본 4h, 1d */
  higherTimeframes?: ChartTimeframe[];
  /** 캔들 개수. 기본 320 */
  limit?: number;
}

/**
 * 한 (symbol, activeTF) 조합을 스캔.
 * 활성 TF + 상위 TF 정합성을 모두 본 다음 PRO 플랜 후보가 있으면 ScoutSetup으로 반환.
 */
async function scanCombo(
  symbol: ScoutSymbol,
  activeTimeframe: ChartTimeframe,
  higherTimeframes: ChartTimeframe[],
  limit: number
): Promise<ScoutSetup | null> {
  const targetTimeframes = Array.from(new Set<ChartTimeframe>([activeTimeframe, ...higherTimeframes]));

  // 모든 TF 캔들을 동시에 가져옴
  const candleResults = await Promise.all(
    targetTimeframes.map((tf) => fetchBinanceCandles(symbol, tf, limit))
  );
  const candleByTf = new Map<ChartTimeframe, Candle[]>();
  targetTimeframes.forEach((tf, idx) => candleByTf.set(tf, candleResults[idx]));

  const activeCandles = candleByTf.get(activeTimeframe);
  if (!activeCandles || activeCandles.length === 0) return null;

  const oteAnchorCandles = candleByTf.get("4h") ?? candleByTf.get("1d") ?? activeCandles;

  const analyses: TimeframeAnalysis[] = targetTimeframes.map((tf) =>
    analyzeTimeframe(tf, candleByTf.get(tf)!, { oteAnchorCandles })
  );

  const lastCandle = activeCandles[activeCandles.length - 1];
  const market = summarizeMarket(symbol, activeTimeframe, analyses, lastCandle.close);
  if (!market.proPlan) return null;

  const score = computeScoutScore(market, analyses);
  const headline = buildHeadline(symbol, activeTimeframe, market);

  return {
    symbol,
    timeframe: activeTimeframe,
    analysis: market,
    plan: market.proPlan,
    score,
    headline,
    scannedAt: market.updatedAt
  };
}

/**
 * Scout Score (0~100). 룰 베이스. AI 코멘트는 별도.
 *
 * 구성:
 * - PRO 플랜 confidence (35~92)         : 그대로 베이스
 * - 상위 TF 추세 정합성 가산              : +0~6
 * - readiness 보정                      : ±0~5
 * - riskFlags 패널티                    : -0~10
 * - 활성 TF가 OTE 영역인지 가산           : +0~4
 *
 * 최종 0~100 클램프.
 */
function computeScoutScore(market: MarketAnalysis, analyses: TimeframeAnalysis[]): number {
  const plan = market.proPlan!;
  const direction = plan.side === "long" ? "bullish" : "bearish";

  let score = plan.confidence;

  // 상위 TF 정합성 가산
  const higherAligned = analyses
    .filter((a) => a.timeframe === "4h" || a.timeframe === "1d")
    .filter((a) => a.msb === direction).length;
  score += higherAligned * 3;

  // readiness 보정
  if (market.readiness === "high") score += 4;
  else if (market.readiness === "low") score -= 4;

  // 위험 신호 패널티
  score -= Math.min(market.riskFlags.length * 2, 10);

  // 활성 TF OTE 영역 가산
  const active = analyses.find((a) => a.timeframe === market.activeTimeframe);
  if (active?.oteZone === plan.side) score += 4;

  return Math.round(Math.max(0, Math.min(100, score)));
}

/** 사용자가 1초 내 이해할 수 있는 한 줄. 30~50자. */
function buildHeadline(symbol: ScoutSymbol, tf: ChartTimeframe, market: MarketAnalysis): string {
  const sym = symbol.replace("USDT.P", "");
  const sideLabel = market.proPlan!.side === "long" ? "롱" : "숏";
  const qualityLabel =
    market.proPlan!.quality === "A" ? "A급" : market.proPlan!.quality === "B" ? "B급" : "C급";
  const zoneLabel = market.proPlan!.entryLabel;
  return `${sym} ${tf} — ${sideLabel} ${qualityLabel} · ${zoneLabel}`;
}

/**
 * 모든 (symbol × activeTF) 조합을 스캔해서 점수 순으로 정렬.
 * 실패한 조합은 무시. 네트워크 오류는 throw.
 */
export async function scanAllSetups(options: ScannerOptions = {}): Promise<ScoutSetup[]> {
  const symbols = options.symbols ?? scoutSymbols;
  const timeframes = options.timeframes ?? scoutTimeframes;
  const higherTimeframes = options.higherTimeframes ?? scoutHigherTimeframes;
  const limit = options.limit ?? 320;

  const tasks: Promise<ScoutSetup | null>[] = [];
  for (const symbol of symbols) {
    for (const tf of timeframes) {
      tasks.push(
        scanCombo(symbol, tf, higherTimeframes, limit).catch((error) => {
          console.warn(`[setupScout] ${symbol} ${tf} 스캔 실패`, error);
          return null;
        })
      );
    }
  }

  const settled = await Promise.all(tasks);
  return settled
    .filter((item): item is ScoutSetup => item !== null)
    .sort((a, b) => b.score - a.score);
}

/** TOP N개만 추출 (기본 3) */
export function topSetups(setups: ScoutSetup[], n = 3): ScoutSetup[] {
  return setups.slice(0, n);
}

/** 무료 티어 일일 제한용. localStorage 저장 키. */
export const scoutCacheKey = "positionguard.setupScout.v1";
export const scoutCacheTtlMs = 5 * 60 * 1000; // 5분

interface ScoutCacheEntry {
  setups: ScoutSetup[];
  cachedAt: number;
}

export function readScoutCache(): ScoutCacheEntry | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(scoutCacheKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ScoutCacheEntry;
    if (Date.now() - parsed.cachedAt > scoutCacheTtlMs) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeScoutCache(setups: ScoutSetup[]) {
  if (typeof window === "undefined") return;
  try {
    const entry: ScoutCacheEntry = { setups, cachedAt: Date.now() };
    window.localStorage.setItem(scoutCacheKey, JSON.stringify(entry));
  } catch {
    // 용량 초과 등은 무시
  }
}
