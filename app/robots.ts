import type { MetadataRoute } from "next";

const siteUrl = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://life-space-gules.vercel.app"
).replace(/\/$/, "");

export default function robots(): MetadataRoute.Robots {
  if (process.env.SEARCH_INDEXING_ENABLED !== "true") {
    return {
      rules: [{ userAgent: "*", disallow: "/" }],
    };
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin/",
          "/api/",
          "/archive/",
          "/experience-cards/",
          "/follow/",
          "/local/",
          "/login/",
          "/market/messages/",
          "/market/mine/",
          "/market/new/",
          "/membership/payment/",
          "/membership/refund/",
          "/notifications/",
          "/profile/",
          "/quick-record/",
          "/register/",
          "/reset-password/",
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
