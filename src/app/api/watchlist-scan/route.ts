/**
 * POST /api/watchlist-scan
 *
 * 관심 코인 목록을 받아 레이더 판독 결과를 반환.
 * Body: { symbols: string[] }
 *
 * - 종목 수 최대 10개 (서버 부하 방지)
 * - 3분 인메모리 캐시 (정렬된 심볼 문자열 키)
 * - 인증 없음 — plan gating은 클라이언트가 처리
 */

import { NextRequest, NextResponse } from "next/server";
import { scanAllSetups, watchlistSymbolPool, type ScoutSetup } from "@/lib/setupScout";
import { isBodyTooLarge, rateLimit } from "@/lib/server/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 3 * 60 * 1000; // 3분
const MAX_SYMBOLS = 10;

interface CacheEntry {
  setups: ScoutSetup[];
  cachedAt: number;
}

// 심볼 조합별 캐시
const cacheMap = new Map<string, CacheEntry>();
const inflightMap = new Map<string, Promise<ScoutSetup[]>>();

function makeCacheKey(symbols: string[]): string {
  return [...symbols].sort().join(",");
}

export async function POST(req: NextRequest) {
  const limit = rateLimit(req, { key: "watchlist-scan", limit: 20, windowMs: 5 * 60 * 1000 });
  if (!limit.allowed) {
    return NextResponse.json(
        { error: "관심 코인 레이더 요청이 너무 많습니다. 잠시 후 다시 시도하세요." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  if (isBodyTooLarge(req, 12_000)) {
    return NextResponse.json({ error: "요청 본문이 너무 큽니다." }, { status: 413 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  if (typeof body !== "object" || body === null || !("symbols" in body)) {
    return NextResponse.json({ error: "symbols 필드가 필요합니다." }, { status: 400 });
  }

  const rawSymbols = (body as { symbols: unknown }).symbols;
  if (!Array.isArray(rawSymbols)) {
    return NextResponse.json({ error: "symbols는 배열이어야 합니다." }, { status: 400 });
  }

  // 유효한 Tier 2 심볼만 허용
  const validPool = watchlistSymbolPool as readonly string[];
  const symbols: string[] = (rawSymbols as unknown[])
    .filter((s): s is string => typeof s === "string" && validPool.includes(s))
    .slice(0, MAX_SYMBOLS);

  if (symbols.length === 0) {
    return NextResponse.json({ setups: [], cachedAt: Date.now(), cached: false });
  }

  const key = makeCacheKey(symbols);
  const now = Date.now();

  // 캐시 확인
  const cached = cacheMap.get(key);
  if (cached && now - cached.cachedAt < CACHE_TTL_MS) {
    return NextResponse.json({ setups: cached.setups, cachedAt: cached.cachedAt, cached: true });
  }

  // thundering-herd 방지
  let inflight = inflightMap.get(key);
  if (!inflight) {
    inflight = scanAllSetups({ symbols })
      .then((setups) => {
        cacheMap.set(key, { setups, cachedAt: Date.now() });
        return setups;
      })
      .finally(() => {
        inflightMap.delete(key);
      });
    inflightMap.set(key, inflight);
  }

  try {
    const setups = await inflight;
    const entry = cacheMap.get(key);
    return NextResponse.json({
      setups,
      cachedAt: entry?.cachedAt ?? Date.now(),
      cached: false
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "레이더 판독에 실패했습니다.";
    console.error("[api/watchlist-scan] 오류:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
