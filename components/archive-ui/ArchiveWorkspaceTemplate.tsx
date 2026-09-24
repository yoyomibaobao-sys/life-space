"use client";

import {
  useEffect,
  useState,
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
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const refresh = () => setOnline(navigator.onLine);
    refresh();
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    return () => {
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
    };
  }, []);

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
      {!online ? (
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
