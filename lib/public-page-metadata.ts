import type { Metadata } from "next";

export function buildPublicPageMetadata(
  title: string,
  description: string,
  path: string,
): Metadata {
  return {
    title,
    description,
    openGraph: {
      title: `${title} | 有时·耕作`,
      description,
      url: path,
    },
    twitter: {
      card: "summary",
      title: `${title} | 有时·耕作`,
      description,
    },
  };
}
