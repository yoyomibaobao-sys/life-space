"use client";

import {
  SummaryCard,
  heroStyle,
  summaryWrapStyle,
  titleStyle,
} from "@/components/follow/FollowShared";
import { useLanguage } from "@/lib/i18n/useLanguage";

export default function FollowHero({
  projectCount,
  userCount,
}: {
  projectCount: number;
  userCount: number;
}) {
  const { t } = useLanguage();

  return (
    <section style={heroStyle}>
      <h1 style={{ ...titleStyle, marginTop: 0 }}>{t.follow.title}</h1>

      <div style={summaryWrapStyle}>
        <SummaryCard label={t.follow.projects} value={projectCount} />
        <SummaryCard label={t.follow.users} value={userCount} />
      </div>
    </section>
  );
}
