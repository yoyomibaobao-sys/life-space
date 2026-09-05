import type { ReactNode } from "react";
import { buildPublicPageMetadata } from "@/lib/public-page-metadata";

export const metadata = buildPublicPageMetadata(
  "集市",
  "浏览围绕耕作、植物与自然生活发布的供需信息；交易在线下或外部平台完成。",
  "/market",
);

export default function MarketLayout({ children }: { children: ReactNode }) {
  return children;
}
