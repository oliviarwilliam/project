import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/login", "/register"].map((path) => ({ url: `${env.siteUrl}${path}`, changeFrequency: "monthly" as const }));
}
