// 단타와 스윙 상품화 기준에 맞는 셋업 조합을 탐색하는 리포트 스크립트
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

type Side = "long" | "short";
type Mode = "scalp" | "swing";
type Regime = "bull" | "bear" | "range";
type Timeframe = "5m" | "15m" | "1h" | "4h" | "1d";
type Outcome = "target1" | "target2" | "invalidation" | "timeout" | "ambiguous" | "noEntry" | "invalidatedBeforeEntry";
type Proximity = "inside" | "near" | "wait" | "missed";

interface Candidate {
  symbol?: string;
  mode: Mode;
  status: "entry" | "watch";
  watchKind?: "aligned" | "counter";
  regime: Regime;
  timeframe: Timeframe;
  side: Side;
  score: number;
  confidence: number;
  readiness: "low" | "medium" | "high";
  proximity: Proximity;
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
  sourceFile?: string;
}

interface Profile {
  id: "scalp" | "swing2r";
  label: string;
  files: string[];
  minTotal: number;
  minTestTotal: number;
  minResolvedWinRate: number;
  minAvgR: number;
  minMonthlyFrequency: number;
  scoreSteps: number[];
  timeframes: Timeframe[][];
  targetDescription: string;
}

interface Rule {
  id: string;
  minScore: number;
  statusPolicy: "entry" | "entryOrAlignedWatch";
  timeframes: Timeframe[];
  sides?: Side[];
  zonePolicy: "any" | "hard" | "hardOrOte" | "ote";
  pocPolicy: "any" | "favorable" | "notNear";
  pdPolicy: "any" | "favorableEq" | "favorable";
  proximities: Proximity[];
  maxRiskFlags?: number;
  blocker: "none" | "noOpposite" | "noOppositeAndHtf" | "noOppositeAndHtfAndKz";
}

interface Summary {
  total: number;
  wins: number;
  losses: number;
  noEntries: number;
  timeouts: number;
  ambiguous: number;
  entryRate: number;
  resolvedWinRate: number;
  avgR: number;
  avgWinR: number;
  avgScore: number;
  avgMfePercent: number;
  avgMaePercent: number;
  monthlyFrequency: number;
}

interface Acc {
  total: number;
  wins: number;
  losses: number;
  noEntries: number;
  timeouts: number;
  ambiguous: number;
  entries: number;
  rSum: number;
  winRSum: number;
  scoreSum: number;
  mfeSum: number;
  maeSum: number;
}

interface Result {
  profile: Profile["id"];
  rule: Rule;
  all: Summary;
  train: Summary;
  test: Summary;
  bySymbol: Array<{ symbol: string; summary: Summary }>;
  bySide: Array<{ side: Side; summary: Summary }>;
  byTimeframe: Array<{ timeframe: Timeframe; summary: Summary }>;
  rankScore: number;
}

const outputPath = process.env.PRODUCT_RESEARCH_OUTPUT ?? "reports/product-setup-research/product-setup-research.json";

function candidateFilesFromDir(reportDir: string, btcDays = 730, altDays = 365) {
  return [
    join(reportDir, `btcusdt-${btcDays}d-relax2.candidates.json`),
    join(reportDir, `ethusdt-${altDays}d-relax2.candidates.json`),
    join(reportDir, `solusdt-${altDays}d-relax2.candidates.json`),
    join(reportDir, `xrpusdt-${altDays}d-relax2.candidates.json`),
    join(reportDir, `dogeusdt-${altDays}d-relax2.candidates.json`),
    join(reportDir, `bnbusdt-${altDays}d-relax2.candidates.json`)
  ];
}

const baseScalpFiles = process.env.PRODUCT_SCALP_REPORT_DIR
  ? candidateFilesFromDir(process.env.PRODUCT_SCALP_REPORT_DIR)
  : [
      "reports/btcusdt-730d-relax2.candidates.json",
      "reports/ethusdt-365d-relax2.candidates.json",
      "reports/solusdt-365d-relax2.candidates.json",
      "reports/xrpusdt-365d-relax2.candidates.json",
      "reports/dogeusdt-365d-relax2.candidates.json",
      "reports/bnbusdt-365d-relax2.candidates.json"
    ];

const swing2rFiles = candidateFilesFromDir(process.env.PRODUCT_SWING_REPORT_DIR ?? "reports/rr2-only-research");

