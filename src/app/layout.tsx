import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "포지션가드",
    template: "%s | 포지션가드"
  },
  description: "진입 전, 내 매매가 위험한지 먼저 점검하는 매매 리스크 관리 도구",
  applicationName: "포지션가드",
  keywords: [
    "포지션가드",
    "진입 전 점검",
    "매매 리스크",
    "포지션 계산",
    "매매 복기",
    "비트코인",
    "MSB",
    "CHoCH",
    "FVG",
    "OB",
    "리스크관리"
  ],
  openGraph: {
    title: "포지션가드",
    description: "진입 전, 차트 구조와 포지션 리스크를 먼저 확인하세요.",
    type: "website",
    locale: "ko_KR"
  },
  robots: {
    index: true,
    follow: true
  },
  twitter: {
    card: "summary_large_image",
    title: "포지션가드",
    description: "진입 전, 내 매매가 위험한지 먼저 점검하세요."
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
