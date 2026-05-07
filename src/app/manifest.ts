import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "차트 레이더 Beta",
    short_name: "차트 레이더",
    description: "진입 전 차트 구조와 포지션 리스크를 먼저 감지하는 코인 분석 레이더",
    start_url: "/survival",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#050608",
    theme_color: "#0ea5e9",
    categories: ["finance", "productivity", "education"],
    lang: "ko-KR",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable"
      }
    ]
  };
}
