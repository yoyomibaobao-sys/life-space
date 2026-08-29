import type { ReactNode } from "react";
import type { ArchiveCategory } from "@/lib/archive-categories";
import type { UiIconName } from "@/components/ui/UiIcon";

export type ArchiveMode = "cloud" | "local";

export type ArchiveFeatureFlags = {
  canPublish: boolean;
  canAskHelp: boolean;
  canComment: boolean;
  canMarket: boolean;
  canSync?: boolean;
};

export type ArchiveCategoryFilterValue = ArchiveCategory | null;

export type ArchiveProjectCoverView =
  | { kind: "url"; url: string; alt?: string }
  | { kind: "blob"; blob: Blob; alt?: string }
  | null;

export type ArchiveProjectView = {
  id: string;
  mode: ArchiveMode;
  title: string;
  category: ArchiveCategory;
  plantId?: string | null;
  plantSlug?: string | null;
  categoryLabel: string;
  categoryIcon: UiIconName;
  systemName: string;
  subcategoryLabel?: string | null;
  groupLabel?: string | null;
  cover?: ArchiveProjectCoverView;
  latestText?: string | null;
  latestTime?: string | null;
  recordCount?: number | null;
  durationDays?: number | null;
  viewCount?: number | null;
  followerCount?: number | null;
  commentCount?: number | null;
  activityText?: string | null;
  mobilePrimaryStatsText?: string | null;
  mobileSecondaryStatsText?: string | null;
  footerItems?: string[];
  badges?: string[];
  helpLabel?: string | null;
  statusLabel?: string | null;
  visibilityLabel?: string | null;
  visibilityTone?: "public" | "private" | "neutral";
  storageLabel?: string | null;
  storageTone?: "cloud" | "device";
  ended?: boolean;
  showClassificationRow?: boolean;
  href?: string;
};

export type ArchiveMediaView =
  | {
      id: string;
      kind: "url";
      url: string;
      alt?: string;
    }
  | {
      id: string;
      kind: "blob";
      blob: Blob;
      alt?: string;
    };

export type ArchiveRecordView = {
  id: string;
  metaText: string;
  note?: string | null;
  media: ArchiveMediaView[];
  footerItems?: string[];
  emptyNoteText?: string;
};

export type ArchiveActionSlot = ReactNode;
