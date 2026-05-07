/**
 * 관심 코인 (Watchlist) — 로컬 스토리지 기반 관리.
 *
 * 플랜별 최대 종목:
 *  - free / 비로그인 : 0개 (UI에서 멤버십 안내)
 *  - member         : 5개
 *  - premium / admin: 10개
 */

import { watchlistSymbolPool } from "./setupScout";

export type WatchlistPlan = "free" | "member" | "premium" | "admin";

export const WATCHLIST_LIMIT: Record<WatchlistPlan, number> = {
  free: 0,
  member: 5,
  premium: 10,
  admin: 10
};

const STORAGE_KEY = "untitledRisk.watchlist.v1";
const LEGACY_STORAGE_KEY = "coters.watchlist.v1";

/** 저장된 관심 코인 목록 반환. 유효하지 않은 심볼은 자동 제거. */
export function getWatchlist(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return [];
    window.localStorage.setItem(STORAGE_KEY, raw);
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    // watchlistSymbolPool에 속하는 항목만 유지
    const valid = (parsed as string[]).filter((s) =>
      (watchlistSymbolPool as readonly string[]).includes(s)
    );
    return valid;
  } catch {
    return [];
  }
}

function saveWatchlist(list: string[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // 용량 초과 등 무시
  }
}

/** 관심 코인 추가. plan 한도를 초과하면 false 반환. */
export function addToWatchlist(symbol: string, plan: WatchlistPlan): boolean {
  const current = getWatchlist();
  if (current.includes(symbol)) return true; // 이미 있음
  const limit = WATCHLIST_LIMIT[plan];
  if (current.length >= limit) return false; // 한도 초과
  saveWatchlist([...current, symbol]);
  return true;
}

/** 관심 코인 제거. */
export function removeFromWatchlist(symbol: string) {
  const current = getWatchlist();
  saveWatchlist(current.filter((s) => s !== symbol));
}

/** 심볼에서 코인 이름만 추출. "ADAUSDT.P" → "ADA" */
export function symbolToName(symbol: string): string {
  return symbol.replace("USDT.P", "").replace("USDT", "");
}
