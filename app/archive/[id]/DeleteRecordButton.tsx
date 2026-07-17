"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CSSProperties } from "react";
import { showToast } from "@/components/Toast";
import ConfirmDialog from "@/components/ConfirmDialog";
import { requestCloudTrash } from "@/lib/cloud-trash";

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
      const trashed = await requestCloudTrash("records", id);

      if (!trashed) {
        showToast("移入回收站失败");
        return;
      }

      showToast("已移入回收站");
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
      移入回收站
    </button>
    <ConfirmDialog
      open={open}
      title="移入回收站"
      message="记录和照片将移入回收站。与该记录相关的评论、点赞等互动信息将立即删除，无法恢复。"
      confirmText={isDeleting ? "移入中..." : "移入回收站"}
      cancelText="取消"
      onClose={() => { if (!isDeleting) setOpen(false); }}
      onConfirm={handleDelete}
      confirmDisabled={isDeleting}
      cancelDisabled={isDeleting}
      danger
    />
    </>
  );
}
