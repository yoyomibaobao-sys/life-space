"use client";

import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function DeleteRecordButton({ id }: { id: string }) {
  const router = useRouter();

  async function handleDelete(e: any) {
    // 防止被父层点击影响
    e.stopPropagation();

    const confirmDelete = confirm("确定删除这条记录吗？");
    if (!confirmDelete) return;

    try {
      // 1️⃣ 删除 media（图片记录）
      const { error: mediaError } = await supabase
        .from("media")
        .delete()
        .eq("record_id", id);

      if (mediaError) {
        console.log("删除图片失败:", mediaError);
        alert("删除图片失败");
        return;
      }

      // 2️⃣ 删除 record
      const { error: recordError } = await supabase
        .from("records")
        .delete()
        .eq("id", id);

      if (recordError) {
        console.log("删除记录失败:", recordError);
        alert("删除记录失败");
        return;
      }

      // 3️⃣ 刷新页面
      router.refresh();
    } catch (err) {
      console.log("删除异常:", err);
      alert("删除出错");
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
      删除
    </button>
  );
}