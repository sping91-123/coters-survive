"use client";
// 앱이 켜져 있는 동안 저장된 레이더 감시 조건을 주기적으로 다시 확인한다.
import { useCallback, useEffect, useRef } from "react";
import type { TradingMode } from "@/lib/marketAnalysis";
import type { ScoutSetup } from "@/lib/setupScout";
import {
  findSetupAlertMatches,
  readSetupAlertMatches,
  readSetupAlertPresets,
  REQUEST_SETUP_ALERT_CHECK_EVENT,
  SETUP_ALERT_CHECK_FINISHED_EVENT,
  SETUP_ALERT_PRESETS_CHANGED_EVENT,
  writeSetupAlertMatches,
  writeSetupAlertMonitorStatus,
  type SetupAlertMonitorStatus
} from "@/lib/setupAlertPresets";

const scanModes: TradingMode[] = ["scalp", "swing"];
const monitorIntervalMs = 5 * 60 * 1000;
const monitorMarket = "crypto";
const notifiedStorageKey = `chart-radar.notifiedSetupMatches.v1.${monitorMarket}`;

function compactSymbol(symbol: string) {
  return symbol.replace("USDT.P", "").replace("USDT", "");
}

function sideLabel(side: ScoutSetup["plan"]["side"]) {
  return side === "long" ? "롱 우세" : "숏 우세";
}

function readNotifiedIds() {
  if (typeof window === "undefined") return new Set<string>();

  try {
    const raw = window.localStorage.getItem(notifiedStorageKey);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set<string>();
  }
}

function writeNotifiedIds(ids: Set<string>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(notifiedStorageKey, JSON.stringify(Array.from(ids).slice(-80)));
}

async function fetchCurrentSetups() {
  const results = await Promise.allSettled(
    scanModes.map(async (mode) => {
      const response = await fetch(`/api/scout?mode=${mode}&risk=radar&scope=all`, { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as { setups?: ScoutSetup[] };
      if (!response.ok || !Array.isArray(payload.setups)) return [];
      return payload.setups;
    })
  );

  return results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
}

export function RadarAlertMonitor() {
  const isCheckingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runCheck = useCallback(async (reason: SetupAlertMonitorStatus["reason"] = "auto") => {
    if (isCheckingRef.current) return 0;
    if (typeof window === "undefined") return 0;

    const presets = readSetupAlertPresets(monitorMarket);
    if (presets.length === 0) {
      writeSetupAlertMonitorStatus({
        market: monitorMarket,
        checkedAt: Date.now(),
        presetCount: 0,
        setupCount: 0,
        matchCount: 0,
        reason
      }, monitorMarket);
      return 0;
    }

    isCheckingRef.current = true;
    try {
      const setups = await fetchCurrentSetups();
      const matches = findSetupAlertMatches(presets, setups, monitorMarket);
      writeSetupAlertMonitorStatus({
        market: monitorMarket,
        checkedAt: Date.now(),
        presetCount: presets.length,
        setupCount: setups.length,
        matchCount: matches.length,
        reason
      }, monitorMarket);

      if (matches.length === 0) return 0;

      const previous = readSetupAlertMatches(monitorMarket);
      const merged = [...matches, ...previous.filter((item) => !matches.some((match) => match.id === item.id))];
      writeSetupAlertMatches(merged, monitorMarket);

      if (!("Notification" in window) || Notification.permission !== "granted") return matches.length;

      const notifiedIds = readNotifiedIds();
      const freshMatch = matches.find((match) => !notifiedIds.has(match.id));
      if (!freshMatch) return matches.length;

      notifiedIds.add(freshMatch.id);
      writeNotifiedIds(notifiedIds);
      new Notification("Chart Radar 감시 조건 일치", {
        body: `${compactSymbol(freshMatch.setup.symbol)} ${freshMatch.setup.timeframe} ${sideLabel(freshMatch.setup.side)} 감지가 다시 올라왔습니다.`,
        icon: "/brand/chart-radar-mark.png"
      });
      return matches.length;
    } finally {
      isCheckingRef.current = false;
    }
  }, []);

  useEffect(() => {
    void runCheck("auto");
    timerRef.current = setInterval(() => {
      void runCheck("auto");
    }, monitorIntervalMs);

    function handleVisibility() {
      if (document.visibilityState === "visible") void runCheck("visible");
    }

    function handlePresetChange() {
      void runCheck("preset-change");
    }

    async function handleManualCheck() {
      const matchCount = await runCheck("manual");
      window.dispatchEvent(new CustomEvent(SETUP_ALERT_CHECK_FINISHED_EVENT, { detail: { matchCount } }));
    }

    window.addEventListener(SETUP_ALERT_PRESETS_CHANGED_EVENT, handlePresetChange);
    window.addEventListener(REQUEST_SETUP_ALERT_CHECK_EVENT, handleManualCheck);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      window.removeEventListener(SETUP_ALERT_PRESETS_CHANGED_EVENT, handlePresetChange);
      window.removeEventListener(REQUEST_SETUP_ALERT_CHECK_EVENT, handleManualCheck);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [runCheck]);

  return null;
}
