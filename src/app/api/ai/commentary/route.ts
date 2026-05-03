/**
 * POST /api/ai/commentary
 *
 * Setup Scout 카드 1장에 대한 AI 한 줄 코멘트 생성.
 * - 키는 절대 클라이언트로 노출하지 않음 (서버에서만 사용).
 * - 동일 입력 5분간 메모리 캐시 (rate limit 보호 + 응답 속도).
 * - 입력 검증 후 GeminiProvider에 위임.
 *
 * 클라이언트는 단순 fetch:
 *   const r = await fetch("/api/ai/commentary", { method: "POST", body: JSON.stringify(input) });
 *   const { commentary } = await r.json();
 */

import { NextResponse } from "next/server";
import { getAIProvider, AIProviderError, type CommentaryInput } from "@/lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { text: string; expiresAt: number }>();

function cacheKey(input: CommentaryInput): string {
  // 가격은 소수점 둘째자리까지만 반영 (잔변동으로 캐시 키 폭발 방지)
  const r = (n: number) => Math.round(n * 100) / 100;
  return [
    input.symbol,
    input.timeframe,
    input.side,
    input.score,
    r(input.currentPrice),
    r(input.entryLow),
    r(input.entryHigh),
    input.proximity,
    input.context.killzone,
    input.context.quality,
    input.context.inOte ? "1" : "0",
    input.context.inOb ? "1" : "0",
    input.context.inFvg ? "1" : "0"
  ].join("|");
}

function isValidInput(value: unknown): value is CommentaryInput {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.symbol === "string" &&
    typeof v.timeframe === "string" &&
    typeof v.side === "string" &&
    typeof v.score === "number" &&
    typeof v.currentPrice === "number" &&
    typeof v.entryLow === "number" &&
    typeof v.entryHigh === "number" &&
    typeof v.invalidation === "number" &&
    typeof v.target1 === "number" &&
    typeof v.target2 === "number" &&
    typeof v.proximity === "string" &&
    typeof v.distancePercent === "number" &&
    typeof v.context === "object" &&
    v.context !== null
  );
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "유효한 JSON 본문이 필요합니다." }, { status: 400 });
  }

  if (!isValidInput(body)) {
    return NextResponse.json({ error: "필수 필드가 누락되었습니다." }, { status: 400 });
  }

  const input = body as CommentaryInput;
  const key = cacheKey(input);
  const now = Date.now();

  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) {
    return NextResponse.json({ commentary: hit.text, model: "cache", cached: true });
  }

  let provider;
  try {
    provider = getAIProvider();
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI Provider 초기화 실패";
    return NextResponse.json({ error: message }, { status: 503 });
  }

  try {
    const text = await provider.generateCommentary(input);
    cache.set(key, { text, expiresAt: now + CACHE_TTL_MS });
    return NextResponse.json({ commentary: text, model: provider.model, cached: false });
  } catch (error) {
    if (error instanceof AIProviderError) {
      console.error(`[ai/commentary] ${error.provider} 실패:`, error.message);
      return NextResponse.json(
        { error: "AI 코멘트 생성에 실패했습니다.", detail: error.message },
        { status: 502 }
      );
    }
    console.error("[ai/commentary] 알 수 없는 오류:", error);
    return NextResponse.json({ error: "AI 코멘트 생성에 실패했습니다." }, { status: 500 });
  }
}
