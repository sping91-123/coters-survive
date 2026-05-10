"use client";
// 해외주식 주요 종목을 차트와 기술지표 레이더로 보여주는 베타 화면.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CandlestickSeries, createChart, type IChartApi, type ISeriesApi, type Time } from "lightweight-charts";
import { Loader2, RefreshCw, TrendingUp } from "lucide-react";
import { TechnicalRadarPanel } from "@/components/TechnicalRadarPanel";
import { chartTimeframes, type Candle, type ChartTimeframe } from "@/lib/marketAnalysis";

interface StockSymbolInfo {
  symbol: string;
  name: string;
  group: "index_etf" | "mega_cap" | "growth" | "commodity";
}

const fallbackUniverse: StockSymbolInfo[] = [
  { symbol: "SPY", name: "S&P 500 ETF", group: "index_etf" },
  { symbol: "QQQ", name: "Nasdaq 100 ETF", group: "index_etf" },
  { symbol: "NVDA", name: "Nvidia", group: "mega_cap" },
  { symbol: "AAPL", name: "Apple", group: "mega_cap" },
  { symbol: "TSLA", name: "Tesla", group: "growth" },
  { symbol: "GLD", name: "Gold ETF", group: "commodity" }
];

const groupLabels: Record<StockSymbolInfo["group"], string> = {
  index_etf: "지수 ETF",
  mega_cap: "빅테크",
  growth: "성장주",
  commodity: "원자재 ETF"
};

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; candles: Candle[]; dataSource: string; cachedAt: number }
  | { status: "error"; message: string };

function formatPrice(value: number) {
  return value.toLocaleString("ko-KR", { maximumFractionDigits: value >= 100 ? 2 : 4 });
}

function symbolName(symbol: string, universe: StockSymbolInfo[]) {
  const found = universe.find((item) => item.symbol === symbol);
  return found ? found.name : symbol;
}