const profiles: Profile[] = [
  {
    id: "scalp",
    label: "단타",
    files: baseScalpFiles,
    minTotal: Number(process.env.PRODUCT_SCALP_MIN_TOTAL ?? "80"),
    minTestTotal: Number(process.env.PRODUCT_SCALP_MIN_TEST_TOTAL ?? "18"),
    minResolvedWinRate: Number(process.env.PRODUCT_SCALP_MIN_WR ?? "55"),
    minAvgR: Number(process.env.PRODUCT_SCALP_MIN_AVGR ?? "0.03"),
    minMonthlyFrequency: Number(process.env.PRODUCT_SCALP_MIN_MONTHLY ?? "6"),
    scoreSteps: [35, 40, 45, 50, 55, 60],
    timeframes: [["5m"], ["15m"], ["5m", "15m"]],
    targetDescription: "승률 55-60% 이상, 보상 0.7R-1R 구간을 목표로 하는 단타형 후보"
  },
  {
    id: "swing2r",
    label: "스윙 2R",
    files: swing2rFiles,
    minTotal: Number(process.env.PRODUCT_SWING_MIN_TOTAL ?? "18"),
    minTestTotal: Number(process.env.PRODUCT_SWING_MIN_TEST_TOTAL ?? "5"),
    minResolvedWinRate: Number(process.env.PRODUCT_SWING_MIN_WR ?? "35"),
    minAvgR: Number(process.env.PRODUCT_SWING_MIN_AVGR ?? "0.04"),
    minMonthlyFrequency: Number(process.env.PRODUCT_SWING_MIN_MONTHLY ?? "0.4"),
    scoreSteps: [50, 54, 58, 62, 66, 70],
    timeframes: [["1h"], ["4h"], ["1h", "4h"]],
    targetDescription: "승률 35-45% 이상, 보상 2R 이상을 목표로 하는 스윙형 후보"
  }
];

async function exists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function symbolFromFile(path: string) {
  const file = path.split(/[\\/]/).pop() ?? path;
  return file.split("-")[0]?.toUpperCase() ?? "UNKNOWN";
}

function emptyAcc(): Acc {
  return {
    total: 0,
    wins: 0,
    losses: 0,
    noEntries: 0,
    timeouts: 0,
    ambiguous: 0,
    entries: 0,
    rSum: 0,
    winRSum: 0,
    scoreSum: 0,
    mfeSum: 0,
    maeSum: 0
  };
}

function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

function pct(a: number, b: number) {
  return b > 0 ? round((a / b) * 100, 1) : 0;
}

function rMultiple(item: Candidate) {
  if (item.outcome === "target2") return item.rr2;
  if (item.outcome === "target1") return item.rr1;
  if (item.outcome === "invalidation") return -1;
  return 0;
}

function add(acc: Acc, item: Candidate) {
  const r = rMultiple(item);
  acc.total += 1;
  acc.entries += item.barsToEntry !== null ? 1 : 0;
  acc.wins += item.outcome === "target1" || item.outcome === "target2" ? 1 : 0;
  acc.losses += item.outcome === "invalidation" ? 1 : 0;
  acc.noEntries += item.outcome === "noEntry" || item.outcome === "invalidatedBeforeEntry" ? 1 : 0;
  acc.timeouts += item.outcome === "timeout" ? 1 : 0;
  acc.ambiguous += item.outcome === "ambiguous" ? 1 : 0;
  acc.rSum += r;
  acc.winRSum += r > 0 ? r : 0;
  acc.scoreSum += item.score;
  acc.mfeSum += item.maxFavorablePercent;
  acc.maeSum += item.maxAdversePercent;
}

function summarize(acc: Acc, days: number): Summary {
  const resolved = acc.wins + acc.losses;
  return {
    total: acc.total,
    wins: acc.wins,
    losses: acc.losses,
    noEntries: acc.noEntries,
    timeouts: acc.timeouts,
    ambiguous: acc.ambiguous,
    entryRate: pct(acc.entries, acc.total),
    resolvedWinRate: pct(acc.wins, resolved),
    avgR: round(acc.total > 0 ? acc.rSum / acc.total : 0),
    avgWinR: round(acc.wins > 0 ? acc.winRSum / acc.wins : 0),
    avgScore: round(acc.total > 0 ? acc.scoreSum / acc.total : 0, 1),
    avgMfePercent: round(acc.total > 0 ? acc.mfeSum / acc.total : 0, 2),
    avgMaePercent: round(acc.total > 0 ? acc.maeSum / acc.total : 0, 2),
    monthlyFrequency: round(days > 0 ? (acc.total / days) * 30 : 0, 1)
  };
}

