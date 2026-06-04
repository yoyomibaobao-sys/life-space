"use client";

import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CSSProperties } from "react";
import { t } from "@/lib/i18n";
import { showToast } from "@/components/Toast";
import ConfirmDialog from "@/components/ConfirmDialog";
import {
  removeMediaFilesFromStorage,
  subtractStorageUsed,
  sumMediaSizeBytes,
} from "@/lib/storage-usage";
import type { MediaItem } from "@/lib/domain-types";

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
      const { data: mediaItemsRaw } = await supabase
        .from("media")
        .select("id, url, storage_path, thumb_path, size_mb, size_bytes, user_id")
        .eq("record_id", id);
      const mediaItems = (mediaItemsRaw || []) as MediaItem[];
      const deletedBytes = sumMediaSizeBytes(mediaItems);
      const ownerId = mediaItems.find((media) => media.user_id)?.user_id;

      await removeMediaFilesFromStorage(mediaItems);

      const { error: recordError } = await supabase
        .from("records")
        .delete()
        .eq("id", id);

      if (recordError) {
        console.log("鍒犻櫎璁板綍澶辫触:", recordError);
        showToast("鍒犻櫎澶辫触");
        return;
      }

      if (deletedBytes > 0) {
        await subtractStorageUsed(ownerId, deletedBytes);
      }

      showToast("鍒犻櫎鎴愬姛锛屽閲忓凡閲婃斁");
      setOpen(false);
      onDeleted?.(id);
      router.refresh();
    } catch (err) {
      console.log("鍒犻櫎寮傚父:", err);
      showToast("鎿嶄綔澶辫触");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <>
    <button
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
      title="鍒犻櫎璁板綍"
      message="纭畾鍒犻櫎杩欐潯璁板綍鍚楋紵鍏朵腑鐨勫浘鐗囦篃浼氫竴璧峰垹闄わ紝鍒犻櫎鍚庢棤娉曟仮澶嶃€?
      confirmText={isDeleting ? "鍒犻櫎涓?.." : "鍒犻櫎"}
      cancelText="鍙栨秷"
      onClose={() => { if (!isDeleting) setOpen(false); }}
      onConfirm={handleDelete}
      danger
    />
    </>
  );
}

