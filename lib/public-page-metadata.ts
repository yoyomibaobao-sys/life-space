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
      title: `${title} | LifeSpace·自然`,
      description,
      url: path,
      siteName: "LifeSpace·自然",
    },
    twitter: {
      card: "summary",
      title: `${title} | LifeSpace·自然`,
      description,
    },
  };
}
