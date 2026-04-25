"use client";
import { supabase } from "@/lib/supabase";
import { useState, type MouseEvent } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import { showToast } from "@/components/Toast";

export default function ImageViewer({ images }: { images: string[] }) {
  const [index, setIndex] = useState<number | null>(null);
  const [pendingDeleteUrl, setPendingDeleteUrl] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  function next(e: MouseEvent<HTMLDivElement>) {
    e.stopPropagation();
    if (index === null) return;
    setIndex((index + 1) % images.length);
  }

  function prev(e: MouseEvent<HTMLDivElement>) {
    e.stopPropagation();
    if (index === null) return;
    setIndex((index - 1 + images.length) % images.length);
  }

  return (
    <>
      {/* 缩略图 */}
      <div
  style={{
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "8px",
    marginBottom: "10px",
  }}
>
        {images.map((url, i) => (
  <div key={i}>
    <img
      src={url}
      onClick={() => setIndex(i)}
      style={{
  width: "100%",
  aspectRatio: "1/1",
  objectFit: "cover",
  borderRadius: "8px",
  cursor: "pointer",
}}
    />

    {/* 删除按钮 */}
    <div
      onClick={(e) => {
        e.stopPropagation();
        setPendingDeleteUrl(url);
      }}
      style={{
        fontSize: "12px",
        color: "red",
        textAlign: "center",
        cursor: "pointer",
        marginTop: "4px",
      }}
    >
      删除
    </div>
  </div>
))}
      </div>

      <ConfirmDialog
        open={Boolean(pendingDeleteUrl)}
        title="删除图片"
        message="确定删除这张图片吗？删除后无法恢复。"
        confirmText={isDeleting ? "删除中..." : "删除"}
        cancelText="取消"
        onClose={() => { if (!isDeleting) setPendingDeleteUrl(null); }}
        onConfirm={async () => {
          if (!pendingDeleteUrl || isDeleting) return;
          setIsDeleting(true);
          const { error } = await supabase.from("media").delete().eq("url", pendingDeleteUrl);
          if (error) {
            showToast("删除图片失败");
            setIsDeleting(false);
            return;
          }
          showToast("图片已删除");
          location.reload();
        }}
        danger
      />

      {/* 全屏查看 */}
      {index !== null && (
        <div
          onClick={() => setIndex(null)}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            background: "rgba(0,0,0,0.85)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 999,
          }}
        >
          {/* 左按钮 */}
          <div
            onClick={prev}
            style={{
              position: "absolute",
              left: "20px",
              fontSize: "40px",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            ‹
          </div>

          {/* 图片 */}
          <img
            src={images[index]}
            style={{
              maxWidth: "90%",
              maxHeight: "90%",
            }}
          />

          {/* 右按钮 */}
          <div
            onClick={next}
            style={{
              position: "absolute",
              right: "20px",
              fontSize: "40px",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            ›
          </div>
        </div>
      )}
    </>
  );
}