import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "";

const routes = [
  "",
  "/survival",
  "/alts",
  "/news",
  "/diagnosis",
  "/calculator",
  "/journal",
  "/learn",
  "/terms",
  "/privacy",
  "/refund"
];

export default function sitemap(): MetadataRoute.Sitemap {
  if (!siteUrl) return [];

  const lastModified = new Date();

  return routes.map((route) => ({
    url: `${siteUrl}${route}`,
    lastModified,
    changeFrequency: route === "" || route === "/survival" ? "daily" : "weekly",
    priority: route === "" ? 1 : route === "/survival" ? 0.9 : 0.6
  }));
}
