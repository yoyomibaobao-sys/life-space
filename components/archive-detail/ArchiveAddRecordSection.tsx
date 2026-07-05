"use client";

import AddRecord from "@/app/archive/[id]/AddRecord";
import ArchiveRecordComposer from "@/components/archive-ui/ArchiveRecordComposer";

export default function ArchiveAddRecordSection({
  archiveId,
  archiveIsPublic,
  archiveDefaultRecordVisibility = "private",
  onRecordCreated,
  mobileMode = false,
  open = true,
  onClose,
}: {
  archiveId: string;
  archiveIsPublic: boolean;
  archiveDefaultRecordVisibility?: "public" | "private" | string | null;
  onRecordCreated?: () => void | Promise<void>;
  mobileMode?: boolean;
  open?: boolean;
  onClose?: () => void;
}) {
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
        archiveIsPublic={archiveIsPublic}
        archiveDefaultRecordVisibility={normalizedDefaultVisibility}
        placeholder="记录今天的变化"
        mobileMode={mobileMode}
        onRecordCreated={onRecordCreated}
      />
    </ArchiveRecordComposer>
  );
}
