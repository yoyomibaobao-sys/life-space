"use client";

import { useParams, useSearchParams } from "next/navigation";
import GuideDetailView from "@/components/plant-detail/GuideDetailView";

export default function PublicGuideDetailPage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  return <GuideDetailView id={params.id} search={search.toString()} />;
}
