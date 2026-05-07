// 차트 판독 전체 데이터를 받아 AI 종합 피드백을 생성하는 API 라우트
import { NextResponse } from "next/server";
import { AIProviderError, getAIProvider, type MarketBriefingInput } from "@/lib/ai";
import { generateFallbackMarketBriefing } from "@/lib/ai/fallback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { text: string; expiresAt: number }>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isValidInput(value: unknown): value is MarketBriefingInput {
  if (!isRecord(value)) return false;
  if (!isRecord(value.active)) return false;
  if (!Array.isArray(value.timeframes)) return false;
  if (!Array.isArray(value.reasons)) return false;

  return (
    typeof value.symbol === "string" &&
    typeof value.activeTimeframe === "string" &&
    typeof value.tradingMode === "string" &&
    typeof value.price === "number" &&
    typeof value.verdict === "string" &&
    typeof value.bias === "string" &&
    typeof value.biasScore === "number" &&
    typeof value.scoreRange === "string" &&
    typeof value.readiness === "string" &&
    typeof value.summaryLine === "string" &&
    typeof value.actionGuide === "string" &&
    typeof value.currentLocationLabel === "string" &&
    typeof value.killzone === "string" &&
    isStringArray(value.opportunityFlags) &&
    isStringArray(value.riskFlags) &&
    value.timeframes.every((item) => isRecord(item) && typeof item.timeframe === "string")
  );
}

function cacheKey(input: MarketBriefingInput) {
  return [
    input.symbol,
    input.activeTimeframe,
    input.tradingMode,
    Math.round(input.price * 100) / 100,
    input.bias,
    input.biasScore,
    input.active.msb,
    input.active.choch,
    input.active.ob,
    input.active.fvg,
    input.active.poc,
    input.active.pd
  ].join("|");
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "유효한 JSON 본문이 필요합니다." }, { status: 400 });
  }

  if (!isValidInput(body)) {
    return NextResponse.json({ error: "AI 종합 피드백 입력값이 부족합니다." }, { status: 400 });
  }

  const input = body as MarketBriefingInput;
  const key = cacheKey(input);
  const now = Date.now();
  const hit = cache.get(key);

  if (hit && hit.expiresAt > now) {
    return NextResponse.json({ briefing: hit.text, model: "cache", cached: true });
  }

  try {
    const provider = getAIProvider();
    const text = await provider.generateMarketBriefing(input);
    cache.set(key, { text, expiresAt: now + CACHE_TTL_MS });
    return NextResponse.json({ briefing: text, model: provider.model, cached: false });
  } catch (error) {
    if (error instanceof AIProviderError) {
      console.warn(`[ai/market-briefing] ${error.provider} 실패, 폴백 사용.`, error.message);
    } else {
      console.warn("[ai/market-briefing] Provider 없음 또는 알 수 없는 오류, 폴백 사용.", error);
    }

    const fallback = generateFallbackMarketBriefing(input);
    cache.set(key, { text: fallback, expiresAt: now + CACHE_TTL_MS });
    return NextResponse.json({ briefing: fallback, model: "fallback", cached: false });
  }
}
