import type { MetadataRoute } from "next";
import { getSiteUrlWithLocalFallback } from "@/lib/siteUrl";

const siteUrl = getSiteUrlWithLocalFallback();

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
