import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, BadgeCheck, ReceiptText } from "lucide-react";
import { AppFooter } from "@/components/AppFooter";
import { Header } from "@/components/Header";

export const metadata: Metadata = {
  title: "환불 및 베타 운영정책",
  description: "무제 Beta PRO 베타 환불 및 운영정책"
};

const policies = [
  {
    title: "베타 결제 방식",
    body:
      "정식 자동결제 연결 전까지 PRO는 승인형 유료 베타로 운영됩니다. 사용자가 신청을 남기면 운영자가 계정 확인, 결제 안내, 권한 적용을 수동으로 진행합니다."
  },
  {
    title: "첫 달 환불 기준",
    body:
      "정식 결제 연결 전 유료 베타에서는 첫 결제 후 7일 이내, 서비스 사용 경험이 기대와 다르다고 판단되면 운영자 확인 후 첫 달 결제 금액 환불을 원칙으로 합니다. 단, 악용성 반복 결제·환불은 제한될 수 있습니다."
  },
  {
    title: "기능 변경",
    body:
      "베타 기간에는 판독 기준, PRO 제공 범위, 화면 구성, 가격, 결제 방식이 변경될 수 있습니다. 중요한 변경은 서비스 화면 또는 공지 채널을 통해 안내합니다."
  },
  {
    title: "투자 손실은 환불 사유가 아님",
    body:
      "이 서비스는 매매 신호나 수익 보장을 제공하지 않습니다. 사용자의 매매 손실, 청산, 기회비용은 서비스 이용료 환불 사유가 아닙니다."
  }
];

export default function RefundPage() {
  return (
    <main className="min-h-screen px-4 pb-10">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
        <Header />
        <Link href="/pro" className="inline-flex w-fit items-center gap-2 text-sm font-bold text-slate-400 hover:text-white">
          <ArrowLeft size={16} aria-hidden />
          PRO 안내로 돌아가기
        </Link>

        <section className="rounded-lg border border-surface-line bg-surface-card p-5 shadow-glow">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-accent-blue/25 bg-accent-blue/10 text-accent-blue">
              <ReceiptText size={20} aria-hidden />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white">환불 및 베타 운영정책</h1>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                PRO 베타 월 19,900원 상품 기준입니다.
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4">
            {policies.map((policy) => (
              <section key={policy.title} className="rounded-lg border border-surface-line bg-surface-cardSoft p-4">
                <h2 className="text-base font-bold text-white">{policy.title}</h2>
                <p className="mt-2 text-sm leading-7 text-slate-400">{policy.body}</p>
              </section>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-signal-success/25 bg-signal-success/10 p-4 text-sm leading-6 text-slate-300">
          <div className="flex items-start gap-3">
            <BadgeCheck className="mt-0.5 shrink-0 text-signal-success" size={18} aria-hidden />
            <p>
              환불 정책을 공개해두는 이유는 단순합니다. 이 서비스는 사람을 급하게 결제시키는 상품이 아니라,
              베타 사용자와 함께 판독 기준을 검증하며 만드는 리스크 관리 도구입니다.
            </p>
          </div>
        </section>

        <AppFooter />
      </div>
    </main>
  );
}
