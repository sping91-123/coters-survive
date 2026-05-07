import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

type Side = "long" | "short";
type Mode = "scalp" | "swing";
type Regime = "bull" | "bear" | "range";
type Timeframe = "5m" | "15m" | "1h" | "4h" | "1d";
type Outcome = "target1" | "target2" | "invalidation" | "timeout" | "ambiguous" | "noEntry" | "invalidatedBeforeEntry";

interface Candidate {
  symbol: string;
  mode: Mode;
  status: "entry" | "watch";
  watchKind?: "aligned" | "counter";
  regime: Regime;
  timeframe: Timeframe;
  side: Side;
  score: number;
  confidence: number;
  proximity: "inside" | "near" | "wait" | "missed";
  riskFlags: string[];
  ctx: {
    premiumDiscount: string;
    pocPosition: string;
    inOb: boolean;
    inFvg: boolean;
    oteZone: string;
  };
  outcome: Outcome;
  timestamp: number;
  barsToEntry: number | null;
  entryLow: number;
  entryHigh: number;
  invalidation: number;
  rr1: number;
  rr2: number;
  maxFavorablePercent: number;
  maxAdversePercent: number;
}

interface PickedCandidate extends Candidate {
  radarRule: string;
  grossR: number;
  netR: number;
  riskPercent: number;
  costR: number;
  year: number;
}

interface Summary {
  label: string;
  total: number;
  entered: number;
  wins: number;
  losses: number;
  noEntries: number;
  timeouts: number;
  ambiguous: number;
  winRateResolved: number;
  grossAvgR: number;
  netAvgR: number;
  avgScore: number;
  avgRiskPercent: number;
  avgMfePercent: number;
  avgMaePercent: number;
}

const candidateFiles = [
  "reports/btcusdt-730d-relax2.candidates.json",
  "reports/ethusdt-365d-relax2.candidates.json",
  "reports/solusdt-365d-relax2.candidates.json",
  "reports/xrpusdt-365d-relax2.candidates.json",
  "reports/dogeusdt-365d-relax2.candidates.json",
  "reports/bnbusdt-365d-relax2.candidates.json"
];

const outputPath = process.env.RADAR_VALIDATION_OUTPUT ?? "reports/current-radar-validation.json";
const costPercent = Number(process.env.RADAR_COST_PERCENT ?? "0.10");

function symbolRoot(symbol: string) {
  return symbol.replace("USDT.P", "").replace("USDT", "");
}

function hasRisk(item: Candidate, needle: string) {
  return item.riskFlags.some((flag) => flag.includes(needle));
}

function hardZone(item: Candidate) {
  return item.ctx.inOb || item.ctx.inFvg;
}

function hardOrOte(item: Candidate) {
  return hardZone(item) || item.ctx.oteZone === item.side;
}

function pocFavorable(item: Candidate) {
  return (item.side === "long" && item.ctx.pocPosition === "above") || (item.side === "short" && item.ctx.pocPosition === "below");
}

function notPocNear(item: Candidate) {
  return item.ctx.pocPosition !== "near";
}

function pdFavorable(item: Candidate) {
  return (item.side === "long" && item.ctx.premiumDiscount === "discount") || (item.side === "short" && item.ctx.premiumDiscount === "premium");
}

function pdFavorableOrEquilibrium(item: Candidate) {
  return pdFavorable(item) || item.ctx.premiumDiscount === "equilibrium";
}

function blockedByCommonRisk(item: Candidate) {
  if (item.watchKind === "counter") return true;
  if (hasRisk(item, "현재 TF CHoCH가 반대로")) return true;
  if (hasRisk(item, "최근 반대 방향 스윕")) return true;
  return false;
}

function activeRuleName(item: Candidate): string | null {
  if (blockedByCommonRisk(item)) return null;
  if (item.mode === "scalp" && item.score < 38) return null;
  if (item.mode === "swing" && item.score < 42) return null;

  const sym = symbolRoot(item.symbol);

  if (sym === "BTC" && item.score >= 42 && hardZone(item) && item.proximity === "near") {
    return "BTC hard-zone near";
  }

  if (
    sym === "ETH" &&
    item.mode === "swing" &&
    item.timeframe === "1h" &&
    item.score >= 54 &&
    hardOrOte(item) &&
    notPocNear(item) &&
    pdFavorableOrEquilibrium(item)
  ) {
    return "ETH 1h swing hard/OTE";
  }

  if (
    sym === "XRP" &&
    item.side === "long" &&
    item.score >= 42 &&
    hardZone(item) &&
    (item.proximity === "near" || item.proximity === "wait") &&
    pocFavorable(item)
  ) {
    return "XRP long POC hard-zone";
  }

  if (
    sym === "SOL" &&
    item.score >= 42 &&
    hardOrOte(item) &&
    item.proximity === "wait" &&
    item.riskFlags.length <= 2 &&
    (pocFavorable(item) || notPocNear(item))
  ) {
    return "SOL cautious wait";
  }

  if (
    sym === "DOGE" &&
    item.mode === "scalp" &&
    (item.timeframe === "5m" || item.timeframe === "15m") &&
    item.score >= 42 &&
    hardZone(item) &&
    item.proximity === "near"
  ) {
    return "DOGE scalp hard-zone near";
  }

  if (
    sym === "DOGE" &&
    item.mode === "scalp" &&
    item.side === "short" &&
    (item.timeframe === "5m" || item.timeframe === "15m") &&
    item.score >= 42 &&
    hardOrOte(item) &&
    (item.proximity === "near" || item.proximity === "wait") &&
    pocFavorable(item)
  ) {
    return "DOGE short POC";
  }

  if (
    sym === "BNB" &&
    item.mode === "scalp" &&
    item.timeframe === "5m" &&
    item.score >= 38 &&
    hardOrOte(item) &&
    item.proximity === "near" &&
    pdFavorableOrEquilibrium(item)
  ) {
    return "BNB 5m PD hard/OTE";
  }

  return null;
}

