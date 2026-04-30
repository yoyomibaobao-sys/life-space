"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { supabase } from "@/lib/supabase";
import { showToast } from "@/components/Toast";
import type { AppProfile } from "@/lib/domain-types";
import type { MarketPostStatus } from "@/lib/market-types";

type MarketCommentRow = {
  id: string;
  market_post_id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at: string | null;
};

type MarketCommentItem = MarketCommentRow & {
  profile: Pick<AppProfile, "id" | "username" | "avatar_url"> | null;
};

export default function MarketCommentsSection({
  marketPostId,
  postOwnerId,
  postStatus,
  currentUserId,
}: {
  marketPostId: string;
  postOwnerId: string;
  postStatus: MarketPostStatus;
  currentUserId: string | null | undefined;
}) {
  const [comments, setComments] = useState<MarketCommentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const canWrite = Boolean(currentUserId && postStatus === "active");

  useEffect(() => {
    void loadComments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketPostId, currentUserId]);

  async function loadComments() {
    setLoading(true);

    const { data, error } = await supabase
      .from("market_comments")
      .select("id, market_post_id, user_id, content, created_at, updated_at")
      .eq("market_post_id", marketPostId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("load market comments error:", error);
      setComments([]);
      setLoading(false);
      return;
    }

    const rows = (data || []) as MarketCommentRow[];
    const profileIds = Array.from(
      new Set(rows.map((item) => item.user_id).filter(Boolean))
    );

    const profilesResult = profileIds.length
      ? await supabase
          .from("profiles")
          .select("id, username, avatar_url")
          .in("id", profileIds)
      : { data: [] };

    const profileMap = new Map<
      string,
      Pick<AppProfile, "id" | "username" | "avatar_url">
    >();

    for (const profile of
      ((profilesResult as any).data || []) as Pick<
        AppProfile,
        "id" | "username" | "avatar_url"
      >[]) {
      profileMap.set(profile.id, profile);
    }

    setComments(
      rows.map((comment) => ({
        ...comment,
        profile: profileMap.get(comment.user_id) || null,
      }))
    );

    setLoading(false);
  }

  async function handleSubmitComment() {
    const content = commentText.trim();

    if (!currentUserId) {
      showToast("请先登录后再留言");
      return;
    }

    if (postStatus !== "active") {
      showToast("这条集市信息已结束，不能继续留言");
      return;
    }

    if (!content) {
      showToast("请输入留言内容");
      return;
    }

    if (content.length > 1000) {
      showToast("留言不能超过 1000 字");
      return;
    }

    setSubmitting(true);

    const { error } = await supabase.from("market_comments").insert({
      market_post_id: marketPostId,
      user_id: currentUserId,
      content,
    });

    setSubmitting(false);

    if (error) {
      console.error("submit market comment error:", error);
      showToast("留言发送失败");
      return;
    }

    setCommentText("");
    showToast("留言已发送");
    await loadComments();
  }

  async function handleDeleteComment(comment: MarketCommentItem) {
    if (!currentUserId) return;

    const canDelete =
      currentUserId === comment.user_id || currentUserId === postOwnerId;

    if (!canDelete) {
      showToast("不能删除这条留言");
      return;
    }

    const ok = window.confirm("确定删除这条留言吗？");
    if (!ok) return;

    setDeletingId(comment.id);

    const { error } = await supabase
      .from("market_comments")
      .delete()
      .eq("id", comment.id);

    setDeletingId(null);

    if (error) {
      console.error("delete market comment error:", error);
      showToast("删除失败");
      return;
    }

    showToast("留言已删除");
    await loadComments();
  }

  return (
    <section style={sectionStyle}>
      <div style={headerRowStyle}>
        <h2 style={titleStyle}>留言</h2>
        <span style={countStyle}>{comments.length} 条</span>
      </div>

      <div style={hintStyle}>
        集市留言用于公开沟通交换、赠送、转让或求购信息。请谨慎交换个人联系方式。
      </div>

      <div style={listStyle}>
        {loading ? (
          <div style={emptyStyle}>留言加载中...</div>
        ) : comments.length === 0 ? (
          <div style={emptyStyle}>还没有留言，可以留下第一个问题或意向。</div>
        ) : (
          comments.map((comment) => {
            const canDelete =
              currentUserId === comment.user_id || currentUserId === postOwnerId;

            return (
              <article key={comment.id} style={commentCardStyle}>
                <div style={commentTopStyle}>
                  <div style={profileWrapStyle}>
                    {comment.profile?.avatar_url ? (
                      <img
                        src={String(comment.profile.avatar_url)}
                        alt=""
                        style={avatarStyle}
                      />
                    ) : (
                      <div style={avatarFallbackStyle}>🌱</div>
                    )}

                    <div style={{ minWidth: 0 }}>
                      <div style={nameStyle}>
                        {comment.profile?.username || "用户"}
                        {comment.user_id === postOwnerId ? (
                          <span style={ownerBadgeStyle}>发布者</span>
                        ) : null}
                      </div>
                      <div style={timeStyle}>
                        {formatCommentTime(comment.created_at)}
                      </div>
                    </div>
                  </div>

                  {canDelete ? (
                    <button
                      type="button"
                      onClick={() => void handleDeleteComment(comment)}
                      disabled={deletingId === comment.id}
                      style={deleteButtonStyle}
                    >
                      {deletingId === comment.id ? "删除中..." : "删除"}
                    </button>
                  ) : null}
                </div>

                <div style={contentStyle}>{comment.content}</div>
              </article>
            );
          })
        )}
      </div>

      <div style={formWrapStyle}>
        {currentUserId ? (
          postStatus === "active" ? (
            <>
              <textarea
                value={commentText}
                onChange={(event) => setCommentText(event.target.value)}
                placeholder="写下你的问题或交换意向…"
                rows={3}
                style={textareaStyle}
              />
              <div style={formFooterStyle}>
                <span style={wordCountStyle}>{commentText.trim().length}/1000</span>
                <button
                  type="button"
                  onClick={() => void handleSubmitComment()}
                  disabled={submitting}
                  style={submitButtonStyle}
                >
                  {submitting ? "发送中..." : "发布留言"}
                </button>
              </div>
            </>
          ) : (
            <div style={closedNoticeStyle}>这条集市信息已结束，不能继续留言。</div>
          )
        ) : (
          <div style={closedNoticeStyle}>登录后可以留言。</div>
        )}
      </div>
    </section>
  );
}

function formatCommentTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const sectionStyle: CSSProperties = {
  marginTop: 16,
  borderTop: "1px solid #eef2ec",
  paddingTop: 14,
};

const headerRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 18,
  color: "#1f2a1f",
};

const countStyle: CSSProperties = {
  fontSize: 12,
  color: "#7a8676",
};

const hintStyle: CSSProperties = {
  marginTop: 8,
  color: "#7a8676",
  fontSize: 13,
  lineHeight: 1.7,
};

const listStyle: CSSProperties = {
  marginTop: 12,
  display: "grid",
  gap: 10,
};

const emptyStyle: CSSProperties = {
  color: "#7a8676",
  fontSize: 13,
  background: "#fafcf8",
  border: "1px solid #edf2ea",
  borderRadius: 14,
  padding: 12,
};

const commentCardStyle: CSSProperties = {
  border: "1px solid #edf2ea",
  borderRadius: 14,
  padding: 12,
  background: "#fafcf8",
};

const commentTopStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
};

const profileWrapStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  minWidth: 0,
};

const avatarStyle: CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: "50%",
  objectFit: "cover",
  flexShrink: 0,
};

const avatarFallbackStyle: CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: "50%",
  background: "#eaf2e4",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 16,
  flexShrink: 0,
};

const nameStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  flexWrap: "wrap",
  color: "#243024",
  fontSize: 14,
  fontWeight: 700,
};

const ownerBadgeStyle: CSSProperties = {
  borderRadius: 999,
  background: "#edf4e8",
  color: "#4f7b45",
  padding: "2px 7px",
  fontSize: 11,
  fontWeight: 700,
};

const timeStyle: CSSProperties = {
  marginTop: 2,
  color: "#7a8676",
  fontSize: 12,
};

const contentStyle: CSSProperties = {
  marginTop: 10,
  color: "#263226",
  fontSize: 14,
  lineHeight: 1.8,
  whiteSpace: "pre-wrap",
};

const deleteButtonStyle: CSSProperties = {
  border: "1px solid #eadbd7",
  background: "#fff",
  color: "#b74636",
  borderRadius: 999,
  padding: "5px 10px",
  fontSize: 12,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const formWrapStyle: CSSProperties = {
  marginTop: 12,
};

const textareaStyle: CSSProperties = {
  width: "100%",
  borderRadius: 14,
  border: "1px solid #dce5d7",
  padding: 12,
  fontSize: 14,
  resize: "vertical",
  outline: "none",
  background: "#fff",
  boxSizing: "border-box",
};

const formFooterStyle: CSSProperties = {
  marginTop: 8,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  flexWrap: "wrap",
};

const wordCountStyle: CSSProperties = {
  color: "#8a9585",
  fontSize: 12,
};

const submitButtonStyle: CSSProperties = {
  border: "none",
  background: "#4f7b45",
  color: "#fff",
  borderRadius: 999,
  padding: "9px 16px",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 700,
};

const closedNoticeStyle: CSSProperties = {
  border: "1px solid #edf2ea",
  background: "#fafcf8",
  color: "#7a8676",
  borderRadius: 14,
  padding: 12,
  fontSize: 13,
};