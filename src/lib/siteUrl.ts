// 배포 환경에서 사용할 Chart Radar 기본 URL을 한곳에서 계산한다.
export function getConfiguredSiteUrl() {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;

  const fromVercel = process.env.VERCEL_URL?.replace(/\/$/, "");
  if (fromVercel) return `https://${fromVercel}`;

  return "";
}

export function getSiteUrlWithLocalFallback() {
  return getConfiguredSiteUrl() || "http://127.0.0.1:3000";
}
