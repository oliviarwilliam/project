import type { MetadataRoute } from "next";
import { site } from "@/data/site";

export default function manifest(): MetadataRoute.Manifest {
  const icon = (src: string) => [{ src, sizes: "192x192", type: "image/png" }];

  return {
    id: "/",
    name: site.name,
    short_name: site.name,
    description: site.description,
    lang: "en",
    dir: "ltr",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    prefer_related_applications: false,
    orientation: "portrait",
    background_color: "#f7f8fa",
    theme_color: "#1f54d6",
    categories: ["finance", "education"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Wallet", url: "/wallet", icons: icon("/icons/icon-192.png") },
      { name: "Packages", url: "/packages", icons: icon("/icons/icon-192.png") },
      { name: "Withdrawals", url: "/withdrawals", icons: icon("/icons/icon-192.png") },
    ],
  };
}
