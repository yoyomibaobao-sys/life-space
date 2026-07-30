"use client";

import { Suspense, use } from "react";
import ExperienceCardEditor from "@/components/experience-card/ExperienceCardEditor";

export default function EditExperienceCardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <Suspense fallback={<main style={{ padding: 24 }}>正在准备经验卡...</main>}>
      <ExperienceCardEditor cardId={id} />
    </Suspense>
  );
}
