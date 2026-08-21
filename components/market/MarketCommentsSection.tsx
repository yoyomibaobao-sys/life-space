"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { supabase } from "@/lib/supabase";
import { showToast } from "@/components/Toast";
import { PUBLIC_PROFILE_SELECT, type AppProfile } from "@/lib/domain-types";
import type { MarketPostStatus } from "@/lib/market-types";
import UiIcon from "@/components/ui/UiIcon";
import { formatPreciseDateTime } from "@/lib/date-time";
import { useLanguage } from "@/lib/i18n/useLanguage";

type MarketCommentRow = {
  id: string;
  market_post_id: string;
  user_id: string;
  content: string;
  parent_comment_id: string | null;
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
  const { t } = useLanguage();
  const [comments, setComments] = useState<MarketCommentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [replyTarget, setReplyTarget] = useState<MarketCommentItem | null>(null);
  const [repliesSupported, setRepliesSupported] = useState(false);

  const canWrite = Boolean(currentUserId && postStatus === "active");

  useEffect(() => {
    void loadComments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketPostId, currentUserId]);

  useEffect(() => {
    if (loading || !comments.length || !window.location.hash) return;
    const targetId = window.location.hash.slice(1);
    if (!targetId.startsWith("market-comment-")) return;

    window.requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  }, [comments, loading]);

  async function loadComments() {
    setLoading(true);

    const commentsResult = await supabase
      .from("market_comments")
      .select("id, market_post_id, user_id, content, parent_comment_id, created_at, updated_at")
      .eq("market_post_id", marketPostId)
      .order("created_at", { ascending: true });

    let rows: MarketCommentRow[] = [];

    if (commentsResult.error && isMissingParentCommentColumn(commentsResult.error)) {
      setRepliesSupported(false);
      const legacyResult = await supabase
        .from("market_comments")
        .select("id, market_post_id, user_id, content, created_at, updated_at")
        .eq("market_post_id", marketPostId)
        .order("created_at", { ascending: true });

      if (legacyResult.error) {
        console.error("load market comments error:", legacyResult.error);
        setComments([]);
        setLoading(false);
        return;
      }

      rows = (legacyResult.data || []).map((row) => ({
        ...(row as Omit<MarketCommentRow, "parent_comment_id">),
        parent_comment_id: null,
      }));
    } else if (!commentsResult.error) {
      setRepliesSupported(true);
      rows = (commentsResult.data || []) as MarketCommentRow[];
    } else {
      console.error("load market comments error:", commentsResult.error);
      setComments([]);
      setLoading(false);
      return;
    }

    const profileIds = Array.from(
      new Set(rows.map((item) => item.user_id).filter(Boolean))
    );

    const profilesResult = profileIds.length
      ? await supabase
          .from("public_profiles")
          .select(PUBLIC_PROFILE_SELECT)
          .in("id", profileIds)
      : { data: [] };

    const profileMap = new Map<
      string,
      Pick<AppProfile, "id" | "username" | "avatar_url">
    >();

    for (const profile of
      (profilesResult.data || []) as Pick<
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
      showToast(t.market.comment_login_required);
      return;
    }

    if (postStatus !== "active") {
      showToast(t.market.comment_ended);
      return;
    }

    if (!content) {
      showToast(t.market.comment_required);
      return;
    }

    if (content.length > 1000) {
      showToast(t.market.comment_too_long);
      return;
    }

    setSubmitting(true);

    const payload: {
      market_post_id: string;
      user_id: string;
      content: string;
      parent_comment_id?: string;
    } = {
      market_post_id: marketPostId,
      user_id: currentUserId,
      content,
    };
    if (repliesSupported && replyTarget) {
      payload.parent_comment_id = replyTarget.id;
    }

    const { error } = await supabase.from("market_comments").insert(payload);

    setSubmitting(false);

    if (error) {
      console.error("submit market comment error:", error);
      showToast(t.market.comment_send_failed);
      return;
    }

    setCommentText("");
    setReplyTarget(null);
    showToast(t.market.comment_sent);
    await loadComments();
  }

  async function handleDeleteComment(comment: MarketCommentItem) {
    if (!currentUserId) return;

    const canDelete =
      currentUserId === comment.user_id || currentUserId === postOwnerId;

    if (!canDelete) {
      showToast(t.market.comment_delete_forbidden);
      return;
    }

    const ok = window.confirm(t.market.comment_delete_confirm);
    if (!ok) return;

    setDeletingId(comment.id);

    const { error } = await supabase
      .from("market_comments")
      .delete()
      .eq("id", comment.id);

    setDeletingId(null);

    if (error) {
      console.error("delete market comment error:", error);
      showToast(t.market.comment_delete_failed);
      return;
    }

    showToast(t.market.comment_deleted);
    if (replyTarget?.id === comment.id) setReplyTarget(null);
    await loadComments();
  }

  function startReply(comment: MarketCommentItem) {
    setReplyTarget(comment);
    window.requestAnimationFrame(() => {
      document.getElementById("market-comment-composer")?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  }

  return (
    <section style={sectionStyle}>
      <div style={headerRowStyle}>
        <h2 style={titleStyle}>{t.market.comments_title}</h2>
        <span style={countStyle}>{comments.length}{t.market.count_suffix}</span>
      </div>

      <div style={listStyle}>
        {loading ? (
          <div style={emptyStyle}>{t.market.comments_loading}</div>
        ) : comments.length === 0 ? (
          <div style={emptyStyle}>{t.market.no_comments}</div>
        ) : (
          comments.map((comment) => {
            const canDelete =
              currentUserId === comment.user_id || currentUserId === postOwnerId;

            return (
              <article
                key={comment.id}
                id={`market-comment-${comment.id}`}
                style={commentCardStyle}
              >
                <div style={commentTopStyle}>
                  <div style={profileWrapStyle}>
                    {comment.profile?.avatar_url ? (
                      <img
                        src={String(comment.profile.avatar_url)}
                        alt=""
                        style={avatarStyle}
                      />
                    ) : (
                      <div style={avatarFallbackStyle}><UiIcon name="sprout" size={20} /></div>
                    )}

                    <div style={{ minWidth: 0 }}>
                      <div style={nameStyle}>
                        {comment.profile?.username || t.discover.default_user}
                        {comment.user_id === postOwnerId ? (
                          <span style={ownerBadgeStyle}>{t.market.publisher_badge}</span>
                        ) : null}
                      </div>
                      <div style={timeStyle}>
                        {formatCommentTime(comment.created_at)}
                      </div>
                    </div>
                  </div>

                  <div style={commentActionRowStyle}>
                    {repliesSupported && canWrite && comment.user_id !== currentUserId ? (
                      <button
                        type="button"
                        onClick={() => startReply(comment)}
                        style={replyButtonStyle}
                      >
                        {t.market.reply}
                      </button>
                    ) : null}
                    {canDelete ? (
                      <button
                        type="button"
                        onClick={() => void handleDeleteComment(comment)}
                        disabled={deletingId === comment.id}
                        style={deleteButtonStyle}
                      >
                        {deletingId === comment.id ? t.market.deleting : t.market.delete}
                      </button>
                    ) : null}
                  </div>
                </div>

                {comment.parent_comment_id ? (
                  <div style={replyContextStyle}>
                    {t.market.replying_to_prefix}
                    {comments.find((item) => item.id === comment.parent_comment_id)?.profile?.username || t.discover.default_user}
                  </div>
                ) : null}
                <div style={contentStyle}>{comment.content}</div>
              </article>
            );
          })
        )}
      </div>

      <div id="market-comment-composer" style={formWrapStyle}>
        {canWrite ? (
          <>
              {replyTarget ? (
                <div style={replyComposerStyle}>
                  <span>
                    {t.market.replying_to_prefix}
                    {replyTarget.profile?.username || t.discover.default_user}
                  </span>
                  <button
                    type="button"
                    onClick={() => setReplyTarget(null)}
                    style={cancelReplyButtonStyle}
                  >
                    {t.market.cancel_reply}
                  </button>
                </div>
              ) : null}
              <textarea
                value={commentText}
                onChange={(event) => setCommentText(event.target.value)}
                placeholder={
                  replyTarget
                    ? `${t.market.reply_placeholder_prefix}${replyTarget.profile?.username || t.discover.default_user}…`
                    : t.market.comment_placeholder
                }
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
                  {submitting ? t.market.sending : t.market.send_comment}
                </button>
              </div>
              <div style={consultationHintStyle}>
                {t.market.comment_permission_hint}
              </div>
            </>
        ) : currentUserId && postStatus !== "active" ? (
          <div style={closedNoticeStyle}>{t.market.comments_closed}</div>
        ) : (
          <div style={closedNoticeStyle}>{t.market.login_to_comment}</div>
        )}
      </div>
    </section>
  );
}

function formatCommentTime(value?: string | null) {
  return formatPreciseDateTime(value);
}

function isMissingParentCommentColumn(error: { code?: string; message?: string }) {
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    String(error.message || "").includes("parent_comment_id")
  );
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

const commentActionRowStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  flexShrink: 0,
};

const replyButtonStyle: CSSProperties = {
  border: "none",
  background: "transparent",
  color: "#4f7b45",
  padding: "5px 6px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const replyContextStyle: CSSProperties = {
  marginBottom: 5,
  color: "#788473",
  fontSize: 12,
};

const replyComposerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  marginBottom: 8,
  padding: "7px 10px",
  borderRadius: 10,
  background: "#f2f7ef",
  color: "#566b51",
  fontSize: 13,
};

const cancelReplyButtonStyle: CSSProperties = {
  border: "none",
  background: "transparent",
  color: "#7a8676",
  fontSize: 12,
  cursor: "pointer",
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

const consultationHintStyle: CSSProperties = {
  marginTop: 8,
  color: "#74806f",
  fontSize: 12,
  lineHeight: 1.6,
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
