"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CSSProperties } from "react";
import { t } from "@/lib/i18n";
import { showToast } from "@/components/Toast";
import ConfirmDialog from "@/components/ConfirmDialog";
import { requestCloudDeletion } from "@/lib/cloud-deletion";

export default function DeleteRecordButton({
  id,
  style,
  onDeleted,
}: {
  id: string;
  style?: CSSProperties;
  onDeleted?: (id: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    if (isDeleting) return;
    setIsDeleting(true);

    try {
      const deleted = await requestCloudDeletion("records", id);

      if (!deleted) {
        showToast("删除失败");
        return;
      }

      showToast("记录已删除");
      setOpen(false);
      onDeleted?.(id);
      router.refresh();
    } catch {
      showToast("操作失败");
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
      {t.delete}
    </button>
    <ConfirmDialog
      open={open}
      title="删除记录"
      message="确定删除这条记录吗？其中的图片也会一起删除，删除后无法恢复。"
      confirmText={isDeleting ? "删除中..." : "删除"}
      cancelText="取消"
      onClose={() => { if (!isDeleting) setOpen(false); }}
      onConfirm={handleDelete}
      danger
    />
    </>
  );
}
