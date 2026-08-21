"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { supabase } from "@/lib/supabase";
import { MARKET_NOTIFICATION_TYPES } from "@/lib/notification-types";
import { useLanguage } from "@/lib/i18n/useLanguage";

export default function MarketMessageLink({ compact = false }: { compact?: boolean }) {
  const { t } = useLanguage();
  const [userId, setUserId] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadUnreadCount = useCallback(async (targetUserId: string) => {
    const { count, error } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", targetUserId)
      .eq("is_read", false)
      .in("type", [...MARKET_NOTIFICATION_TYPES]);

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
    <Link href="/market/messages" style={compact ? compactLinkStyle : linkStyle}>
      {t.market.messages}
      {unreadCount > 0 ? (
        <span style={badgeStyle}>{unreadCount > 99 ? "99+" : unreadCount}</span>
      ) : null}
    </Link>
  );
}

const linkStyle: CSSProperties = {
  minHeight: 38,
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  textDecoration: "none",
  border: "1px solid #d7e2d2",
  background: "#fff",
  color: "#40583a",
  borderRadius: 999,
  padding: "8px 14px",
  fontSize: 14,
  fontWeight: 700,
  whiteSpace: "nowrap",
  boxSizing: "border-box",
};

const compactLinkStyle: CSSProperties = {
  ...linkStyle,
  minHeight: 34,
  padding: "6px 10px",
};

const badgeStyle: CSSProperties = {
  minWidth: 17,
  height: 17,
  padding: "0 4px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 999,
  background: "#c94b3d",
  color: "#fff",
  fontSize: 10,
  fontWeight: 900,
  lineHeight: 1,
};
