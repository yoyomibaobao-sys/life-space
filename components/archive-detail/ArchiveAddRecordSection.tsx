"use client";

import AddRecord from "@/app/archive/[id]/AddRecord";
import ArchiveRecordComposer from "@/components/archive-ui/ArchiveRecordComposer";
import type { ArchiveCycle } from "@/lib/archive-detail-types";
import { useLanguage } from "@/lib/i18n/useLanguage";

export default function ArchiveAddRecordSection({
  archiveId,
  archiveCategory,
  archiveIsPublic,
  activeCycles = [],
  onRecordCreated,
  mobileMode = false,
  open = true,
  onClose,
}: {
  archiveId: string;
  archiveCategory?: string | null;
  archiveIsPublic: boolean;
  activeCycles?: ArchiveCycle[];
  onRecordCreated?: () => void | Promise<void>;
  mobileMode?: boolean;
  open?: boolean;
  onClose?: () => void;
}) {
  const { t } = useLanguage();

  if (mobileMode && !open) return null;

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
        activeCycles={activeCycles}
        placeholder={t.record.placeholder}
        mobileMode={mobileMode}
        onRecordCreated={onRecordCreated}
      />
    </ArchiveRecordComposer>
  );
}
