"use client";

import ArchiveProjectCard from "@/components/archive-ui/ArchiveProjectCard";
import type { ArchiveProjectView } from "@/components/archive-ui/types";
import {
  getArchiveCategoryIcon,
  getArchiveCategoryLabel,
  type ArchiveCategory,
} from "@/lib/archive-categories";
import { getDurationDays } from "@/lib/follow-utils";
import type { ArchiveStat, UserSpaceArchive, UserSpaceTag } from "@/lib/user-space-types";
import { getGroupTagName, getSubTagName } from "@/lib/user-space-utils";
import { getArchiveDisplayName } from "@/lib/social-space-shared";
import { useLanguage } from "@/lib/i18n/useLanguage";
import {
  getArchiveCategoryDepth,
  type ArchiveCategoryDepths,
} from "@/lib/archive-category-settings";

type Props = {
  archives: UserSpaceArchive[];
  subTags: UserSpaceTag[];
  groupTags: UserSpaceTag[];
  statsMap: Record<string, ArchiveStat>;
  coverMap: Record<string, string>;
  archiveFollowerCounts: Record<string, number>;
  categoryDepths: ArchiveCategoryDepths;
};

export default function UserSpaceArchiveList({
  archives,
  subTags,
  groupTags,
  statsMap,
  coverMap,
  archiveFollowerCounts,
  categoryDepths,
}: Props) {
  const { language, t } = useLanguage();

  if (archives.length === 0) {
    return <div style={emptyStyle}>{t.profile.space.no_public_projects}</div>;
  }

  return (
    <section>
      {archives.map((archive) => {
        const stat = statsMap[archive.id];
        const latest = stat?.latest;
        const cover = coverMap[archive.id];
        const category = normalizeCategory(archive.category);
        const isEnded = archive.status === "ended";
        const maxDepth = getArchiveCategoryDepth(categoryDepths, category);

        const project: ArchiveProjectView = {
          id: archive.id,
          mode: "cloud",
          title: archive.title || t.profile.public_profile.unnamed_project,
          systemName:
            archive.system_name ||
            archive.species_name_snapshot ||
            t.profile.public_profile.not_provided,
          category,
          categoryLabel: getArchiveCategoryLabel(category, language),
          categoryIcon: getArchiveCategoryIcon(category),
          subcategoryLabel: maxDepth >= 2 ? getSubTagName(subTags, archive.sub_tag_id, language) : null,
          groupLabel: maxDepth >= 3 ? getGroupTagName(groupTags, archive.group_tag_id) : null,
          cover: cover
            ? {
                kind: "url",
                url: cover,
                alt: getArchiveDisplayName(archive.title, archive.system_name, language),
              }
            : null,
          latestText: latest?.note || t.profile.space.no_public_records,
          latestTime: latest?.record_time || null,
          recordCount: stat?.count || archive.record_count || 0,
          durationDays: getDurationDays(archive.created_at, archive.ended_at),
          followerCount: archiveFollowerCounts[archive.id] || 0,
          helpLabel: stat?.hasHelp ? t.profile.space.help : null,
          statusLabel: isEnded ? t.profile.space.ended : null,
          ended: isEnded,
          // Keep the public-space card on the same five-row structure as the
          // owner's card even when this category only enables one level.
          showClassificationRow: true,
          href: `/archive/${archive.id}`,
        };

        return (
          <ArchiveProjectCard
            key={archive.id}
            project={project}
            mobileMode
          />
        );
      })}
    </section>
  );
}

function normalizeCategory(value?: string | null): ArchiveCategory {
  if (value === "system" || value === "insect_fish" || value === "other") return value;
  return "plant";
}

const emptyStyle = {
  border: "1px solid #edf1e8",
  borderRadius: 16,
  padding: 28,
  textAlign: "center",
  color: "#8b9487",
  background: "#fff",
} as const;
