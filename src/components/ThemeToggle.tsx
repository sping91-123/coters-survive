"use client";
// 사용자가 라이트 모드와 다크 모드를 즉시 전환할 수 있는 버튼.
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

type ThemeMode = "dark" | "light";

const storageKey = "chart-radar.theme";

function applyTheme(theme: ThemeMode) {
  document.documentElement.classList.toggle("theme-light", theme === "light");
  document.documentElement.classList.toggle("theme-dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>("dark");

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    const initial = saved === "light" || saved === "dark" ? saved : "dark";
    setTheme(initial);
    applyTheme(initial);
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    window.localStorage.setItem(storageKey, next);
    applyTheme(next);
  }

  const isLight = theme === "light";
  const Icon = isLight ? Moon : Sun;

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-surface-line bg-surface-cardSoft px-2.5 text-xs font-black text-slate-300 transition hover:border-accent-blue/50 hover:text-white"
      aria-label={isLight ? "다크 모드로 전환" : "라이트 모드로 전환"}
      title={isLight ? "다크 모드" : "라이트 모드"}
    >
      <Icon size={14} aria-hidden />
      <span className="hidden sm:inline">{isLight ? "다크" : "라이트"}</span>
    </button>
  );
}
