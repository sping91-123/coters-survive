// 첫 진입에서 코인과 해외주식 시장을 분리해 선택하게 하는 게이트 화면.
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Coins, TrendingUp } from "lucide-react";

const marketEntries = [
  {
    title: "코인",
    href: "/survival",
    label: "BTC, ETH, 알트코인",
    icon: Coins,
    accent: "from-cyan-300/22 via-blue-500/12 to-transparent",
    iconClass: "border-cyan-300/35 bg-cyan-300/12 text-cyan-200",
    buttonClass: "bg-cyan-300 text-slate-950 group-hover:bg-cyan-200"
  },
  {
    title: "해외주식",
    href: "/stocks",
    label: "미국주식, ETF",
    icon: TrendingUp,
    accent: "from-emerald-300/20 via-sky-400/10 to-transparent",
    iconClass: "border-emerald-300/35 bg-emerald-300/12 text-emerald-200",
    buttonClass: "bg-emerald-300 text-slate-950 group-hover:bg-emerald-200"
  }
] as const;

export default function Home() {
  return (
    <main className="min-h-screen px-4 py-8 sm:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-4xl flex-col items-center justify-center">
        <section className="w-full rounded-lg border border-surface-line bg-surface-card/92 p-5 shadow-[0_26px_80px_rgba(0,0,0,0.30)] backdrop-blur sm:p-8">
          <div className="flex flex-col items-center text-center">
            <div className="relative h-20 w-20 overflow-hidden rounded-lg border border-cyan-300/25 bg-slate-950 shadow-[0_0_44px_rgba(34,211,238,0.26)]">
              <Image
                src="/brand/chart-radar-mark.png"
                alt=""
                width={80}
                height={80}
                priority
                className="h-full w-full object-cover"
                draggable={false}
              />
            </div>
            <h1 className="mt-5 text-3xl font-black tracking-normal text-white sm:text-5xl">Chart Radar</h1>
            <p className="mt-3 text-sm font-bold text-slate-400 sm:text-base">먼저 분석할 시장을 선택하세요.</p>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {marketEntries.map(({ title, href, label, icon: Icon, accent, iconClass, buttonClass }) => (
              <Link
                key={title}
                href={href}
                className="group relative min-h-[13rem] overflow-hidden rounded-lg border border-surface-line bg-surface-cardSoft p-5 transition hover:-translate-y-0.5 hover:border-cyan-300/55 hover:shadow-[0_22px_54px_rgba(34,211,238,0.13)] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
              >
                <div className={`absolute inset-x-0 top-0 h-28 bg-gradient-to-b ${accent}`} aria-hidden />
                <div className="relative flex h-full flex-col justify-between">
                  <div>
                    <div className={`grid h-12 w-12 place-items-center rounded-lg border ${iconClass}`}>
                      <Icon size={24} aria-hidden />
                    </div>
                    <h2 className="mt-5 text-3xl font-black text-white">{title}</h2>
                    <p className="mt-2 text-sm font-bold text-slate-400">{label}</p>
                  </div>
                  <div className={`mt-7 inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-black transition ${buttonClass}`}>
                    들어가기
                    <ArrowRight size={16} aria-hidden />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
