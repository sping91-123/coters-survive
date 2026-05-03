"use client";

import Link from "next/link";
import { ArrowLeft, KeyRound } from "lucide-react";
import { getOAuthUrl, isSupabaseConfigured } from "@/lib/supabase";

export default function LoginPage() {
  const configured = isSupabaseConfigured();

  function startLogin(provider: "google") {
    const url = getOAuthUrl(provider);
    if (!url) return;
    window.location.href = url;
  }

  return (
    <main className="min-h-screen px-4 py-10">
      <div className="mx-auto flex w-full max-w-md flex-col gap-5">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-white">
          <ArrowLeft size={16} aria-hidden />
          포지션가드로 돌아가기
        </Link>

        <section className="rounded-lg border border-surface-line bg-surface-card p-5 shadow-glow">
          <div className="grid h-12 w-12 place-items-center rounded-lg border border-accent-blue/25 bg-accent-blue/10 text-accent-blue">
            <KeyRound size={24} aria-hidden />
          </div>
          <h1 className="mt-5 text-2xl font-black text-white">포지션가드 로그인</h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            서버 복기, 구독 기능, 추후 알림 기능을 위한 계정 시스템입니다.
          </p>

          {!configured ? (
            <div className="mt-5 rounded-md border border-signal-warning/25 bg-signal-warning/10 p-3 text-sm leading-6 text-signal-warning">
              Supabase 환경 변수가 아직 설정되지 않았습니다. `.env.local`을 확인하세요.
            </div>
          ) : null}

          <div className="mt-6 grid gap-3">
            <button
              type="button"
              disabled={!configured}
              onClick={() => startLogin("google")}
              className="min-h-12 rounded-md border border-white/10 bg-white px-4 text-sm font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Google로 계속하기
            </button>
          </div>

          <p className="mt-5 text-xs leading-5 text-slate-500">
            카카오 로그인은 사업자 인증 후 추가 예정입니다.
          </p>
        </section>
      </div>
    </main>
  );
}
