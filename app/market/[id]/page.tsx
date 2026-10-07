"use client";

import { useParams, useRouter } from "next/navigation";
import MarketDetailController from "@/components/market/MarketDetailController";

export default function MarketDetailPage() {
  const params = useParams();
  const router = useRouter();
  return <MarketDetailController id={String(params?.id || "")} online
    onBack={() => router.push("/market")}
    onDeleted={() => router.push("/market")} />;
}
