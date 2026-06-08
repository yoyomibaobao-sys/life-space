"use client";

import { useState } from "react";

type Props = {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
};

export default function PasswordInput({
  value,
  onChange,
  placeholder = "请输入密码",
}: Props) {
  const [show, setShow] = useState(false);

  return (
    <div style={{ position: "relative" }}>
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%",
          padding: "12px 44px 12px 12px",
          borderRadius: "6px",
          border: "1px solid #ccc",
          boxSizing: "border-box",
        }}
      />

      <button
        type="button"
        onClick={() => setShow(!show)}
        aria-label={show ? "隐藏密码" : "显示密码"}
        style={{
          position: "absolute",
          right: 0,
          top: "50%",
          transform: "translateY(-50%)",
          cursor: "pointer",
          fontSize: 16,
          color: "#666",
          width: 40,
          height: 40,
          border: "none",
          background: "transparent",
          padding: 0,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {show ? "🙈" : "👁"}
      </button>
    </div>
  );
}
