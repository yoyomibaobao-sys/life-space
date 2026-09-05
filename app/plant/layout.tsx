import type { ReactNode } from "react";
import { buildPublicPageMetadata } from "@/lib/public-page-metadata";

export const metadata = buildPublicPageMetadata(
  "指引",
  "查找种植、农法设施、虫鱼生态与其他自然生活指引。",
  "/plant",
);

export default function PlantLayout({ children }: { children: ReactNode }) {
  return children;
}