export function StockRadarApp() {
  const chartRef = useRef<HTMLDivElement | null>(null);
  const chartApiRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const [symbol, setSymbol] = useState("QQQ");
  const [timeframe, setTimeframe] = useState<ChartTimeframe>("1d");
  const [universe, setUniverse] = useState<StockSymbolInfo[]>(fallbackUniverse);
  const [state, setState] = useState<LoadState>({ status: "idle" });

  const groupedUniverse = useMemo(() => {
    return universe.reduce<Record<StockSymbolInfo["group"], StockSymbolInfo[]>>(
      (groups, item) => {
        groups[item.group].push(item);
        return groups;
      },
      { index_etf: [], mega_cap: [], growth: [], commodity: [] }
    );
  }, [universe]);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const response = await fetch(`/api/stocks/candles?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}`, {
        cache: "no-store"
      });
      const data = (await response.json().catch(() => ({}))) as {
        candles?: Candle[];
        dataSource?: string;
        cachedAt?: number;
        universe?: StockSymbolInfo[];
        error?: string;
      };

      if (Array.isArray(data.universe) && data.universe.length) setUniverse(data.universe);
      if (!response.ok) throw new Error(data.error ?? `서버 오류 (${response.status})`);
      if (!Array.isArray(data.candles) || data.candles.length === 0) throw new Error("캔들 데이터가 비어 있습니다.");

      setState({
        status: "ready",
        candles: data.candles,
        dataSource: data.dataSource ?? "해외주식 지연 데이터 베타",
        cachedAt: data.cachedAt ?? Date.now()
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "해외주식 데이터를 불러오지 못했습니다.";
      setState({ status: "error", message });
    }
  }, [symbol, timeframe]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!chartRef.current) return;

    const chart = createChart(chartRef.current, {
      height: 360,
      layout: {
        background: { color: "transparent" },
        textColor: "#cbd5e1"
      },
      grid: {
        vertLines: { color: "rgba(148,163,184,0.08)" },
        horzLines: { color: "rgba(148,163,184,0.08)" }
      },
      rightPriceScale: { borderColor: "rgba(148,163,184,0.18)" },
      timeScale: { borderColor: "rgba(148,163,184,0.18)", timeVisible: timeframe !== "1d" }
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444"
    });

    chartApiRef.current = chart;
    candleSeriesRef.current = series;

    const resizeObserver = new ResizeObserver(() => {
      if (!chartRef.current) return;
      chart.applyOptions({ width: chartRef.current.clientWidth });
    });
    resizeObserver.observe(chartRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartApiRef.current = null;
      candleSeriesRef.current = null;
    };
  }, [timeframe]);

  useEffect(() => {
    if (state.status !== "ready" || !candleSeriesRef.current || !chartApiRef.current) return;
    candleSeriesRef.current.setData(
      state.candles.map((candle) => ({
        time: candle.time as Time,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close
      }))
    );
    chartApiRef.current.timeScale().fitContent();
  }, [state]);

  const latest = state.status === "ready" ? state.candles[state.candles.length - 1] : null;
  const previous = state.status === "ready" ? state.candles[state.candles.length - 2] : null;
  const changePercent = latest && previous ? ((latest.close - previous.close) / previous.close) * 100 : null;

  return (
    <section className="rounded-lg border border-surface-line bg-surface-card p-4 shadow-glow sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-accent-blue/30 bg-accent-blue/15 text-accent-blue">
            <TrendingUp size={21} aria-hidden />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-accent-blue">Global Stocks Beta</p>
            <h2 className="mt-1 text-xl font-black text-white">해외주식 레이더</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              미국 주요 주식과 ETF를 기술지표 중심으로 먼저 확인합니다. 무료 베타 데이터라 실시간 매매 체결 기준으로 쓰기보다는 방향 점검용으로 보세요.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => load()}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-accent-blue/30 bg-accent-blue/10 px-3 text-xs font-black text-accent-blue transition hover:bg-accent-blue hover:text-slate-950"
        >
          <RefreshCw size={14} aria-hidden />
          새로고침
        </button>
      </div>

      <div className="mt-5 space-y-4">
        {Object.entries(groupedUniverse).map(([group, items]) => (
          items.length ? (
            <div key={group}>
              <p className="mb-2 text-xs font-black text-slate-500">{groupLabels[group as StockSymbolInfo["group"]]}</p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {items.map((item) => (
                  <button
                    key={item.symbol}
                    type="button"
                    onClick={() => setSymbol(item.symbol)}
                    className={`min-h-10 shrink-0 rounded-md border px-3 text-xs font-black transition ${
                      symbol === item.symbol
                        ? "border-accent-blue bg-accent-blue text-slate-950"
                        : "border-surface-line bg-surface-cardSoft text-slate-300 hover:border-accent-blue/60"
                    }`}
                  >
                    {item.symbol}
                  </button>
                ))}
              </div>
            </div>
          ) : null
        ))}
      </div>

      <div className="mt-5 grid grid-cols-5 gap-2">
        {chartTimeframes.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTimeframe(item)}
            className={`min-h-10 rounded-md border px-2 text-xs font-black transition ${
              timeframe === item
                ? "border-accent-blue bg-accent-blue text-slate-950"
                : "border-surface-line bg-surface-cardSoft text-slate-300 hover:border-accent-blue/60"
            }`}
          >
            {item}
          </button>
        ))}
      </div>

      <div className="mt-5 rounded-lg border border-surface-line bg-black/20 p-4">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500">선택 종목</p>
            <h3 className="mt-1 text-2xl font-black text-white">
              {symbol} <span className="text-base text-slate-500">{symbolName(symbol, universe)}</span>
            </h3>
          </div>
          {latest ? (
            <div className="text-left sm:text-right">
              <p className="text-xl font-black text-white">{formatPrice(latest.close)}</p>
              <p className={`text-xs font-bold ${changePercent !== null && changePercent >= 0 ? "text-signal-success" : "text-signal-danger"}`}>
                {changePercent === null ? "변동률 미확인" : `${changePercent >= 0 ? "+" : ""}${changePercent.toFixed(2)}%`}
              </p>
            </div>
          ) : null}
        </div>

        {state.status === "loading" ? (
          <div className="grid h-[360px] place-items-center rounded-md border border-white/10 bg-white/[0.02] text-sm text-slate-400">
            <span className="inline-flex items-center gap-2">
              <Loader2 className="animate-spin" size={16} aria-hidden />
              해외주식 데이터를 불러오는 중입니다.
            </span>
          </div>
        ) : state.status === "error" ? (
          <div className="rounded-md border border-signal-danger/30 bg-signal-danger/10 p-4 text-sm text-signal-danger">
            {state.message}
          </div>
        ) : (
          <div ref={chartRef} className="h-[360px] w-full" />
        )}
      </div>

      {state.status === "ready" ? (
        <>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            데이터 기준: {state.dataSource}. 미국 주식 실시간 거래소 데이터는 정식 데이터 계약 전까지 지연될 수 있습니다.
          </p>
          <div className="mt-5">
            <TechnicalRadarPanel candles={state.candles} timeframe={timeframe} />
          </div>
        </>
      ) : null}
    </section>
  );
}
