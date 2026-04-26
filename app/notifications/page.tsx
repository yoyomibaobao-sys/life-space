"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { SupabaseUser } from "@/lib/domain-types";

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  related_url: string | null;
  is_read: boolean;
  created_at: string;
};

export default function NotificationsPage() {
  const router = useRouter();

  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);

  useEffect(() => {
    async function init() {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      setUser(user);

      const { data, error } = await supabase
        .from("notifications")
        .select("id, type, title, body, related_url, is_read, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(80);

      if (error) {
        console.error("load notifications error:", error);
        setItems([]);
      } else {
        setItems((data || []) as NotificationItem[]);
      }

      setLoading(false);
    }

    void init();
  }, [router]);

  const unreadCount = items.filter((item) => !item.is_read).length;

  async function markOneAsRead(item: NotificationItem) {
    if (!user) return;

    if (!item.is_read) {
      await supabase
        .from("notifications")
        .update({
          is_read: true,
          read_at: new Date().toISOString(),
        })
        .eq("id", item.id)
        .eq("user_id", user.id);

      setItems((current) =>
        current.map((oldItem) =>
          oldItem.id === item.id ? { ...oldItem, is_read: true } : oldItem
        )
      );
      window.dispatchEvent(new Event("notifications-changed"));
    }

    if (item.related_url) {
      router.push(item.related_url);
    }
  }

  async function markAllAsRead() {
    if (!user || unreadCount === 0) return;

    setMarkingAll(true);

    const { error } = await supabase
      .from("notifications")
      .update({
        is_read: true,
        read_at: new Date().toISOString(),
      })
      .eq("user_id", user.id)
      .eq("is_read", false);

    setMarkingAll(false);

    if (error) {
      console.error("mark notifications read error:", error);
      return;
    }

    setItems((current) =>
      current.map((item) => ({
        ...item,
        is_read: true,
      }))
    );
    window.dispatchEvent(new Event("notifications-changed"));
  }

  return (
    <main style={pageStyle}>
      <div style={shellStyle}>
        <div style={topBarStyle}>
          <div>
            <Link href="/profile" style={backLinkStyle}>
              ← 返回个人资料
            </Link>
            <h1 style={titleStyle}>通知</h1>
            <div style={subtitleStyle}>
              关注、评论、送花和项目更新提醒
            </div>
          </div>

          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllAsRead}
              disabled={markingAll}
              style={markAllButtonStyle}
            >
              {markingAll ? "处理中..." : `全部已读（${unreadCount}）`}
            </button>
          )}
        </div>

        {loading ? (
          <section style={emptyStyle}>加载中...</section>
        ) : items.length === 0 ? (
          <section style={emptyStyle}>还没有通知</section>
        ) : (
          <section style={listStyle}>
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => markOneAsRead(item)}
                style={{
                  ...cardStyle,
                  background: item.is_read ? "#fff" : "#f7fbf2",
                  borderColor: item.is_read ? "#e4ece0" : "#cfe4c4",
                }}
              >
                <div style={cardHeaderStyle}>
                  <span style={typeBadgeStyle}>{getNotificationTypeLabel(item.type)}</span>
                  {!item.is_read && <span style={unreadBadgeStyle}>未读</span>}
                </div>

                <div style={itemTitleStyle}>{item.title}</div>

                {item.body ? <div style={bodyStyle}>{item.body}</div> : null}

                <div style={timeStyle}>{formatNotificationTime(item.created_at)}</div>
              </button>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}

function getNotificationTypeLabel(type: string) {
  const map: Record<string, string> = {
    comment: "评论",
    user_follow: "关注",
    archive_follow: "项目关注",
    flower: "花朵",
    followed_archive_record: "项目更新",
  };

  return map[type] || "通知";
}

function formatNotificationTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  background: "#f6f8f3",
  padding: "18px 12px 36px",
};

const shellStyle: CSSProperties = {
  width: "100%",
  maxWidth: 880,
  margin: "0 auto",
};

const topBarStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  marginBottom: 14,
};

const backLinkStyle: CSSProperties = {
  display: "inline-block",
  color: "#587050",
  textDecoration: "none",
  fontSize: 14,
  marginBottom: 8,
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 26,
  color: "#1f2a1f",
};

const subtitleStyle: CSSProperties = {
  marginTop: 6,
  color: "#6f7b69",
  fontSize: 14,
};

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

const listStyle: CSSProperties = {
  display: "grid",
  gap: 10,
};

const cardStyle: CSSProperties = {
  width: "100%",
  textAlign: "left",
  border: "1px solid #e4ece0",
  borderRadius: 16,
  padding: 14,
  cursor: "pointer",
  color: "inherit",
};

const cardHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  alignItems: "center",
  marginBottom: 8,
};

const typeBadgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: 999,
  background: "#edf4e8",
  color: "#55704d",
  padding: "3px 8px",
  fontSize: 12,
  fontWeight: 700,
};

const unreadBadgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: 999,
  background: "#e85d3f",
  color: "#fff",
  padding: "3px 8px",
  fontSize: 12,
  fontWeight: 700,
};

const itemTitleStyle: CSSProperties = {
  color: "#1f2a1f",
  fontSize: 15,
  fontWeight: 700,
  lineHeight: 1.5,
};

const bodyStyle: CSSProperties = {
  marginTop: 6,
  color: "#5f6a5b",
  fontSize: 14,
  lineHeight: 1.6,
};

const timeStyle: CSSProperties = {
  marginTop: 8,
  color: "#8a9585",
  fontSize: 12,
};

const emptyStyle: CSSProperties = {
  background: "#fff",
  border: "1px solid #e4ece0",
  borderRadius: 16,
  padding: 28,
  color: "#6f7b69",
  textAlign: "center",
};