function grossR(item: Candidate) {
  if (item.outcome === "target2") return item.rr2;
  if (item.outcome === "target1") return item.rr1;
  if (item.outcome === "invalidation") return -1;
  return 0;
}

function entered(item: Candidate) {
  return item.barsToEntry !== null && item.outcome !== "noEntry" && item.outcome !== "invalidatedBeforeEntry";
}

function riskPercent(item: Candidate) {
  const entry = item.side === "long" ? item.entryHigh : item.entryLow;
  if (!Number.isFinite(entry) || entry <= 0) return 0;
  return Math.abs(entry - item.invalidation) / entry * 100;
}

function toPicked(item: Candidate, radarRule: string): PickedCandidate {
  const risk = Math.max(riskPercent(item), 0.01);
  const costR = entered(item) ? costPercent / risk : 0;
  const gross = grossR(item);
  return {
    ...item,
    radarRule,
    grossR: gross,
    netR: gross - costR,
    riskPercent: risk,
    costR,
    year: new Date(item.timestamp * 1000).getUTCFullYear()
  };
}

function avg(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

function summarize(label: string, rows: PickedCandidate[]): Summary {
  const wins = rows.filter((row) => row.outcome === "target1" || row.outcome === "target2").length;
  const losses = rows.filter((row) => row.outcome === "invalidation").length;
  const noEntries = rows.filter((row) => row.outcome === "noEntry" || row.outcome === "invalidatedBeforeEntry").length;
  const timeouts = rows.filter((row) => row.outcome === "timeout").length;
  const ambiguous = rows.filter((row) => row.outcome === "ambiguous").length;
  const resolved = wins + losses;
  return {
    label,
    total: rows.length,
    entered: rows.filter(entered).length,
    wins,
    losses,
    noEntries,
    timeouts,
    ambiguous,
    winRateResolved: resolved ? round((wins / resolved) * 100, 1) : 0,
    grossAvgR: round(avg(rows.map((row) => row.grossR))),
    netAvgR: round(avg(rows.map((row) => row.netR))),
    avgScore: round(avg(rows.map((row) => row.score)), 1),
    avgRiskPercent: round(avg(rows.map((row) => row.riskPercent))),
    avgMfePercent: round(avg(rows.map((row) => row.maxFavorablePercent))),
    avgMaePercent: round(avg(rows.map((row) => row.maxAdversePercent)))
  };
}

function groupBy<T>(rows: T[], key: (row: T) => string) {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const label = key(row);
    map.set(label, [...(map.get(label) ?? []), row]);
  }
  return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
}

async function loadCandidates() {
  const all: Candidate[] = [];
  for (const file of candidateFiles) {
    const raw = await readFile(file, "utf8");
    all.push(...(JSON.parse(raw) as Candidate[]));
  }
  return all;
}

async function main() {
  const candidates = await loadCandidates();
  const picked = candidates
    .map((item) => {
      const rule = activeRuleName(item);
      return rule ? toPicked(item, rule) : null;
    })
    .filter((item): item is PickedCandidate => item !== null);

  const bySymbol = groupBy(picked, (row) => symbolRoot(row.symbol)).map(([label, rows]) => summarize(label, rows));
  const byYear = groupBy(picked, (row) => String(row.year)).map(([label, rows]) => summarize(label, rows));
  const byRegime = groupBy(picked, (row) => row.regime).map(([label, rows]) => summarize(label, rows));
  const byMode = groupBy(picked, (row) => row.mode).map(([label, rows]) => summarize(label, rows));
  const bySide = groupBy(picked, (row) => row.side).map(([label, rows]) => summarize(label, rows));
  const byTimeframe = groupBy(picked, (row) => row.timeframe).map(([label, rows]) => summarize(label, rows));
  const byRule = groupBy(picked, (row) => row.radarRule).map(([label, rows]) => summarize(label, rows));

  const report = {
    generatedAt: new Date().toISOString(),
    costPercentRoundTrip: costPercent,
    sourceFiles: candidateFiles,
    totalCandidatePool: candidates.length,
    pickedCount: picked.length,
    overall: summarize("overall", picked),
    bySymbol,
    byYear,
    byRegime,
    byMode,
    bySide,
    byTimeframe,
    byRule,
    weakestBuckets: [...bySymbol, ...byRegime, ...byMode, ...bySide, ...byTimeframe, ...byRule]
      .filter((row) => row.total >= 10)
      .sort((a, b) => a.netAvgR - b.netAvgR)
      .slice(0, 12)
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(report, null, 2), "utf8");

  console.log(JSON.stringify({
    outputPath,
    overall: report.overall,
    bySymbol: report.bySymbol,
    weakestBuckets: report.weakestBuckets.slice(0, 5)
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
