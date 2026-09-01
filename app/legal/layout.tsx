import type { ReactNode } from "react";
import { buildPublicPageMetadata } from "@/lib/public-page-metadata";

export const metadata = buildPublicPageMetadata(
  "隐私、服务与退款说明",
  "查看有时·耕作的隐私说明、服务条款、退款规则与运营联系信息。",
  "/legal",
);

export default function LegalLayout({ children }: { children: ReactNode }) {
  return children;
}
