"use client";
// 레이더뉴스 목록과 사용자가 붙여넣은 뉴스 문장의 시장 영향 해석을 보여준다.
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ExternalLink, Newspaper, Radar, RefreshCcw, ScanSearch, Sparkles } from "lucide-react";
import { analyzeNewsText, type RadarNewsDirection, type RadarNewsItem, type RadarNewsSignal } from "@/lib/radarNews";

type NewsPayload = {
  updatedAt: number;
  items: RadarNewsItem[];
  failedSources: string[];
  cached: boolean;
  error?: string;
};

function directionStyle(direction: RadarNewsDirection) {
  if (direction === "bullish") {
    return {
      label: "상방 우호",
      text: "text-signal-success",
      bg: "border-signal-success/25 bg-signal-success/10",
      bar: "bg-signal-success"
    };
  }
  if (direction === "bearish") {
    return {
      label: "하방 주의",
      text: "text-signal-danger",
      bg: "border-signal-danger/25 bg-signal-danger/10",
      bar: "bg-signal-danger"
    };
  }
  return {
    label: "중립 확인",
    text: "text-signal-warning",
    bg: "border-signal-warning/25 bg-signal-warning/10",
    bar: "bg-signal-warning"
  };
}

function timeLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "시간 미확인";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function NewsSignalCard({
  signal,
  title,
  source,
  publishedAt,
  link
}: {
  signal: RadarNewsSignal;
  title: string;
  source?: string;
  publishedAt?: string;
  link?: string;
}) {
  const style = directionStyle(signal.direction);

  return (
    <article className={`rounded-lg border p-4 ${style.bg}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
            {source ? <span className="rounded-md border border-white/10 bg-black/20 px-2 py-1 text-slate-300">{source}</span> : null}
            {publishedAt ? <span className="text-slate-500">{timeLabel(publishedAt)}</span> : null}
            <span className={`rounded-md border px-2 py-1 ${style.bg} ${style.text}`}>{style.label}</span>
            <span className="rounded-md border border-white/10 bg-black/20 px-2 py-1 text-slate-400">
              {signal.urgency === "high" ? "중요" : signal.urgency === "medium" ? "확인" : "참고"}
            </span>
          </div>
          <h3 className="mt-3 text-base font-black leading-6 text-white">{title}</h3>
        </div>
        <div className="shrink-0 text-right">
          <p className={`text-2xl font-black ${style.text}`}>{signal.score}</p>
          <p className="text-[10px] font-bold text-slate-500">영향점수</p>
        </div>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
        <div className={`h-full rounded-full ${style.bar}`} style={{ width: `${signal.score}%` }} />
      </div>

      <p className={`mt-3 text-sm font-black ${style.text}`}>{signal.headline}</p>
      <p className="mt-2 text-sm leading-6 text-slate-300">{signal.summary}</p>
      <p className="mt-2 text-xs leading-5 text-slate-400">{signal.actionHint}</p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {signal.assets.map((asset) => (
          <span key={asset} className="rounded-md border border-accent-blue/20 bg-accent-blue/10 px-2 py-1 text-[11px] font-black text-accent-blue">
            {asset}
          </span>
        ))}
        {signal.tags.map((tag) => (
          <span key={tag} className="rounded-md border border-white/10 bg-black/20 px-2 py-1 text-[11px] font-bold text-slate-300">
            {tag}
          </span>
        ))}
      </div>

      {link ? (
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex items-center gap-1.5 text-xs font-black text-accent-blue hover:text-sky-300"
        >
          원문 링크 열기
          <ExternalLink size={13} aria-hidden />
        </a>
      ) : null}
    </article>
  );
}

export function RadarNewsPanel() {
  const [payload, setPayload] = useState<NewsPayload | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState("");
  const [manualText, setManualText] = useState("");
  const [manualSignal, setManualSignal] = useState<RadarNewsSignal | null>(null);

  async function loadNews() {
    setStatus("loading");
    setError("");
    try {
      const response = await fetch("/api/radar-news", { cache: "no-store" });
      const data = (await response.json()) as NewsPayload;
      if (!response.ok) throw new Error(data.error ?? "뉴스 레이더를 불러오지 못했습니다.");
      setPayload(data);
      setStatus("ready");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "뉴스 레이더를 불러오지 못했습니다.");
      setStatus("error");
    }
  }

  useEffect(() => {
    void loadNews();
  }, []);

  const digest = useMemo(() => {
    const items = payload?.items ?? [];
    return {
      bullish: items.filter((item) => item.direction === "bullish").length,
      bearish: items.filter((item) => item.direction === "bearish").length,
      high: items.filter((item) => item.urgency === "high").length
    };
  }, [payload]);

  function analyzeManualNews() {
    const clean = manualText.trim();
    if (!clean) return;
    setManualSignal(analyzeNewsText(clean));
  }

  return (
    <section className="space-y-5">
      <div className="rounded-lg border border-accent-blue/25 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.18),rgba(15,23,42,0.94)_42%,rgba(2,6,23,0.96))] p-4 shadow-glow sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="radar-mark grid h-11 w-11 shrink-0 place-items-center border border-accent-blue/35 text-accent-blue">
              <Newspaper size={21} aria-hidden />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-accent-blue">Radar News</p>
              <h2 className="mt-1 text-xl font-black text-white">레이더뉴스</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                공개 RSS의 제목과 원문 링크만 가져오고, 본문은 재게시하지 않습니다. 차트 레이더는 뉴스가 시장 심리에 어떤 쪽 압력을 줄 수 있는지만 따로 해석합니다.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={loadNews}
            disabled={status === "loading"}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-accent-blue/30 bg-accent-blue/10 px-3 text-sm font-black text-accent-blue hover:bg-accent-blue/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCcw className={status === "loading" ? "animate-spin" : ""} size={16} aria-hidden />
            새로고침
          </button>
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg border border-signal-success/20 bg-signal-success/10 p-3">
            <p className="text-2xl font-black text-signal-success">{digest.bullish}</p>
            <p className="text-xs font-bold text-slate-400">상방 우호 뉴스</p>
          </div>
          <div className="rounded-lg border border-signal-danger/20 bg-signal-danger/10 p-3">
            <p className="text-2xl font-black text-signal-danger">{digest.bearish}</p>
            <p className="text-xs font-bold text-slate-400">하방 주의 뉴스</p>
          </div>
          <div className="rounded-lg border border-signal-warning/20 bg-signal-warning/10 p-3">
            <p className="text-2xl font-black text-signal-warning">{digest.high}</p>
            <p className="text-xs font-bold text-slate-400">중요 확인 이슈</p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-surface-line bg-surface-card p-4 shadow-glow sm:p-5">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-accent-blue/25 bg-accent-blue/10 text-accent-blue">
            <ScanSearch size={20} aria-hidden />
          </div>
          <div>
            <h3 className="text-lg font-black text-white">뉴스 붙여넣기 레이더</h3>
            <p className="mt-1 text-sm leading-6 text-slate-400">
              코인니스, 텔레그램, 거래소 공지처럼 자동 수집하기 애매한 글은 여기에 붙여넣고 시장 영향만 빠르게 확인하세요.
            </p>
          </div>
        </div>
        <textarea
          value={manualText}
          onChange={(event) => setManualText(event.target.value)}
          rows={4}
          placeholder="예: SEC가 이더리움 ETF 관련 결정을 연기했다..."
          className="mt-4 w-full resize-none rounded-lg border border-surface-line bg-surface-cardSoft px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-slate-600 focus:border-accent-blue"
        />
        <button
          type="button"
          onClick={analyzeManualNews}
          className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-accent-blue px-4 text-sm font-black text-slate-950 hover:bg-sky-300 sm:w-auto"
        >
          <Sparkles size={16} aria-hidden />
          붙여넣은 뉴스 분석
        </button>
        {manualSignal ? (
          <div className="mt-4">
            <NewsSignalCard signal={manualSignal} title={manualText.trim().slice(0, 120)} />
          </div>
        ) : null}
      </div>

      {status === "error" ? (
        <div className="rounded-lg border border-signal-danger/25 bg-signal-danger/10 p-4 text-sm leading-6 text-signal-danger">
          <div className="flex items-center gap-2 font-black">
            <AlertTriangle size={17} aria-hidden />
            {error}
          </div>
        </div>
      ) : null}

      {status === "loading" && !payload ? (
        <div className="rounded-lg border border-surface-line bg-surface-card p-6 text-center">
          <Radar className="mx-auto animate-spin text-accent-blue" size={32} aria-hidden />
          <p className="mt-3 text-sm font-black text-white">뉴스 레이더 스캔 중입니다.</p>
          <p className="mt-1 text-xs text-slate-500">원문 링크와 제목만 확인하고 있습니다.</p>
        </div>
      ) : null}

      {payload?.failedSources.length ? (
        <div className="rounded-lg border border-signal-warning/20 bg-signal-warning/10 p-3 text-xs leading-5 text-signal-warning">
          일부 소스 연결이 지연됐습니다. 실패 소스는 {payload.failedSources.join(", ")}입니다.
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        {(payload?.items ?? []).map((item) => (
          <NewsSignalCard
            key={item.id}
            signal={item}
            title={item.title}
            source={item.source}
            publishedAt={item.publishedAt}
            link={item.link}
          />
        ))}
      </div>

      <div className="rounded-lg border border-white/10 bg-black/20 p-4 text-xs leading-5 text-slate-500">
        레이더뉴스는 투자 조언이나 매수·매도 신호가 아닙니다. 뉴스 제목 기반의 1차 분류이므로 원문과 차트 반응을 반드시 함께 확인하세요.
      </div>
    </section>
  );
}
