import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/admin", "/dashboard", "/wallet", "/withdrawals", "/packages", "/profile", "/notifications", "/reset-password", "/verify-phone"] },
    sitemap: `${env.siteUrl}/sitemap.xml`,
  };
}
