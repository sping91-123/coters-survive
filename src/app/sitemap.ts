import type { MetadataRoute } from "next";

function getSiteUrl() {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  return "http://127.0.0.1:3000";
}

const siteUrl = getSiteUrl();

const routes = [
  "",
  "/survival",
  "/alts",
  "/global",
  "/stocks",
  "/news",
  "/alerts",
  "/pro",
  "/calculator",
  "/journal",
  "/terms",
  "/privacy",
  "/refund"
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return routes.map((route) => ({
    url: `${siteUrl}${route}`,
    lastModified,
    changeFrequency: route === "" || route === "/survival" ? "daily" : "weekly",
    priority: route === "" ? 1 : route === "/survival" ? 0.9 : 0.6
  }));
}
