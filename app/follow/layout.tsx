import type { ReactNode } from "react";
import NetworkRequiredBoundary from "@/components/network/NetworkRequiredBoundary";

export default function FollowLayout({ children }: { children: ReactNode }) {
  return <NetworkRequiredBoundary>{children}</NetworkRequiredBoundary>;
}
