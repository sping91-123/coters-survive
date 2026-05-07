import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

type Side = "long" | "short";
type Mode = "scalp" | "swing";
type Regime = "bull" | "bear" | "range";
type Timeframe = "5m" | "15m" | "1h" | "4h" | "1d";
type Outcome = "target1" | "target2" | "invalidation" | "timeout" | "ambiguous" | "noEntry" | "invalidatedBeforeEntry";

interface Candidate {
  mode: Mode;
  status: "entry" | "watch";
  watchKind?: "aligned" | "counter";
  regime: Regime;
  timeframe: Timeframe;
  side: Side;
  score: number;
  confidence: number;
  readiness: "low" | "medium" | "high";
  proximity: "inside" | "near" | "wait" | "missed";
  riskFlags: string[];
  ctx: {
    msb: string;
    choch: string;
    premiumDiscount: string;
    pocPosition: string;
    inOb: boolean;
    inFvg: boolean;
    oteZone: string;
  };
  outcome: Outcome;
  timestamp: number;
  barsToEntry: number | null;
  maxFavorablePercent: number;
  maxAdversePercent: number;
  rr1: number;
  rr2: number;
}

interface RuleSet {
  name: string;
  minScore: number;
  modes?: Mode[];
  timeframes?: Timeframe[];
  sides?: Side[];
  regimes?: Regime[];
  requireAligned?: boolean;
  allowCounterWatch?: boolean;
  requireHardZone?: boolean;
  requireOteSameSide?: boolean;
  requireHardOrOte?: boolean;
  requirePocFavorable?: boolean;
  blockPocNear?: boolean;
  requirePdFavorable?: boolean;
  allowPdEquilibrium?: boolean;
  blockKillzoneOff?: boolean;
  blockOppositeChoch?: boolean;
  blockOppositeSweep?: boolean;
  maxRiskFlags?: number;
  proximities?: Candidate["proximity"][];
  statuses?: Candidate["status"][];
}

interface Summary {
  label: string;
  total: number;
  wins: number;
  losses: number;
  noEntries: number;
  timeouts: number;
  ambiguous: number;
  entryRate: number;
  winRateResolved: number;
  avgR: number;
  avgScore: number;
  avgMfePercent: number;
  avgMaePercent: number;
}

interface ResearchResult {
  rule: RuleSet;
  all: Summary;
  train: Summary;
  test: Summary;
  byMode: Summary[];
  bySide: Summary[];
  byTimeframe: Summary[];
  monthlyFrequency: number;
  score: number;
}

const inputPath = process.env.RESEARCH_CANDIDATES ?? "reports/btcusdt-730d-relax2.candidates.json";
const outputPath = process.env.RESEARCH_OUTPUT ?? "reports/setup-combo-research.json";
const minTotal = Number(process.env.RESEARCH_MIN_TOTAL ?? "60");
const minTestTotal = Number(process.env.RESEARCH_MIN_TEST_TOTAL ?? "18");

function hasRisk(item: Candidate, needle: string) {
  return item.riskFlags.some((flag) => flag.includes(needle));
}

function isWin(item: Candidate) {
  return item.outcome === "target1" || item.outcome === "target2";
}

function isLoss(item: Candidate) {
  return item.outcome === "invalidation";
}

function rMultiple(item: Candidate) {
  if (item.outcome === "target2") return item.rr2;
  if (item.outcome === "target1") return item.rr1;
  if (item.outcome === "invalidation") return -1;
  return 0;
}

