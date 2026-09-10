"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useLanguage } from "@/lib/i18n/useLanguage";

export default function NetworkRequiredBoundary({ children }: { children: ReactNode }) {
  const { language } = useLanguage();
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const refresh = () => setOnline(navigator.onLine);
    refresh();
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    return () => {
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
    };
  }, []);

  if (!online) {
    return (
      <div
        role="status"
        aria-live="polite"
        style={{
          minHeight: "46vh",
          display: "grid",
          placeItems: "center",
          padding: 24,
          color: "#788276",
          fontSize: 15,
          fontWeight: 650,
          textAlign: "center",
        }}
      >
        {language === "en" ? "Offline" : "未联网"}
      </div>
    );
  }

  return children;
}
