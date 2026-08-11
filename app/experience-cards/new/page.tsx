"use client";

import { Suspense } from "react";
import ExperienceCardEditor from "@/components/experience-card/ExperienceCardEditor";
import { useLanguage } from "@/lib/i18n/useLanguage";

export default function NewExperienceCardPage() {
  const { t } = useLanguage();

  return (
    <Suspense fallback={<main style={{ padding: 24 }}>{t.experience.preparing_card}</main>}>
      <ExperienceCardEditor />
    </Suspense>
  );
}
