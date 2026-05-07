import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000"),
  title: {
    default: "차트 레이더 Beta",
    template: "%s | 차트 레이더"
  },
  description: "진입 전 차트 구조, 손절 기준, 포지션 리스크를 먼저 감지하는 코인 분석 레이더",
  applicationName: "Chart Radar",
  keywords: [
    "매매 리스크",
    "진입 전 점검",
    "차트 판독",
    "차트 레이더",
    "Chart Radar",
    "포지션 계산",
    "매매 복기",
    "코인 분석",
    "MSB",
    "CHoCH",
    "FVG",
    "OB",
    "POC",
    "리스크 관리"
  ],
  openGraph: {
    title: "차트 레이더 Beta",
    description: "진입 전 차트 구조와 포지션 리스크를 먼저 감지하세요.",
    type: "website",
    locale: "ko_KR"
  },
  robots: {
    index: true,
    follow: true
  },
  twitter: {
    card: "summary_large_image",
    title: "차트 레이더 Beta",
    description: "진입 전, 차트 구조와 리스크를 먼저 감지하세요."
  },
  appleWebApp: {
    capable: true,
    title: "차트 레이더",
    statusBarStyle: "black-translucent"
  },
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg"
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
