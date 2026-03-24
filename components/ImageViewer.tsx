"use client";
import { supabase } from "@/lib/supabase";
import { useState } from "react";

export default function ImageViewer({ images }: { images: string[] }) {
  const [index, setIndex] = useState<number | null>(null);

  function next(e: any) {
    e.stopPropagation();
    if (index === null) return;
    setIndex((index + 1) % images.length);
  }

  function prev(e: any) {
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
      onClick={async (e) => {
        e.stopPropagation();

        const confirmDelete = confirm("删除这张图片？");
        if (!confirmDelete) return;

        const { error } = await supabase
          .from("media")
          .delete()
          .eq("url", url);

        if (error) {
          alert("删除失败");
          return;
        }

        location.reload();
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