// 공개 RSS 뉴스 제목을 수집해 레이더뉴스 카드 데이터로 변환하는 API.
import { NextResponse } from "next/server";
import { XMLParser } from "fast-xml-parser";
import { createRadarNewsItem, type RadarNewsItem } from "@/lib/radarNews";
import { rateLimit } from "@/lib/server/rateLimit";

export const runtime = "nodejs";

const FEEDS = [
  {
    source: "CoinDesk",
    url: "https://www.coindesk.com/arc/outboundfeeds/rss/"
  },
  {
    source: "Cointelegraph",
    url: "https://cointelegraph.com/rss"
  }
] as const;

const CACHE_MS = 5 * 60 * 1000;

let cache:
  | {
      updatedAt: number;
      items: RadarNewsItem[];
      failedSources: string[];
    }
  | null = null;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  textNodeName: "text"
});
const translationCache = new Map<string, string>();

function asArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function cleanText(value: unknown) {
  if (typeof value !== "string") return "";
  return value
    .replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pickText(value: unknown): string {
  if (typeof value === "string") return cleanText(value);
  if (value && typeof value === "object" && "text" in value) {
    return cleanText((value as { text?: unknown }).text);
  }
  return "";
}

function normalizeLink(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const link = value as { href?: unknown; text?: unknown };
    if (typeof link.href === "string") return link.href;
    if (typeof link.text === "string") return link.text;
  }
  return "";
}

function toIsoDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function hasKorean(value: string) {
  return /[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(value);
}

function localTranslateTitle(title: string) {
  return title
    .replace(/\bBitcoin\b/gi, "비트코인")
    .replace(/\bBTC\b/g, "BTC")
    .replace(/\bEthereum\b/gi, "이더리움")
    .replace(/\bETH\b/g, "ETH")
    .replace(/\bSolana\b/gi, "솔라나")
    .replace(/\bXRP\b/g, "XRP")
    .replace(/\bETF\b/g, "ETF")
    .replace(/\bSEC\b/g, "SEC")
    .replace(/\bFed\b/g, "연준")
    .replace(/\binflows?\b/gi, "자금 유입")
    .replace(/\boutflows?\b/gi, "자금 유출")
    .replace(/\brally\b/gi, "랠리")
    .replace(/\bsurge\b/gi, "급등")
    .replace(/\bplunge\b/gi, "급락")
    .replace(/\bhack\b/gi, "해킹")
    .replace(/\bapproval\b/gi, "승인")
    .replace(/\blawsuit\b/gi, "소송")
    .trim();
}

async function translateTitleToKorean(title: string) {
  if (hasKorean(title)) return title;
  const cached = translationCache.get(title);
  if (cached) return cached;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    let response: Response;
    try {
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(title)}&langpair=en|ko`;
      response = await fetch(url, { signal: controller.signal, next: { revalidate: 3600 } });
    } finally {
      clearTimeout(timer);
    }

    if (response.ok) {
      const payload = (await response.json()) as { responseData?: { translatedText?: string } };
      const translated = payload.responseData?.translatedText?.replace(/\s+/g, " ").trim();
      if (translated && translated.toLowerCase() !== title.toLowerCase()) {
        translationCache.set(title, translated);
        return translated;
      }
    }
  } catch {
    // 무료 번역 API가 지연되면 아래의 로컬 용어 치환으로 대체한다.
  }

  const fallback = localTranslateTitle(title);
  translationCache.set(title, fallback);
  return fallback;
}

async function loadFeed(feed: (typeof FEEDS)[number]) {
  const response = await fetch(feed.url, {
    headers: {
      "user-agent": "ChartRadarBot/0.1 (+https://chartradar.local)"
    },
    next: { revalidate: 300 }
  });

  if (!response.ok) {
    throw new Error(`${feed.source} RSS ${response.status}`);
  }

  const xml = await response.text();
  const parsed = parser.parse(xml);
  const rssItems = asArray(parsed?.rss?.channel?.item);
  const atomItems = asArray(parsed?.feed?.entry);
  const entries = rssItems.length ? rssItems : atomItems;

  const pickedEntries = entries.slice(0, 12);
  const items = await Promise.all(
    pickedEntries.map(async (entry) => {
      const title = pickText(entry?.title);
      const link = normalizeLink(entry?.link) || pickText(entry?.guid);
      const publishedAt =
        pickText(entry?.pubDate) ||
        pickText(entry?.published) ||
        pickText(entry?.updated) ||
        new Date().toISOString();

      if (!title || !link) return null;

      const translatedTitle = await translateTitleToKorean(title);

      return createRadarNewsItem({
        source: feed.source,
        title,
        translatedTitle,
        link,
        publishedAt: toIsoDate(publishedAt)
      });
    })
  );

  return items.filter((item): item is RadarNewsItem => Boolean(item));
}

export async function GET(request: Request) {
  const limited = rateLimit(request, {
    key: "radar-news",
    limit: 60,
    windowMs: 60_000
  });

  if (!limited.allowed) {
    return NextResponse.json(
      { error: "뉴스 레이더 요청이 잠시 많습니다.", retryAfter: limited.retryAfter },
      { status: 429 }
    );
  }

  const now = Date.now();
  if (cache && now - cache.updatedAt < CACHE_MS) {
    return NextResponse.json({ ...cache, cached: true });
  }

  const settled = await Promise.allSettled(FEEDS.map((feed) => loadFeed(feed)));
  const failedSources = settled
    .map((result, index) => (result.status === "rejected" ? FEEDS[index].source : null))
    .filter((source): source is (typeof FEEDS)[number]["source"] => Boolean(source));

  const deduped = new Map<string, RadarNewsItem>();
  for (const result of settled) {
    if (result.status !== "fulfilled") continue;
    for (const item of result.value) {
      const key = item.link || item.title;
      if (!deduped.has(key)) deduped.set(key, item);
    }
  }

  const items = Array.from(deduped.values())
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, 24);

  cache = {
    updatedAt: now,
    items,
    failedSources
  };

  return NextResponse.json({ ...cache, cached: false });
}
