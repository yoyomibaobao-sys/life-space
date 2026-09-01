import type { ReactNode } from "react";
import { buildPublicPageMetadata } from "@/lib/public-page-metadata";

export const metadata = buildPublicPageMetadata(
  "发现",
  "浏览用户主动公开的耕作项目、观察记录与自然生活实践。",
  "/discover",
);

export default function DiscoverLayout({ children }: { children: ReactNode }) {
  return children;
}
