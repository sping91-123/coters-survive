/**
 * GET /api/scout
 *
 * 서버 사이드 Setup Scout — 5분 인메모리 캐시.
 * - 클라이언트가 Binance에 직접 요청하지 않고 여기서 한 번만 집계
 * - 키 없음 / 인증 없음 (결과는 plan-gating을 SetupScoutPanel이 처리)
 * - rate limit: 5분 캐시로 자연스럽게 방어
 */

import { NextResponse } from "next/server";
import { scanAllSetups, topSetups, type ScoutRiskProfile, type ScoutSetup } from "@/lib/setupScout";
import { rateLimit } from "@/lib/server/rateLimit";
import type { TradingMode } from "@/lib/marketAnalysis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 5 * 60 * 1000; // 5분

interface ServerCache {
  setups: ScoutSetup[];
  cachedAt: number;
}

const cacheByKey = new Map<string, ServerCache>();
const inflightByKey = new Map<string, Promise<ScoutSetup[]>>();

function parseMode(request: Request): TradingMode {
  const raw = new URL(request.url).searchParams.get("mode");
  return raw === "swing" ? "swing" : "scalp";
}

function parseRiskProfile(request: Request): ScoutRiskProfile {
  const raw = new URL(request.url).searchParams.get("risk");
  return raw === "radar" ? "radar" : "guard";
}

export async function GET(request: Request) {
  const limit = rateLimit(request, { key: "scout", limit: 20, windowMs: 5 * 60 * 1000 });
  if (!limit.allowed) {
    return NextResponse.json(
        { error: "레이더 요청이 너무 많습니다. 잠시 후 다시 시도하세요." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  const mode = parseMode(request);
  const riskProfile = parseRiskProfile(request);
  const cacheKey = `${mode}:${riskProfile}`;
  const now = Date.now();
  const cache = cacheByKey.get(cacheKey) ?? null;

  // 유효한 캐시가 있으면 즉시 반환
  if (cache && now - cache.cachedAt < CACHE_TTL_MS) {
    return NextResponse.json({
      setups: cache.setups,
      cachedAt: cache.cachedAt,
      cached: true
    });
  }

  // 동시 요청 중 inflight가 있으면 재사용 (thundering-herd 방지)
  if (!inflightByKey.has(cacheKey)) {
    const promise = scanAllSetups({ mode, riskProfile })
      .then((all) => {
        const top = topSetups(all, riskProfile === "radar" ? 6 : 3);
        cacheByKey.set(cacheKey, { setups: top, cachedAt: Date.now() });
        return top;
      })
      .finally(() => {
        inflightByKey.delete(cacheKey);
      });
    inflightByKey.set(cacheKey, promise);
  }

  try {
    const setups = await inflightByKey.get(cacheKey)!;
    return NextResponse.json({
      setups,
      cachedAt: cacheByKey.get(cacheKey)?.cachedAt ?? Date.now(),
      cached: false
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "레이더 판독에 실패했습니다.";
    console.error("[api/scout] 레이더 오류:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
