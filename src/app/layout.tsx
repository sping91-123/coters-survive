import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000"),
  title: {
    default: "무제 Beta",
    template: "%s | 무제 Beta"
  },
  description: "진입 전 차트 구조, 손절 기준, 포지션 리스크를 먼저 점검하는 매매 리스크 판독 도구",
  applicationName: "무제 Beta",
  keywords: [
    "매매 리스크",
    "진입 전 점검",
    "차트 판독",
    "포지션 계산",
    "매매 복기",
    "선물 거래",
    "MSB",
    "CHoCH",
    "FVG",
    "OB",
    "POC",
    "리스크 관리"
  ],
  openGraph: {
    title: "무제 Beta",
    description: "진입 전 차트 구조와 포지션 리스크를 먼저 점검하세요.",
    type: "website",
    locale: "ko_KR"
  },
  robots: {
    index: true,
    follow: true
  },
  twitter: {
    card: "summary_large_image",
    title: "무제 Beta",
    description: "진입 전, 내 매매가 기준에 맞는지 먼저 점검하세요."
  },
  appleWebApp: {
    capable: true,
    title: "무제",
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
