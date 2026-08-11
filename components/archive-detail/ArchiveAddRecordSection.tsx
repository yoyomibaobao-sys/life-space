"use client";

import AddRecord from "@/app/archive/[id]/AddRecord";
import ArchiveRecordComposer from "@/components/archive-ui/ArchiveRecordComposer";
import type { ArchiveCycle } from "@/lib/archive-detail-types";
import { useLanguage } from "@/lib/i18n/useLanguage";

export default function ArchiveAddRecordSection({
  archiveId,
  archiveCategory,
  archiveIsPublic,
  archiveDefaultRecordVisibility = "private",
  activeCycles = [],
  onRecordCreated,
  mobileMode = false,
  open = true,
  onClose,
}: {
  archiveId: string;
  archiveCategory?: string | null;
  archiveIsPublic: boolean;
  archiveDefaultRecordVisibility?: "public" | "private" | string | null;
  activeCycles?: ArchiveCycle[];
  onRecordCreated?: () => void | Promise<void>;
  mobileMode?: boolean;
  open?: boolean;
  onClose?: () => void;
}) {
  const { t } = useLanguage();

  if (mobileMode && !open) return null;

  const normalizedDefaultVisibility =
    archiveDefaultRecordVisibility === "public" ? "public" : "private";

  return (
    <ArchiveRecordComposer
      mobileMode={mobileMode}
      open={open}
      onClose={onClose}
    >
      <AddRecord
        archiveId={archiveId}
        archiveCategory={archiveCategory}
        archiveIsPublic={archiveIsPublic}
        archiveDefaultRecordVisibility={normalizedDefaultVisibility}
        activeCycles={activeCycles}
        placeholder={t.record.placeholder}
        mobileMode={mobileMode}
        onRecordCreated={onRecordCreated}
      />
    </ArchiveRecordComposer>
  );
}
