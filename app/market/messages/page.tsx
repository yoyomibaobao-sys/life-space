"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { SupabaseUser } from "@/lib/domain-types";
import { MARKET_NOTIFICATION_TYPES } from "@/lib/notification-types";
import { useLanguage } from "@/lib/i18n/useLanguage";
import { buildLoginHref } from "@/lib/auth-return";
import { formatPreciseDateTime } from "@/lib/date-time";
import UiIcon from "@/components/ui/UiIcon";

type MarketNotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  related_url: string | null;
  is_read: boolean;
  created_at: string;
};

export default function MarketMessagesPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [items, setItems] = useState<MarketNotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push(buildLoginHref("/market/messages"));
        return;
      }

      setUser(user);
      const { data, error } = await supabase
        .from("notifications")
        .select("id, type, title, body, related_url, is_read, created_at")
        .eq("user_id", user.id)
        .in("type", [...MARKET_NOTIFICATION_TYPES])
        .order("created_at", { ascending: false })
        .limit(80);

      if (error) {
        console.error("load market messages error:", error);
        setItems([]);
      } else {
        setItems((data || []) as MarketNotificationItem[]);
      }
      setLoading(false);
    }

    void load();
  }, [router]);

  const unreadCount = items.filter((item) => !item.is_read).length;

  async function openItem(item: MarketNotificationItem) {
    if (!user) return;

    if (!item.is_read) {
      await supabase
        .from("notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("id", item.id)
        .eq("user_id", user.id);

      setItems((current) =>
        current.map((entry) =>
          entry.id === item.id ? { ...entry, is_read: true } : entry
        )
      );
      window.dispatchEvent(new Event("notifications-changed"));
    }

    if (item.related_url) router.push(item.related_url);
  }

  async function markAllAsRead() {
    if (!user || unreadCount === 0) return;
    setMarkingAll(true);

    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("is_read", false)
      .in("type", [...MARKET_NOTIFICATION_TYPES]);

    setMarkingAll(false);
    if (error) {
      console.error("mark market messages read error:", error);
      return;
    }

    setItems((current) => current.map((item) => ({ ...item, is_read: true })));
    window.dispatchEvent(new Event("notifications-changed"));
  }

  return (
    <main style={pageStyle}>
      <div style={shellStyle}>
        <div style={topBarStyle}>
          <div>
            <Link href="/market" className="mobile-app-desktop-only" style={backLinkStyle}>
              <UiIcon name="arrow-left" size={15} /> {t.market.back_to_market}
            </Link>
            <h1 className="mobile-app-desktop-only" style={titleStyle}>{t.market.messages_title}</h1>
            <div style={subtitleStyle}>{t.market.messages_subtitle}</div>
          </div>

          {unreadCount > 0 ? (
            <button
              type="button"
              onClick={() => void markAllAsRead()}
              disabled={markingAll}
              style={markAllButtonStyle}
            >
              {markingAll
                ? t.notifications.processing
                : `${t.notifications.mark_all_read_prefix}${unreadCount}${t.notifications.mark_all_read_suffix}`}
            </button>
          ) : null}
        </div>

        {loading ? (
          <section style={emptyStyle}>{t.notifications.loading}</section>
        ) : items.length === 0 ? (
          <section style={emptyStyle}>{t.market.messages_empty}</section>
        ) : (
          <section style={listStyle}>
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => void openItem(item)}
                style={{
                  ...cardStyle,
                  background: item.is_read ? "#fff" : "#f7fbf2",
                  borderColor: item.is_read ? "#e4ece0" : "#cfe4c4",
                }}
              >
                <div style={cardHeaderStyle}>
                  <span style={typeBadgeStyle}>
                    {getNotificationTypeLabel(item.type, t.notifications.types)}
                  </span>
                  {!item.is_read ? (
                    <span style={unreadBadgeStyle}>{t.notifications.unread}</span>
                  ) : null}
                </div>
                <div style={itemTitleStyle}>{item.title}</div>
                {item.body ? <div style={bodyStyle}>{item.body}</div> : null}
                <div style={timeStyle}>{formatPreciseDateTime(item.created_at)}</div>
              </button>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}

function getNotificationTypeLabel(type: string, labels: Record<string, string>) {
  return labels[type] || labels.fallback;
}

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  background: "#f6f8f3",
  padding: "18px 12px 36px",
};

const shellStyle: CSSProperties = { width: "100%", maxWidth: 880, margin: "0 auto" };
const topBarStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  marginBottom: 14,
};
const backLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  color: "#587050",
  textDecoration: "none",
  fontSize: 14,
  marginBottom: 8,
};
const titleStyle: CSSProperties = { margin: 0, fontSize: 26, color: "#1f2a1f" };
const subtitleStyle: CSSProperties = { marginTop: 6, color: "#6f7b69", fontSize: 14 };
const markAllButtonStyle: CSSProperties = {
  border: "1px solid #cfe4c4",
  background: "#fff",
  color: "#4f7d45",
  borderRadius: 999,
  padding: "8px 12px",
  cursor: "pointer",
  fontSize: 13,
  whiteSpace: "nowrap",
};
const emptyStyle: CSSProperties = {
  padding: 28,
  border: "1px dashed #d8e3d3",
  borderRadius: 16,
  background: "#fff",
  color: "#778173",
  textAlign: "center",
};
const listStyle: CSSProperties = { display: "grid", gap: 10 };
const cardStyle: CSSProperties = {
  width: "100%",
  border: "1px solid #e4ece0",
  borderRadius: 16,
  padding: 14,
  textAlign: "left",
  color: "#1f2a1f",
  cursor: "pointer",
};
const cardHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8,
  marginBottom: 9,
};
const typeBadgeStyle: CSSProperties = {
  borderRadius: 999,
  background: "#edf4e8",
  color: "#4f7b45",
  padding: "4px 8px",
  fontSize: 12,
  fontWeight: 700,
};
const unreadBadgeStyle: CSSProperties = {
  borderRadius: 999,
  background: "#c94b3d",
  color: "#fff",
  padding: "3px 7px",
  fontSize: 11,
  fontWeight: 800,
};
const itemTitleStyle: CSSProperties = { fontSize: 16, fontWeight: 750 };
const bodyStyle: CSSProperties = { marginTop: 5, color: "#63705f", fontSize: 14, lineHeight: 1.5 };
const timeStyle: CSSProperties = { marginTop: 8, color: "#8a9585", fontSize: 12 };
