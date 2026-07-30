"use client";

import { Suspense } from "react";
import ExperienceCardEditor from "@/components/experience-card/ExperienceCardEditor";

export default function NewExperienceCardPage() {
  return (
    <Suspense fallback={<main style={{ padding: 24 }}>正在准备经验卡...</main>}>
      <ExperienceCardEditor />
    </Suspense>
  );
}
