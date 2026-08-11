"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CSSProperties } from "react";
import { showToast } from "@/components/Toast";
import ConfirmDialog from "@/components/ConfirmDialog";
import { requestCloudTrash } from "@/lib/cloud-trash";
import { useLanguage } from "@/lib/i18n/useLanguage";

export default function DeleteRecordButton({
  id,
  style,
  onDeleted,
}: {
  id: string;
  style?: CSSProperties;
  onDeleted?: (id: string) => void;
}) {
  const { t } = useLanguage();
  const copy = t.archive;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    if (isDeleting) return;
    setIsDeleting(true);

    try {
      const trashed = await requestCloudTrash("records", id);

      if (!trashed) {
        showToast(copy.trash_failed);
        return;
      }

      showToast(copy.moved_to_trash);
      setOpen(false);
      onDeleted?.(id);
      router.refresh();
    } catch {
      showToast(copy.action_failed);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <>
    <button
      type="button"
      disabled={isDeleting}
      onClick={(e) => {
        e.stopPropagation();
        setOpen(true);
      }}
      style={{
        fontSize: "12px",
        color: "#888",
        background: "none",
        border: "none",
        cursor: "pointer",
        position: "relative",
        zIndex: 10,
        padding: 0,
        ...style,
      }}
    >
      {copy.move_to_trash}
    </button>
    <ConfirmDialog
      open={open}
      title={copy.trash_title}
      message={copy.record_trash_message}
      confirmText={isDeleting ? copy.moving_to_trash : copy.move_to_trash}
      cancelText={t.cancel}
      onClose={() => { if (!isDeleting) setOpen(false); }}
      onConfirm={handleDelete}
      confirmDisabled={isDeleting}
      cancelDisabled={isDeleting}
      danger
    />
    </>
  );
}
