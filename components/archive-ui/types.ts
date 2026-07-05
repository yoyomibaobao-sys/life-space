import type { ReactNode } from "react";
import type { ArchiveCategory } from "@/lib/archive-categories";

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
  categoryIcon: string;
  systemName: string;
  subcategoryLabel?: string | null;
  groupLabel?: string | null;
  cover?: ArchiveProjectCoverView;
  latestText?: string | null;
  activityText?: string | null;
  footerItems?: string[];
  badges?: string[];
  statusLabel?: string | null;
  visibilityLabel?: string | null;
  visibilityTone?: "public" | "private" | "neutral";
  ended?: boolean;
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
