"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import UiIcon from "@/components/ui/UiIcon";
import { supabase } from "@/lib/supabase";
import { useLanguage } from "@/lib/i18n/useLanguage";

export default function MobileNotificationLink() {
  const { t } = useLanguage();
  const [userId, setUserId] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadUnreadCount = useCallback(async (targetUserId: string) => {
    const { count, error } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", targetUserId)
      .eq("is_read", false);

    if (!error) setUnreadCount(count || 0);
  }, []);

  useEffect(() => {
    let active = true;

    void supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      const nextUserId = data.user?.id || null;
      setUserId(nextUserId);
      if (nextUserId) void loadUnreadCount(nextUserId);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUserId = session?.user?.id || null;
      setUserId(nextUserId);
      setUnreadCount(0);
      if (nextUserId) void loadUnreadCount(nextUserId);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [loadUnreadCount]);

  useEffect(() => {
    function refreshUnreadCount() {
      if (userId) void loadUnreadCount(userId);
    }

    window.addEventListener("notifications-changed", refreshUnreadCount);
    return () => window.removeEventListener("notifications-changed", refreshUnreadCount);
  }, [loadUnreadCount, userId]);

  if (!userId) return null;

  return (
    <Link
      href="/notifications"
      aria-label={t.nav.notification}
      title={t.nav.notification}
      style={notificationStyle}
    >
      <UiIcon name="bell" size={18} />
      {unreadCount > 0 ? (
        <span style={badgeStyle}>{unreadCount > 9 ? "9+" : unreadCount}</span>
      ) : null}
    </Link>
  );
}

const notificationStyle: CSSProperties = {
  position: "relative",
  width: 34,
  height: 34,
  flex: "0 0 34px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid #dfe8da",
  borderRadius: 999,
  background: "#fff",
  color: "#52634e",
  textDecoration: "none",
};

const badgeStyle: CSSProperties = {
  position: "absolute",
  top: -3,
  right: -3,
  minWidth: 15,
  height: 15,
  padding: "0 3px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: "2px solid #fff",
  borderRadius: 999,
  background: "#c94b3d",
  color: "#fff",
  fontSize: 9,
  fontWeight: 900,
  lineHeight: 1,
  boxSizing: "border-box",
};
