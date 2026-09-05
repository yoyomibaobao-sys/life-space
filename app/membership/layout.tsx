import type { ReactNode } from "react";
import { buildPublicPageMetadata } from "@/lib/public-page-metadata";

export const metadata = buildPublicPageMetadata(
  "会员类别与权限",
  "了解 LifeSpace·自然的本地免费功能、云端体验、云会员容量、公开互动和付款规则。",
  "/membership",
);

export default function MembershipLayout({ children }: { children: ReactNode }) {
  return children;
}
