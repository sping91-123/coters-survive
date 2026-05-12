import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, FileText, ShieldAlert } from "lucide-react";
import { AppFooter } from "@/components/AppFooter";
import { Header } from "@/components/Header";

export const metadata: Metadata = {
  title: "이용약관",
  description: "Chart Radar 이용약관"
};

const sections = [
  {
    title: "1. 서비스 목적",
    body:
      "이 서비스는 사용자가 진입 전 차트 구조, 포지션 리스크, 손절 기준, 복기 내용을 정리하도록 돕는 교육용 보조 도구입니다. 제공되는 정보는 투자 자문, 매수·매도 추천, 수익 보장, 자동매매 지시가 아닙니다."
  },
  {
    title: "2. 사용자 책임",
    body:
      "레버리지 거래와 파생상품 거래는 원금 손실과 청산 위험이 큽니다. 사용자는 서비스가 표시하는 판독, 후보, 계산 결과를 참고 정보로만 사용해야 하며, 모든 투자 판단과 결과에 대한 책임은 사용자 본인에게 있습니다."
  },
  {
    title: "3. 서비스 기능",
    body:
      "서비스의 기능, 화면, 판독 기준, 저장 방식, 운영 방식은 사용자 피드백과 안정성 검토에 따라 변경될 수 있습니다. 중요한 복기와 설정은 사용자가 별도로 백업하는 것을 권장합니다."
  },
  {
    title: "4. 유료 구독과 결제",
    body:
      "Chart Radar Pro는 월간 또는 연간 구독 방식으로 제공될 수 있습니다. 웹 결제는 결제 대행사를 통해 처리되고, iOS 앱 내 구독은 App Store 결제 정책을 따릅니다. 구독 해지와 환불 안내는 별도 페이지에서 확인할 수 있습니다."
  },
  {
    title: "5. 금지 행위",
    body:
      "서비스를 무단 복제하거나, 자동화된 방식으로 과도하게 호출하거나, 타인의 계정을 사용하거나, 서비스 결과를 투자 자문·확정 신호처럼 재판매하는 행위를 금지합니다."
  },
  {
    title: "6. 면책",
    body:
      "서비스는 외부 거래소 데이터, 네트워크 상태, 브라우저 환경, 판독 로직의 한계에 영향을 받을 수 있습니다. 서비스 제공자는 데이터 지연, 오류, 중단, 사용자의 매매 손실에 대해 책임을 지지 않습니다."
  },
  {
    title: "7. 약관 변경",
    body:
      "운영자는 서비스 개선과 법적 요구에 따라 약관을 변경할 수 있습니다. 중요한 변경이 있을 경우 서비스 화면 또는 공지 채널을 통해 안내합니다."
  }
];

export default function TermsPage() {
  return (
    <main className="min-h-screen px-4 pb-10">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
        <Header />
        <Link href="/survival" className="inline-flex w-fit items-center gap-2 text-sm font-bold text-slate-400 hover:text-white">
          <ArrowLeft size={16} aria-hidden />
          서비스로 돌아가기
        </Link>

        <section className="rounded-lg border border-surface-line bg-surface-card p-5 shadow-glow">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-accent-blue/25 bg-accent-blue/10 text-accent-blue">
              <FileText size={20} aria-hidden />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white">이용약관</h1>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                시행일: 2026년 5월 7일 · 정식 서비스 기준
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4">
            {sections.map((section) => (
              <section key={section.title} className="rounded-lg border border-surface-line bg-surface-cardSoft p-4">
                <h2 className="text-base font-bold text-white">{section.title}</h2>
                <p className="mt-2 text-sm leading-7 text-slate-400">{section.body}</p>
              </section>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-signal-warning/25 bg-signal-warning/10 p-4 text-sm leading-6 text-signal-warning">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 shrink-0" size={18} aria-hidden />
            <p>
              본 약관은 Chart Radar 서비스 이용을 위한 기본 문서입니다. 결제, 앱 이용, 데이터 제공 범위,
              해외 서비스 이용 조건은 실제 운영 정책과 관련 법령에 따라 적용됩니다.
            </p>
          </div>
        </section>

        <AppFooter />
      </div>
    </main>
  );
}
