"use client";

import { useEffect, useState } from "react";

let globalShow: (msg: string) => void;

// ✅ 必须有这个导出
export function showToast(msg: string) {
  globalShow?.(msg);
}

// ✅ 默认导出组件
export default function Toast() {
  const [message, setMessage] = useState("");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    globalShow = (msg: string) => {
      setMessage(msg);
      setVisible(true);

      setTimeout(() => {
        setVisible(false);
      }, 2000);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: "80px",
        left: "50%",
        transform: "translateX(-50%)",
        background: "rgba(0,0,0,0.8)",
        color: "#fff",
        padding: "10px 16px",
        borderRadius: "20px",
        fontSize: "14px",
        zIndex: 9999,
      }}
    >
      {message}
    </div>
  );
}