function avg(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function pct(a: number, b: number) {
  return b ? Number(((a / b) * 100).toFixed(1)) : 0;
}

function round(value: number, digits = 2) {
  return Number(value.toFixed(digits));
}

function summarize(label: string, items: Candidate[]): Summary {
  const wins = items.filter(isWin);
  const losses = items.filter(isLoss);
  const resolved = wins.length + losses.length;
  return {
    label,
    total: items.length,
    wins: wins.length,
    losses: losses.length,
    noEntries: items.filter((item) => item.outcome === "noEntry" || item.outcome === "invalidatedBeforeEntry").length,
    timeouts: items.filter((item) => item.outcome === "timeout").length,
    ambiguous: items.filter((item) => item.outcome === "ambiguous").length,
    entryRate: pct(items.filter((item) => item.barsToEntry !== null).length, items.length),
    winRateResolved: pct(wins.length, resolved),
    avgR: round(avg(items.map(rMultiple)), 3),
    avgScore: round(avg(items.map((item) => item.score)), 1),
    avgMfePercent: round(avg(items.map((item) => item.maxFavorablePercent)), 2),
    avgMaePercent: round(avg(items.map((item) => item.maxAdversePercent)), 2)
  };
}

function groupBy(items: Candidate[], keyFn: (item: Candidate) => string) {
  const map = new Map<string, Candidate[]>();
  for (const item of items) {
    const key = keyFn(item);
    map.set(key, [...(map.get(key) ?? []), item]);
  }
  return Array.from(map.entries()).map(([key, value]) => summarize(key, value));
}

function isPocFavorable(item: Candidate) {
  return (
    (item.side === "long" && item.ctx.pocPosition === "above") ||
    (item.side === "short" && item.ctx.pocPosition === "below")
  );
}

function isPdFavorable(item: Candidate, allowEquilibrium: boolean) {
  if (allowEquilibrium && item.ctx.premiumDiscount === "equilibrium") return true;
  return (
    (item.side === "long" && item.ctx.premiumDiscount === "discount") ||
    (item.side === "short" && item.ctx.premiumDiscount === "premium")
  );
}

function isOteSameSide(item: Candidate) {
  return item.ctx.oteZone === item.side;
}

function matches(rule: RuleSet, item: Candidate) {
  if (item.score < rule.minScore) return false;
  if (rule.modes && !rule.modes.includes(item.mode)) return false;
  if (rule.timeframes && !rule.timeframes.includes(item.timeframe)) return false;
  if (rule.sides && !rule.sides.includes(item.side)) return false;
  if (rule.regimes && !rule.regimes.includes(item.regime)) return false;
  if (rule.statuses && !rule.statuses.includes(item.status)) return false;
  if (rule.proximities && !rule.proximities.includes(item.proximity)) return false;
  if (rule.requireAligned && item.watchKind === "counter") return false;
  if (!rule.allowCounterWatch && item.watchKind === "counter") return false;
  if (rule.requireHardZone && !item.ctx.inOb && !item.ctx.inFvg) return false;
  if (rule.requireOteSameSide && !isOteSameSide(item)) return false;
  if (rule.requireHardOrOte && !item.ctx.inOb && !item.ctx.inFvg && !isOteSameSide(item)) return false;
  if (rule.requirePocFavorable && !isPocFavorable(item)) return false;
  if (rule.blockPocNear && item.ctx.pocPosition === "near") return false;
  if (rule.requirePdFavorable && !isPdFavorable(item, Boolean(rule.allowPdEquilibrium))) return false;
  if (rule.blockKillzoneOff && hasRisk(item, "킬존 바깥")) return false;
  if (rule.blockOppositeChoch && hasRisk(item, "현재 TF CHoCH가 반대로")) return false;
  if (rule.blockOppositeSweep && hasRisk(item, "최근 반대 방향 스윕")) return false;
  if (typeof rule.maxRiskFlags === "number" && item.riskFlags.length > rule.maxRiskFlags) return false;
  return true;
}

function buildRules(): RuleSet[] {
  const rules: RuleSet[] = [];
  const modes: Array<Mode[] | undefined> = [["scalp"], ["swing"], undefined];
  const scoreByMode: Record<Mode | "all", number[]> = {
    scalp: [38, 42, 46, 50, 54],
    swing: [54, 58, 62, 66, 70],
    all: [42, 50, 58, 66]
  };
  const hardOptions = [
    { label: "hard", requireHardZone: true },
    { label: "hard_or_ote", requireHardOrOte: true },
    { label: "ote", requireOteSameSide: true }
  ];
  const pocOptions = [
    { label: "pocAny" },
    { label: "pocFav", requirePocFavorable: true },
    { label: "noPocNear", blockPocNear: true }
  ];
  const pdOptions = [
    { label: "pdAny" },
    { label: "pdFavEq", requirePdFavorable: true, allowPdEquilibrium: true },
    { label: "pdFav", requirePdFavorable: true }
  ];
  const timeframes: Array<Timeframe[] | undefined> = [["5m"], ["15m"], ["1h"], ["4h"], ["5m", "15m"], ["1h", "4h"], undefined];
  const sides: Array<Side[] | undefined> = [["long"], ["short"], undefined];
  const proximities: Array<Candidate["proximity"][] | undefined> = [["near"], ["wait"], ["near", "wait"], undefined];

  for (const modeSet of modes) {
    const modeKey = modeSet?.length === 1 ? modeSet[0] : "all";
    for (const minScore of scoreByMode[modeKey]) {
      for (const hard of hardOptions) {
        for (const poc of pocOptions) {
          for (const pd of pdOptions) {
            for (const tfSet of timeframes) {
              if (modeSet?.[0] === "scalp" && tfSet?.some((tf) => tf === "1h" || tf === "4h")) continue;
              if (modeSet?.[0] === "swing" && tfSet?.some((tf) => tf === "5m" || tf === "15m")) continue;
              for (const sideSet of sides) {
                for (const prox of proximities) {
                  for (const blockKillzoneOff of [false, true]) {
                    for (const maxRiskFlags of [undefined, 1, 2] as Array<number | undefined>) {
                      rules.push({
                        name: [
                          modeSet?.join("+") ?? "allMode",
                          `s${minScore}`,
                          hard.label,
                          poc.label,
                          pd.label,
                          tfSet?.join("+") ?? "allTf",
                          sideSet?.join("+") ?? "both",
                          prox?.join("+") ?? "anyProx",
                          blockKillzoneOff ? "kz" : "anyKz",
                          typeof maxRiskFlags === "number" ? `risk${maxRiskFlags}` : "anyRisk"
                        ].join("|"),
                        minScore,
                        modes: modeSet,
                        timeframes: tfSet,
                        sides: sideSet,
                        proximities: prox,
                        ...hard,
                        ...poc,
                        ...pd,
                        requireAligned: true,
                        blockKillzoneOff,
                        blockOppositeChoch: true,
                        blockOppositeSweep: true,
                        maxRiskFlags
                      });
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  return rules;
}

function scoreResult(all: Summary, train: Summary, test: Summary, days: number) {
  const monthlyFrequency = (all.total / days) * 30;
  const freqScore = Math.min(monthlyFrequency, 30) / 30;
  const expectancyScore = Math.max(-1, Math.min(1, test.avgR)) + Math.max(-1, Math.min(1, train.avgR));
  const winScore = (test.winRateResolved + train.winRateResolved) / 200;
  const drawdownPenalty = Math.max(0, test.avgMaePercent - test.avgMfePercent) * 0.05;
  return round(expectancyScore + winScore + freqScore - drawdownPenalty, 4);
}

async function main() {
  const raw = await readFile(inputPath, "utf8");
  const candidates = (JSON.parse(raw) as Candidate[]).sort((a, b) => a.timestamp - b.timestamp);
  const minTs = candidates[0]?.timestamp ?? 0;
  const maxTs = candidates[candidates.length - 1]?.timestamp ?? 0;
  const splitTs = minTs + (maxTs - minTs) * 0.7;
  const days = Math.max(1, (maxTs - minTs) / 86400);

  const results: ResearchResult[] = [];
  for (const rule of buildRules()) {
    const picked = candidates.filter((item) => matches(rule, item));
    const trainItems = picked.filter((item) => item.timestamp <= splitTs);
    const testItems = picked.filter((item) => item.timestamp > splitTs);
    if (picked.length < minTotal || testItems.length < minTestTotal || trainItems.length < minTotal * 0.45) continue;

    const all = summarize("all", picked);
    const train = summarize("train", trainItems);
    const test = summarize("test", testItems);
    if (train.avgR < -0.03 || test.avgR < -0.03) continue;
    if (train.winRateResolved < 48 || test.winRateResolved < 48) continue;

    results.push({
      rule,
      all,
      train,
      test,
      byMode: groupBy(picked, (item) => item.mode),
      bySide: groupBy(picked, (item) => item.side),
      byTimeframe: groupBy(picked, (item) => item.timeframe),
      monthlyFrequency: round((picked.length / days) * 30, 1),
      score: scoreResult(all, train, test, days)
    });
  }

  const sorted = results.sort((a, b) => b.score - a.score || b.test.avgR - a.test.avgR).slice(0, 50);
  const payload = {
    generatedAt: new Date().toISOString(),
    inputPath,
    totalCandidates: candidates.length,
    split: {
      trainUntil: new Date(splitTs * 1000).toISOString(),
      testFrom: new Date(splitTs * 1000).toISOString()
    },
    filters: {
      minTotal,
      minTestTotal
    },
    top: sorted
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(payload, null, 2), "utf8");
  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
