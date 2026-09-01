import type { ReactNode } from "react";
import { buildPublicPageMetadata } from "@/lib/public-page-metadata";

export const metadata = buildPublicPageMetadata(
  "经验",
  "查看由真实耕作记录整理而成的公开经验卡。",
  "/experience",
);

export default function ExperienceLayout({ children }: { children: ReactNode }) {
  return children;
}
