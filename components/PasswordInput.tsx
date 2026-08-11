"use client";

import { useState } from "react";
import UiIcon from "@/components/ui/UiIcon";
import { useLanguage } from "@/lib/i18n/useLanguage";

type Props = {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
};

export default function PasswordInput({
  value,
  onChange,
  placeholder,
}: Props) {
  const { t } = useLanguage();
  const [show, setShow] = useState(false);

  return (
    <div style={{ position: "relative" }}>
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || t.auth.password_placeholder}
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
        aria-label={show ? t.auth.hide_password : t.auth.show_password}
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
        <UiIcon name={show ? "eye-off" : "eye"} size={18} />
      </button>
    </div>
  );
}
