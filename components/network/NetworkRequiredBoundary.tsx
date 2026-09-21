"use client";

import { useEffect, useState, type ReactNode } from "react";
import ConnectivityNotice from "@/components/mobile/ConnectivityNotice";
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
      <ConnectivityNotice
        variant="page"
        message={language === "en" ? "Offline" : "未联网"}
      />
    );
  }

  return children;
}