function hasRisk(item: Candidate, needle: string) {
  return item.riskFlags.some((flag) => flag.includes(needle));
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

function matchesStatus(rule: Rule, item: Candidate) {
  if (rule.statusPolicy === "entry") return item.status === "entry";
  if (item.status === "entry") return true;
  return item.status === "watch" && item.watchKind !== "counter";
}

function matchesZone(rule: Rule, item: Candidate) {
  if (rule.zonePolicy === "any") return true;
  if (rule.zonePolicy === "hard") return item.ctx.inOb || item.ctx.inFvg;
  if (rule.zonePolicy === "ote") return isOteSameSide(item);
  return item.ctx.inOb || item.ctx.inFvg || isOteSameSide(item);
}

function matchesBlocker(rule: Rule, item: Candidate) {
  if (rule.blocker === "none") return true;
  if (hasRisk(item, "CHoCH") || hasRisk(item, "스윕") || hasRisk(item, "CISD")) return false;
  if (rule.blocker === "noOpposite") return true;
  if (hasRisk(item, "상위 시간대")) return false;
  if (rule.blocker === "noOppositeAndHtf") return true;
  if (hasRisk(item, "킬존 바깥")) return false;
  return true;
}

function matchesRule(rule: Rule, item: Candidate) {
  if (item.score < rule.minScore) return false;
  if (!matchesStatus(rule, item)) return false;
  if (!rule.timeframes.includes(item.timeframe)) return false;
  if (rule.sides && !rule.sides.includes(item.side)) return false;
  if (!rule.proximities.includes(item.proximity)) return false;
  if (!matchesZone(rule, item)) return false;
  if (rule.pocPolicy === "favorable" && !isPocFavorable(item)) return false;
  if (rule.pocPolicy === "notNear" && item.ctx.pocPosition === "near") return false;
  if (rule.pdPolicy === "favorableEq" && !isPdFavorable(item, true)) return false;
  if (rule.pdPolicy === "favorable" && !isPdFavorable(item, false)) return false;
  if (typeof rule.maxRiskFlags === "number" && item.riskFlags.length > rule.maxRiskFlags) return false;
  if (!matchesBlocker(rule, item)) return false;
  return true;
}

function labelOf(rule: Rule) {
  return [
    `s${rule.minScore}`,
    rule.statusPolicy,
    rule.timeframes.join("+"),
    rule.sides?.join("+") ?? "both",
    rule.zonePolicy,
    rule.pocPolicy,
    rule.pdPolicy,
    rule.proximities.join("+"),
    typeof rule.maxRiskFlags === "number" ? `risk${rule.maxRiskFlags}` : "riskAny",
    rule.blocker
  ].join("|");
}

function buildRules(profile: Profile): Rule[] {
  const rules: Rule[] = [];
  const statusPolicies: Rule["statusPolicy"][] = ["entry", "entryOrAlignedWatch"];
  const sides: Array<Side[] | undefined> = [["long"], ["short"], undefined];
  const zonePolicies: Rule["zonePolicy"][] = ["any", "hard", "hardOrOte", "ote"];
  const pocPolicies: Rule["pocPolicy"][] = ["any", "favorable", "notNear"];
  const pdPolicies: Rule["pdPolicy"][] = ["any", "favorableEq", "favorable"];
  const proximitySets: Proximity[][] = [
    ["inside", "near"],
    ["inside", "near", "wait"],
    ["near", "wait"]
  ];
  const maxRiskFlags: Array<number | undefined> = [undefined, 1, 2];
  const blockers: Rule["blocker"][] = ["none", "noOpposite", "noOppositeAndHtf", "noOppositeAndHtfAndKz"];

  for (const minScore of profile.scoreSteps) {
    for (const statusPolicy of statusPolicies) {
      for (const timeframes of profile.timeframes) {
        for (const sideSet of sides) {
          for (const zonePolicy of zonePolicies) {
            for (const pocPolicy of pocPolicies) {
              for (const pdPolicy of pdPolicies) {
                for (const proximities of proximitySets) {
                  for (const maxRiskFlag of maxRiskFlags) {
                    for (const blocker of blockers) {
                      const rule: Rule = {
                        id: "",
                        minScore,
                        statusPolicy,
                        timeframes,
                        sides: sideSet,
                        zonePolicy,
                        pocPolicy,
                        pdPolicy,
                        proximities,
                        maxRiskFlags: maxRiskFlag,
                        blocker
                      };
                      rule.id = labelOf(rule);
                      rules.push(rule);
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

async function loadCandidates(files: string[], mode: Mode) {
  const loaded: Candidate[] = [];
  const usedFiles: string[] = [];
  for (const file of files) {
    if (!(await exists(file))) continue;
    const raw = await readFile(file, "utf8");
    const symbol = symbolFromFile(file);
    const rows = JSON.parse(raw) as Candidate[];
    loaded.push(
      ...rows
        .filter((row) => row.mode === mode)
        .map((row) => ({
          ...row,
          symbol: row.symbol ?? symbol,
          sourceFile: file
        }))
    );
    usedFiles.push(file);
  }
  return { candidates: loaded.sort((a, b) => a.timestamp - b.timestamp), usedFiles };
}

function rank(profile: Profile, all: Summary, train: Summary, test: Summary) {
  const freqCap = profile.id === "scalp" ? 45 : 8;
  const frequencyScore = Math.min(all.monthlyFrequency, freqCap) / freqCap;
  const winScore = (train.resolvedWinRate + test.resolvedWinRate) / 200;
  const expectancyScore = Math.max(-1, Math.min(2, train.avgR)) + Math.max(-1, Math.min(2, test.avgR)) * 1.25;
  const maePenalty = Math.max(0, test.avgMaePercent - test.avgMfePercent) * 0.04;
  return round(expectancyScore + winScore + frequencyScore - maePenalty, 4);
}

function passesProfile(profile: Profile, all: Summary, train: Summary, test: Summary) {
  if (all.total < profile.minTotal || test.total < profile.minTestTotal || train.total < Math.max(1, profile.minTotal * 0.45)) return false;
  if (all.monthlyFrequency < profile.minMonthlyFrequency) return false;
  if (train.avgR < profile.minAvgR || test.avgR < profile.minAvgR || all.avgR < profile.minAvgR) return false;
  if (train.resolvedWinRate < profile.minResolvedWinRate || test.resolvedWinRate < profile.minResolvedWinRate) return false;
  if (profile.id === "swing2r" && all.avgWinR < 1.95) return false;
  if (profile.id === "scalp" && all.avgWinR < 0.7) return false;
  return true;
}

function summarizeBreakdowns(items: Candidate[], days: number) {
  const symbols = new Map<string, Acc>();
  const sides = new Map<Side, Acc>();
  const timeframes = new Map<Timeframe, Acc>();
  for (const item of items) {
    const symbol = item.symbol ?? "UNKNOWN";
    if (!symbols.has(symbol)) symbols.set(symbol, emptyAcc());
    if (!sides.has(item.side)) sides.set(item.side, emptyAcc());
    if (!timeframes.has(item.timeframe)) timeframes.set(item.timeframe, emptyAcc());
    add(symbols.get(symbol)!, item);
    add(sides.get(item.side)!, item);
    add(timeframes.get(item.timeframe)!, item);
  }
  return {
    bySymbol: Array.from(symbols.entries()).map(([symbol, acc]) => ({ symbol, summary: summarize(acc, days) })),
    bySide: Array.from(sides.entries()).map(([side, acc]) => ({ side, summary: summarize(acc, days) })),
    byTimeframe: Array.from(timeframes.entries()).map(([timeframe, acc]) => ({ timeframe, summary: summarize(acc, days) }))
  };
}

async function researchProfile(profile: Profile): Promise<{
  profile: Profile;
  usedFiles: string[];
  totalCandidates: number;
  top: Result[];
  topEntryOnly: Result[];
  topEntryOrAlignedWatch: Result[];
}> {
  const { candidates, usedFiles } = await loadCandidates(profile.files, profile.id === "scalp" ? "scalp" : "swing");
  const minTs = candidates[0]?.timestamp ?? 0;
  const maxTs = candidates[candidates.length - 1]?.timestamp ?? 0;
  const splitTs = minTs + (maxTs - minTs) * 0.7;
  const days = Math.max(1, (maxTs - minTs) / 86400);
  const rules = buildRules(profile);
  const results: Result[] = [];

  for (const rule of rules) {
    const allAcc = emptyAcc();
    const trainAcc = emptyAcc();
    const testAcc = emptyAcc();
    const matched: Candidate[] = [];

    for (const item of candidates) {
      if (!matchesRule(rule, item)) continue;
      add(allAcc, item);
      if (item.timestamp <= splitTs) add(trainAcc, item);
      else add(testAcc, item);
      matched.push(item);
    }

    const all = summarize(allAcc, days);
    const train = summarize(trainAcc, days * 0.7);
    const test = summarize(testAcc, days * 0.3);
    if (!passesProfile(profile, all, train, test)) continue;
    const breakdowns = summarizeBreakdowns(matched, days);
    results.push({
      profile: profile.id,
      rule,
      all,
      train,
      test,
      ...breakdowns,
      rankScore: rank(profile, all, train, test)
    });
  }

  const sorted = results.sort(
    (a, b) => b.rankScore - a.rankScore || b.test.avgR - a.test.avgR || b.all.monthlyFrequency - a.all.monthlyFrequency
  );

  return {
    profile,
    usedFiles,
    totalCandidates: candidates.length,
    top: sorted.slice(0, 30),
    topEntryOnly: sorted.filter((result) => result.rule.statusPolicy === "entry").slice(0, 15),
    topEntryOrAlignedWatch: sorted.filter((result) => result.rule.statusPolicy === "entryOrAlignedWatch").slice(0, 15)
  };
}

function formatSummary(result: Result) {
  return {
    rule: result.rule.id,
    rankScore: result.rankScore,
    all: result.all,
    train: result.train,
    test: result.test,
    bySymbol: result.bySymbol,
    bySide: result.bySide,
    byTimeframe: result.byTimeframe
  };
}

async function main() {
  const researched = [];
  for (const profile of profiles) {
    researched.push(await researchProfile(profile));
  }
  const payload = {
    generatedAt: new Date().toISOString(),
    profiles: researched.map((entry) => ({
      id: entry.profile.id,
      label: entry.profile.label,
      target: entry.profile.targetDescription,
      thresholds: {
        minTotal: entry.profile.minTotal,
        minTestTotal: entry.profile.minTestTotal,
        minResolvedWinRate: entry.profile.minResolvedWinRate,
        minAvgR: entry.profile.minAvgR,
        minMonthlyFrequency: entry.profile.minMonthlyFrequency
      },
      usedFiles: entry.usedFiles,
      totalCandidates: entry.totalCandidates,
      top: entry.top.map(formatSummary),
      topEntryOnly: entry.topEntryOnly.map(formatSummary),
      topEntryOrAlignedWatch: entry.topEntryOrAlignedWatch.map(formatSummary)
    }))
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(payload, null, 2), "utf8");
  await writeFile(
    join(dirname(outputPath), "product-setup-research.md"),
    [
      "# Product Setup Research",
      "",
      `Generated: ${payload.generatedAt}`,
      "",
      ...payload.profiles.flatMap((profile) => [
        `## ${profile.label}`,
        "",
        profile.target,
        "",
        `Candidates: ${profile.totalCandidates}`,
        "",
        ...profile.top.slice(0, 8).flatMap((result, index) => [
          `### ${index + 1}. ${result.rule}`,
          "",
          `- Rank score: ${result.rankScore}`,
          `- All: total ${result.all.total}, WR ${result.all.resolvedWinRate}%, avgR ${result.all.avgR}, monthly ${result.all.monthlyFrequency}`,
          `- Train: total ${result.train.total}, WR ${result.train.resolvedWinRate}%, avgR ${result.train.avgR}`,
          `- Test: total ${result.test.total}, WR ${result.test.resolvedWinRate}%, avgR ${result.test.avgR}`,
          `- By side: ${result.bySide.map((row) => `${row.side} WR ${row.summary.resolvedWinRate}% avgR ${row.summary.avgR} n ${row.summary.total}`).join("; ")}`,
          `- By TF: ${result.byTimeframe.map((row) => `${row.timeframe} WR ${row.summary.resolvedWinRate}% avgR ${row.summary.avgR} n ${row.summary.total}`).join("; ")}`,
          ""
        ])
      ])
    ].join("\n"),
    "utf8"
  );

  console.log(JSON.stringify(payload.profiles.map((profile) => ({
    id: profile.id,
    totalCandidates: profile.totalCandidates,
    topCount: profile.top.length,
    best: profile.top[0] ?? null,
    bestEntryOnly: profile.topEntryOnly[0] ?? null,
    bestEntryOrAlignedWatch: profile.topEntryOrAlignedWatch[0] ?? null
  })), null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
