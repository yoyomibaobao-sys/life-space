"use client";

import {
  type CSSProperties,
  type ReactNode,
} from "react";
import ArchiveToolbar from "@/components/archive/ArchiveToolbar";
import ArchiveSourceSwitcher, {
  type ArchiveSourceOption,
} from "@/components/archive-ui/ArchiveSourceSwitcher";
import ConnectivityNotice from "@/components/mobile/ConnectivityNotice";
import type { ArchiveCategory } from "@/lib/archive-categories";
import { useLanguage } from "@/lib/i18n/useLanguage";
import { useCloudAvailability } from "@/lib/use-cloud-availability";

type Props<T extends string> = {
  statsText?: ReactNode;
  sourceOptions: Array<ArchiveSourceOption<T>>;
  activeSource: T;
  onSelectSource: (source: T) => void;
  onCreateArchive: (category: ArchiveCategory) => void;
  createDisabled?: boolean;
  createDisabledTitle?: string;
  createDisabledHref?: string;
  showCreateToolbar?: boolean;
  filtersSlot?: ReactNode;
  noticeSlot?: ReactNode;
  sourceTrailingSlot?: ReactNode;
  children: ReactNode;
};

export default function ArchiveWorkspaceTemplate<T extends string>({
  statsText,
  sourceOptions,
  activeSource,
  onSelectSource,
  onCreateArchive,
  createDisabled,
  createDisabledTitle,
  createDisabledHref,
  showCreateToolbar = true,
  filtersSlot,
  noticeSlot,
  sourceTrailingSlot,
  children,
}: Props<T>) {
  const { t } = useLanguage();
  const { cloudUnavailable } = useCloudAvailability();

  return (
    <>
      {statsText ? <div style={statsStyle}>{statsText}</div> : null}

      <ArchiveSourceSwitcher
        options={sourceOptions}
        activeValue={activeSource}
        onSelect={onSelectSource}
        trailingSlot={sourceTrailingSlot}
      />

      {showCreateToolbar ? (
        <ArchiveToolbar
          onCreateArchive={onCreateArchive}
          createDisabled={createDisabled}
          createDisabledTitle={createDisabledTitle}
          createDisabledHref={createDisabledHref}
        />
      ) : null}

      {filtersSlot}
      {cloudUnavailable ? (
        <ConnectivityNotice message={t.archive_workspace.offline_notice} />
      ) : null}
      {noticeSlot}

      <section style={projectListStyle}>{children}</section>
    </>
  );
}

const statsStyle: CSSProperties = {
  fontSize: 14,
  color: "#6f7b6a",
  marginBottom: 18,
};

const projectListStyle: CSSProperties = {
  marginTop: 0,
};
