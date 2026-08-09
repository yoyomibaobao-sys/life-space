"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import ConfirmDialog from "@/components/ConfirmDialog";
import { showToast } from "@/components/Toast";
import { PUBLIC_PROFILE_SELECT } from "@/lib/domain-types";
import { formatProfileDateTime } from "@/lib/user-profile-shared";
import UiIcon from "@/components/ui/UiIcon";

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
  const defaultTab = searchParams.get("tab") === "sent" ? "sent" : "received";
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<FlowerSourceItem[]>([]);
  const [tab, setTab] = useState<TabKey>(defaultTab);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<FlowerSourceItem | null>(null);
  const [itemsLoadedAt, setItemsLoadedAt] = useState(0);

  useEffect(() => {
    setTab(defaultTab);
  }, [defaultTab]);

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
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
        profileMap.set(item.id, item.username || "用户");
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
          sender_name: profileMap.get(item.sender_user_id) || "用户",
          receiver_name: profileMap.get(item.receiver_user_id) || "用户",
          comment_content: commentMap.get(item.comment_id) || "",
          record_note: recordMap.get(item.record_id)?.note || "",
          archive_id: recordMap.get(item.record_id)?.archive_id || null,
        }))
      );
      setItemsLoadedAt(Date.now());
      setLoading(false);
    }

    void load();
  }, [router]);

  const receivedItems = useMemo(() => items.filter((item) => item.receiver_user_id === currentUserId), [items, currentUserId]);
  const sentItems = useMemo(() => items.filter((item) => item.sender_user_id === currentUserId), [items, currentUserId]);
  const visibleItems = tab === "received" ? receivedItems : sentItems;
  const activeCount = useMemo(() => visibleItems.filter((item) => !item.revoked_at).length, [visibleItems]);

  async function handleConfirmRevoke() {
    const target = revokeTarget;
    if (!target || !currentUserId || target.sender_user_id !== currentUserId) {
      setRevokeTarget(null);
      return;
    }

    const revokeUntil = target.revoke_until ? new Date(target.revoke_until).getTime() : 0;
    if (!revokeUntil || Date.now() > revokeUntil) {
      showToast("已超过撤回时间");
      setRevokeTarget(null);
      return;
    }

    const { error } = await supabase
      .from("comment_flowers")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", target.id)
      .eq("sender_user_id", currentUserId);

    if (error) {
      showToast("撤回标记失败");
      return;
    }

    setItems((prev) => prev.map((item) => (item.id === target.id ? { ...item, revoked_at: new Date().toISOString() } : item)));
    setRevokeTarget(null);
    showToast("已撤回“有帮助”");
  }

  return (
    <main style={{ maxWidth: 920, margin: "0 auto", padding: "24px 16px 48px" }}>
      <section style={{ background: "#fff", border: "1px solid #e7efe3", borderRadius: 20, padding: 24, boxShadow: "0 12px 28px rgba(32,56,24,0.06)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 13, color: "#6d7968" }}>真实反馈</div>
            <h1 style={{ margin: "6px 0 0", fontSize: 28, color: "#1f2a1f" }}>帮助标记记录</h1>
            <div style={{ marginTop: 8, fontSize: 14, color: "#62705d" }}>
              这里记录求助回答的“有帮助”反馈。已撤回标记仍会保留，便于追溯。
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href="/profile" style={linkStyle}>返回资料页</Link>
            <Link href="/follow" style={linkStyle}>关注</Link>
          </div>
        </div>

        <div style={{ marginTop: 18, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <TabButton active={tab === "received"} onClick={() => setTab("received")}>收到的帮助标记（{receivedItems.length}）</TabButton>
          <TabButton active={tab === "sent"} onClick={() => setTab("sent")}>我标记的回答（{sentItems.length}）</TabButton>
        </div>

        <div style={{ marginTop: 18, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <StatPill label={tab === "received" ? "有效标记" : "当前有效"} value={<span><UiIcon name="helpful" size={13} /> {activeCount}</span>} />
          <StatPill label="当前列表" value={String(visibleItems.length)} />
        </div>

        <div style={{ marginTop: 20, display: "grid", gap: 14 }}>
          {loading ? (
            <div style={{ color: "#6f7b69" }}>加载中...</div>
          ) : visibleItems.length === 0 ? (
            <div style={{ color: "#6f7b69", lineHeight: 1.8 }}>
              {tab === "received"
                ? "还没有收到帮助标记"
                : "还没有标记过回答"}
            </div>
          ) : (
            visibleItems.map((item) => {
              const revokeUntilTime = item.revoke_until ? new Date(item.revoke_until).getTime() : 0;
              const canRevoke = tab === "sent" && !item.revoked_at && item.sender_user_id === currentUserId && revokeUntilTime > itemsLoadedAt;
              const statusText = item.revoked_at ? `已于 ${formatProfileDateTime(item.revoked_at)} 撤回` : "当前有效";
              return (
                <article key={item.id} style={{ border: "1px solid #e6ece2", borderRadius: 18, padding: 16, background: item.revoked_at ? "#fcfcfb" : "#fffdf7" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: "#233022" }}>
                        {tab === "received" ? `${item.sender_name} 认为这条回答有帮助` : `你把 ${item.receiver_name} 的回答标为有帮助`}
                      </div>
                      <div style={{ marginTop: 6, fontSize: 12, color: "#768271" }}>{formatProfileDateTime(item.created_at)} · {statusText}</div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {item.archive_id ? <Link href={`/archive/${item.archive_id}?record=${item.record_id}`} style={linkStyle}>查看原记录</Link> : null}
                      {canRevoke ? <button type="button" onClick={() => setRevokeTarget(item)} style={dangerButtonStyle}>撤回标记</button> : null}
                    </div>
                  </div>

                  <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                    <div>
                      <div style={labelStyle}>对应评论</div>
                      <div style={contentStyle}>{item.comment_content || "评论内容已不可见"}</div>
                    </div>
                    <div>
                      <div style={labelStyle}>对应求助记录</div>
                      <div style={contentStyle}>{item.record_note || "记录文字为空"}</div>
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
        title="撤回帮助标记"
        message="确定撤回这次“有帮助”标记吗？撤回后对方收到的帮助统计会同步减少。"
        confirmText="撤回"
        danger
        onClose={() => setRevokeTarget(null)}
        onConfirm={handleConfirmRevoke}
      />
    </main>
  );
}


export default function ProfileFlowersPage() {
  return (
    <Suspense
      fallback={
        <main style={{ maxWidth: 920, margin: "0 auto", padding: "24px 16px 48px" }}>
          <section style={{ background: "#fff", border: "1px solid #e7efe3", borderRadius: 20, padding: 24, boxShadow: "0 12px 28px rgba(32,56,24,0.06)" }}>
            <div style={{ fontSize: 13, color: "#6d7968" }}>真实反馈</div>
            <h1 style={{ margin: "6px 0 0", fontSize: 28, color: "#1f2a1f" }}>帮助标记记录</h1>
            <div style={{ marginTop: 18, color: "#6f7b69" }}>加载中...</div>
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

function StatPill({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={{ border: "1px solid #e2ebdd", background: "#f9fcf7", borderRadius: 999, padding: "9px 14px", fontSize: 13, color: "#50614b" }}>
      {label}：<span style={{ color: "#1f2a1f", fontWeight: 700 }}>{value}</span>
    </div>
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

const dangerButtonStyle: React.CSSProperties = {
  border: "1px solid #e6c7c7",
  background: "#fff7f7",
  color: "#a44a4a",
  borderRadius: 12,
  padding: "11px 16px",
  fontSize: 14,
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
