"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import ConfirmDialog from "@/components/ConfirmDialog";
import { showToast } from "@/components/Toast";
import { PUBLIC_PROFILE_SELECT } from "@/lib/domain-types";
import { formatProfileDateTime } from "@/lib/user-profile-shared";
import UiIcon from "@/components/ui/UiIcon";
import { useLanguage } from "@/lib/i18n/useLanguage";
import { buildLoginHref, getCurrentInternalPath } from "@/lib/auth-return";

type FlowerSourceItem = {
  id: string;
  record_id: string;
  comment_id: string;
  sender_user_id: string;
  receiver_user_id: string;
  created_at: string;
  revoked_at?: string | null;
  revoke_until?: string | null;
  reason?: string | null;
  sender_name: string;
  receiver_name: string;
  comment_content: string;
  record_note: string;
  archive_id: string | null;
};

type TabKey = "received" | "sent";

function ProfileFlowersContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { language, t } = useLanguage();
  const helpfulT = t.profile.helpful_page;
  const defaultTab = searchParams.get("tab") === "sent" ? "sent" : "received";
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<FlowerSourceItem[]>([]);
  const [tab, setTab] = useState<TabKey>(defaultTab);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<FlowerSourceItem | null>(null);

  useEffect(() => {
    setTab(defaultTab);
  }, [defaultTab]);

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push(buildLoginHref(getCurrentInternalPath()));
        return;
      }

      setCurrentUserId(user.id);

      const flowersResult = await supabase
        .from("comment_flowers")
        .select("id, record_id, comment_id, sender_user_id, receiver_user_id, created_at, revoked_at, revoke_until, reason")
        .or(`receiver_user_id.eq.${user.id},sender_user_id.eq.${user.id}`)
        .order("created_at", { ascending: false });

      const flowers = (flowersResult.data || []) as FlowerSourceItem[];
      const profileIds = Array.from(new Set(flowers.flatMap((item) => [item.sender_user_id, item.receiver_user_id]).filter(Boolean)));
      const commentIds = Array.from(new Set(flowers.map((item) => item.comment_id)));
      const recordIds = Array.from(new Set(flowers.map((item) => item.record_id)));

      const [profilesResult, commentsResult, recordsResult] = await Promise.all([
        profileIds.length
          ? supabase.from("public_profiles").select(PUBLIC_PROFILE_SELECT).in("id", profileIds)
          : Promise.resolve({ data: [] as Array<{ id: string; username?: string | null }> }),
        commentIds.length
          ? supabase.from("comments").select("id, content").in("id", commentIds)
          : Promise.resolve({ data: [] as Array<{ id: string; content?: string | null }> }),
        recordIds.length
          ? supabase.from("records").select("id, note, archive_id").in("id", recordIds)
          : Promise.resolve({ data: [] as Array<{ id: string; note?: string | null; archive_id?: string | null }> }),
      ]);

      const profileMap = new Map<string, string>();
      for (const item of (profilesResult.data || []) as Array<{ id: string; username?: string | null }>) {
        profileMap.set(item.id, item.username || "");
      }

      const commentMap = new Map<string, string>();
      for (const item of (commentsResult.data || []) as Array<{ id: string; content?: string | null }>) {
        commentMap.set(item.id, item.content || "");
      }

      const recordMap = new Map<string, { note: string; archive_id: string | null }>();
      for (const item of (recordsResult.data || []) as Array<{ id: string; note?: string | null; archive_id?: string | null }>) {
        recordMap.set(item.id, { note: item.note || "", archive_id: item.archive_id || null });
      }

      setItems(
        flowers.map((item) => ({
          ...item,
          sender_name: profileMap.get(item.sender_user_id) || "",
          receiver_name: profileMap.get(item.receiver_user_id) || "",
          comment_content: commentMap.get(item.comment_id) || "",
          record_note: recordMap.get(item.record_id)?.note || "",
          archive_id: recordMap.get(item.record_id)?.archive_id || null,
        }))
      );
      setLoading(false);
    }

    void load();
  }, [router]);

  const receivedItems = useMemo(() => items.filter((item) => item.receiver_user_id === currentUserId), [items, currentUserId]);
  const sentItems = useMemo(() => items.filter((item) => item.sender_user_id === currentUserId), [items, currentUserId]);
  const visibleItems = tab === "received" ? receivedItems : sentItems;

  async function handleConfirmRevoke() {
    const target = revokeTarget;
    if (!target || !currentUserId || target.sender_user_id !== currentUserId) {
      setRevokeTarget(null);
      return;
    }

    const { error } = await supabase.rpc("set_comment_adoption", {
      p_comment_id: target.comment_id,
      p_active: false,
    });

    if (error) {
      showToast(helpfulT.revoke_failed);
      return;
    }

    setItems((prev) => prev.map((item) => (item.id === target.id ? { ...item, revoked_at: new Date().toISOString() } : item)));
    setRevokeTarget(null);
    showToast(helpfulT.revoked);
  }

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "14px 12px 48px" }}>
      <Link href="/profile" className="mobile-app-desktop-only" style={backLinkStyle}>
        <UiIcon name="arrow-left" size={15} />
        {helpfulT.back}
      </Link>
      <section style={{ background: "#fff", border: "1px solid #e7efe3", borderRadius: 18, padding: 16, boxShadow: "0 8px 22px rgba(32,56,24,0.05)" }}>
        <h1 className="mobile-app-desktop-only" style={{ margin: 0, fontSize: 24, color: "#1f2a1f" }}>{helpfulT.title}</h1>

        <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
          <TabButton active={tab === "received"} onClick={() => setTab("received")}>{helpfulT.received_tab} ({receivedItems.length})</TabButton>
          <TabButton active={tab === "sent"} onClick={() => setTab("sent")}>{helpfulT.sent_tab} ({sentItems.length})</TabButton>
        </div>

        <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
          {loading ? (
            <div style={{ color: "#6f7b69" }}>{t.archive.loading}</div>
          ) : visibleItems.length === 0 ? (
            <div style={{ color: "#6f7b69", lineHeight: 1.8 }}>
              {tab === "received"
                ? helpfulT.empty_received
                : helpfulT.empty_sent}
            </div>
          ) : (
            visibleItems.map((item) => {
              const canRevoke = tab === "sent" && !item.revoked_at && item.sender_user_id === currentUserId;
              const statusText = item.revoked_at
                ? language === "en"
                  ? `${helpfulT.revoked_prefix} ${formatProfileDateTime(item.revoked_at, language)}`
                  : `${helpfulT.revoked_prefix} ${formatProfileDateTime(item.revoked_at, language)} ${helpfulT.revoked_suffix}`
                : "";
              const senderName = item.sender_name || helpfulT.default_user;
              const receiverName = item.receiver_name || helpfulT.default_user;
              const activityText = tab === "received"
                ? `${senderName} ${helpfulT.adopted_your_suggestion}`
                : language === "en"
                  ? `${helpfulT.you_adopted_prefix} ${receiverName}'s ${helpfulT.you_adopted_suffix}`
                  : `${helpfulT.you_adopted_prefix}${receiverName}${helpfulT.you_adopted_suffix}`;
              return (
                <article key={item.id} style={{ border: "1px solid #e6ece2", borderRadius: 15, padding: 13, background: item.revoked_at ? "#fcfcfb" : "#fbfdf9" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: "#233022" }}>
                        {activityText}
                      </div>
                      <div style={{ marginTop: 4, fontSize: 12, color: "#768271" }}>
                        {formatProfileDateTime(item.created_at, language)}
                        {statusText ? ` · ${statusText}` : ""}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {item.archive_id ? <Link href={`/archive/${item.archive_id}?record=${item.record_id}`} style={linkStyle}>{helpfulT.view_record}</Link> : null}
                      {canRevoke ? <button type="button" onClick={() => setRevokeTarget(item)} style={dangerButtonStyle}>{helpfulT.cancel_adoption}</button> : null}
                    </div>
                  </div>

                  <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                    <div>
                      <div style={labelStyle}>{helpfulT.suggestion}</div>
                      <div style={contentStyle}>{item.comment_content || helpfulT.comment_unavailable}</div>
                    </div>
                    <div>
                      <div style={labelStyle}>{helpfulT.original_record}</div>
                      <div style={contentStyle}>{item.record_note || helpfulT.record_empty}</div>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>

      <ConfirmDialog
        open={Boolean(revokeTarget)}
        title={helpfulT.revoke_title}
        message={helpfulT.revoke_message}
        confirmText={helpfulT.cancel_adoption}
        danger
        onClose={() => setRevokeTarget(null)}
        onConfirm={handleConfirmRevoke}
      />
    </main>
  );
}


export default function ProfileFlowersPage() {
  const { t } = useLanguage();
  const helpfulT = t.profile.helpful_page;

  return (
    <Suspense
      fallback={
        <main style={{ maxWidth: 920, margin: "0 auto", padding: "24px 16px 48px" }}>
          <section style={{ background: "#fff", border: "1px solid #e7efe3", borderRadius: 20, padding: 24, boxShadow: "0 12px 28px rgba(32,56,24,0.06)" }}>
            <div style={{ fontSize: 13, color: "#6d7968" }}>{helpfulT.eyebrow}</div>
            <h1 style={{ margin: "6px 0 0", fontSize: 28, color: "#1f2a1f" }}>{helpfulT.title}</h1>
            <div style={{ marginTop: 18, color: "#6f7b69" }}>{t.archive.loading}</div>
          </section>
        </main>
      }
    >
      <ProfileFlowersContent />
    </Suspense>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: active ? "1px solid #cadbbe" : "1px solid #dde7d8",
        background: active ? "#f4fbef" : "#fff",
        color: active ? "#31562d" : "#5d6e58",
        borderRadius: 999,
        padding: "9px 14px",
        fontSize: 13,
        fontWeight: 700,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

const linkStyle: React.CSSProperties = {
  textDecoration: "none",
  border: "1px solid #d7e2d2",
  background: "#fff",
  color: "#40583a",
  borderRadius: 12,
  padding: "11px 16px",
  fontSize: 14,
  fontWeight: 600,
};

const backLinkStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  marginBottom: 10,
  color: "#557050",
  fontSize: 14,
  fontWeight: 800,
  textDecoration: "none",
};

const dangerButtonStyle: React.CSSProperties = {
  border: "1px solid #e6c7c7",
  background: "#fff7f7",
  color: "#a44a4a",
  borderRadius: 12,
  padding: "8px 11px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#7b8676",
  marginBottom: 4,
};

const contentStyle: React.CSSProperties = {
  fontSize: 14,
  color: "#243123",
  lineHeight: 1.8,
  whiteSpace: "pre-wrap",
};
