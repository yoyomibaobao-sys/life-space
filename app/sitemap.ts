import type { MetadataRoute } from "next";

const siteUrl = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://life-space-gules.vercel.app"
).replace(/\/$/, "");

const publicRoutes = [
  "",
  "/discover",
  "/experience",
  "/plant",
  "/market",
  "/membership",
  "/legal",
  "/legal/privacy",
  "/legal/terms",
  "/legal/refunds",
  "/legal/contact",
];

export default function sitemap(): MetadataRoute.Sitemap {
  return publicRoutes.map((path) => ({
    url: `${siteUrl}${path}`,
    changeFrequency: path === "" ? "weekly" : "monthly",
    priority: path === "" ? 1 : path === "/discover" ? 0.9 : 0.7,
  }));
}
