import type { MetadataRoute } from "next";
import { getConfiguredSiteUrl } from "@/lib/siteUrl";

const siteUrl = getConfiguredSiteUrl();

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/"]
    },
    sitemap: siteUrl ? `${siteUrl}/sitemap.xml` : undefined
  };
}
