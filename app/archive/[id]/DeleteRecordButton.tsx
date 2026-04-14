"use client";

import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { t } from "@/lib/i18n";
import { showToast } from "@/components/Toast";

export default function DeleteRecordButton({ id }: { id: string }) {
  const router = useRouter();

  async function handleDelete(e: any) {
    // 防止被父层点击影响
    e.stopPropagation();

    const confirmDelete = confirm(t.confirm_delete);
    if (!confirmDelete) return;

    try {
      // 1️⃣ 删除 media（图片记录）
      const { error: mediaError } = await supabase
        .from("media")
        .delete()
        .eq("record_id", id);

      if (mediaError) {
        console.log("删除图片失败:", mediaError);
        showToast(t.delete_failed);
        return;
      }

      // 2️⃣ 删除 record
      const { error: recordError } = await supabase
        .from("records")
        .delete()
        .eq("id", id);

      if (recordError) {
        console.log("删除记录失败:", recordError);
       showToast(t.delete_failed);
        return;
      }

      // 3️⃣ 刷新页面
     showToast(t.delete_success);

setTimeout(() => {
  router.refresh();
}, 800);
    } catch (err) {
      console.log("删除异常:", err);
      showToast(t.error);
    }
  }

  return (
    <button
      onClick={handleDelete}
      style={{
        marginTop: "5px",
        fontSize: "12px",
        color: "#888",
        background: "none",
        border: "none",
        cursor: "pointer",
        position: "relative",
        zIndex: 10,
      }}
    >
      {t.delete}
    </button>
  );
}