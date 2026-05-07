import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { AuthStatus } from "@/components/AuthStatus";

export function Header() {
  return (
    <header className="space-y-4 pt-6">
      <div className="flex items-center justify-between gap-4">
        <Link href="/" className="flex min-w-0 items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-accent-blue/25 bg-accent-blue/10 text-accent-blue">
            <ShieldCheck size={22} aria-hidden />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold tracking-normal text-white sm:text-2xl">
              무제 Beta
            </h1>
            <p className="mt-1 text-sm leading-6 text-slate-400">
              진입 전, 차트 구조와 리스크를 먼저 점검하세요.
            </p>
          </div>
        </Link>
        <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center">
          <span className="rounded-md border border-accent-blue/30 bg-accent-blue/10 px-2.5 py-1 text-xs font-semibold text-accent-blue">
            Research Beta
          </span>
          <AuthStatus />
        </div>
      </div>
    </header>
  );
}
