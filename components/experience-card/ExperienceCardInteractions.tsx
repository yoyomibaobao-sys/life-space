"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "@/components/experience-card/ExperienceCardInteractions.module.css";
import { showToast } from "@/components/Toast";
import UiIcon from "@/components/ui/UiIcon";
import { formatPreciseDateTime } from "@/lib/date-time";
import type {
  ExperienceCardCommentRow,
  ExperienceCardInteractionSummary,
} from "@/lib/experience-card-types";
import {
  canCreateMembershipContent,
  getCreateContentBlockedText,
  normalizeMembershipRpcResult,
  type MyMembership,
} from "@/lib/membership";
import { supabase } from "@/lib/supabase";

type CommentItem = ExperienceCardCommentRow & {
  username: string;
};

type Summary = {
  commentCount: number;
  bookmarkCount: number;
  helpfulCount: number;
  bookmarkedByMe: boolean;
  helpfulByMe: boolean;
};

const emptySummary: Summary = {
  commentCount: 0,
  bookmarkCount: 0,
  helpfulCount: 0,
  bookmarkedByMe: false,
  helpfulByMe: false,
};

export default function ExperienceCardInteractions({
  cardId,
  cardOwnerId,
  currentUserId,
  isPublic,
}: {
  cardId: string;
  cardOwnerId: string;
  currentUserId: string | null;
  isPublic: boolean;
}) {
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [membership, setMembership] = useState<MyMembership | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [available, setAvailable] = useState(true);

  const isOwner = currentUserId === cardOwnerId;
  const canWrite = Boolean(
    currentUserId && canCreateMembershipContent(membership) && isPublic
  );

  async function loadSummary() {
    const { data, error } = await supabase.rpc(
      "get_experience_card_interaction_summaries",
      { p_card_ids: [cardId] }
    );
    if (error) {
      setAvailable(false);
      return;
    }
    const row = ((data || [])[0] || null) as ExperienceCardInteractionSummary | null;
    setSummary({
      commentCount: Number(row?.comment_count || 0),
      bookmarkCount: Number(row?.bookmark_count || 0),
      helpfulCount: Number(row?.helpful_count || 0),
      bookmarkedByMe: Boolean(row?.bookmarked_by_me),
      helpfulByMe: Boolean(row?.helpful_by_me),
    });
  }

  async function loadComments() {
    const { data, error } = await supabase
      .from("experience_card_comments")
      .select("id, card_id, user_id, content, created_at, updated_at")
      .eq("card_id", cardId)
      .order("created_at", { ascending: true });
    if (error) {
      setAvailable(false);
      return;
    }

    const rows = (data || []) as ExperienceCardCommentRow[];
    const userIds = Array.from(new Set(rows.map((row) => row.user_id)));
    const { data: profiles } = userIds.length
      ? await supabase
          .from("public_profiles")
          .select("id, username")
          .in("id", userIds)
      : { data: [] as Array<{ id: string; username: string | null }> };
    const names = new Map(
      ((profiles || []) as Array<{ id: string; username: string | null }>).map(
        (profile) => [profile.id, profile.username?.trim() || "用户"]
      )
    );
    setComments(
      rows.map((row) => ({ ...row, username: names.get(row.user_id) || "用户" }))
    );
  }

  useEffect(() => {
    async function init() {
      const membershipResult = currentUserId
        ? await supabase.rpc("get_my_membership")
        : { data: null, error: null };
      setMembership(
        membershipResult.error
          ? null
          : normalizeMembershipRpcResult(membershipResult.data)
      );
      await Promise.all([loadSummary(), loadComments()]);
    }
    void init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId, currentUserId]);

  function requireWritableAccount() {
    if (!currentUserId) {
      showToast("请先登录");
      return false;
    }
    if (!canCreateMembershipContent(membership)) {
      showToast(getCreateContentBlockedText(membership));
      return false;
    }
    if (!isPublic) {
      showToast("经验卡公开后才能互动");
      return false;
    }
    return true;
  }

  async function toggleBookmark() {
    if (isOwner) return;
    if (summary.bookmarkedByMe) {
      const { error } = await supabase
        .from("experience_card_bookmarks")
        .delete()
        .eq("card_id", cardId)
        .eq("user_id", currentUserId);
      if (error) return showToast("取消收藏失败");
      showToast("已取消收藏");
      await loadSummary();
      return;
    }
    if (!requireWritableAccount()) return;
    const { error } = await supabase.from("experience_card_bookmarks").insert({
      card_id: cardId,
      user_id: currentUserId,
    });
    if (error) return showToast("收藏失败");
    showToast("已收藏经验卡");
    await loadSummary();
  }

  async function toggleHelpful() {
    if (isOwner) return;
    if (summary.helpfulByMe) {
      const { error } = await supabase
        .from("experience_card_helpful_marks")
        .delete()
        .eq("card_id", cardId)
        .eq("user_id", currentUserId);
      if (error) return showToast("取消标记失败");
      showToast("已取消“有帮助”");
      await loadSummary();
      return;
    }
    if (!requireWritableAccount()) return;
    const { error } = await supabase.from("experience_card_helpful_marks").insert({
      card_id: cardId,
      user_id: currentUserId,
    });
    if (error) return showToast("标记失败");
    showToast("已标记为有帮助");
    await loadSummary();
  }

  async function submitComment() {
    const content = commentText.trim();
    if (!content) return showToast("请输入评论");
    if (!requireWritableAccount()) return;
    setSubmitting(true);
    const { error } = await supabase.from("experience_card_comments").insert({
      card_id: cardId,
      user_id: currentUserId,
      content,
    });
    setSubmitting(false);
    if (error) return showToast("评论发送失败");
    setCommentText("");
    setComposerOpen(false);
    showToast("评论已发送");
    await Promise.all([loadComments(), loadSummary()]);
  }

  async function deleteComment(comment: CommentItem) {
    if (!currentUserId) return;
    setDeletingId(comment.id);
    const { error } = await supabase
      .from("experience_card_comments")
      .delete()
      .eq("id", comment.id);
    setDeletingId(null);
    if (error) return showToast("评论删除失败");
    showToast("评论已删除");
    await Promise.all([loadComments(), loadSummary()]);
  }

  if (!available) return null;

  return (
    <section className={styles.section} aria-label="经验卡互动">
      <div className={styles.actionRow}>
        {isOwner ? (
          <span className={styles.staticMetric} aria-label={`被收藏 ${summary.bookmarkCount}`}>
            <UiIcon name="bookmark" size={15} /> 被收藏 {summary.bookmarkCount}
          </span>
        ) : (
          <button
            type="button"
            className={styles.action}
            aria-pressed={summary.bookmarkedByMe}
            onClick={() => void toggleBookmark()}
          >
            <UiIcon name={summary.bookmarkedByMe ? "bookmark-filled" : "bookmark"} size={15} />
            {summary.bookmarkedByMe ? "已收藏" : "收藏"} {summary.bookmarkCount}
          </button>
        )}

        {isOwner ? (
          <span className={styles.staticMetric} aria-label={`有帮助 ${summary.helpfulCount}`}>
            <UiIcon name="helpful" size={15} /> 有帮助 {summary.helpfulCount}
          </span>
        ) : (
          <button
            type="button"
            className={styles.action}
            aria-pressed={summary.helpfulByMe}
            onClick={() => void toggleHelpful()}
          >
            <UiIcon name="helpful" size={15} />
            {summary.helpfulByMe ? "已标记" : "有帮助"} {summary.helpfulCount}
          </button>
        )}

        <button
          type="button"
          className={styles.action}
          aria-expanded={commentsOpen}
          onClick={() => setCommentsOpen((value) => !value)}
        >
          <UiIcon name="comment" size={15} /> 评论 {summary.commentCount}
        </button>
      </div>

      <p className={styles.hint}>“有帮助”表示这段真实过程值得参考，不代表对所有环境都有效。</p>

      {commentsOpen ? (
        <div className={styles.comments}>
          <div className={styles.commentList}>
            {comments.length ? comments.map((comment) => (
              <article className={styles.comment} key={comment.id}>
                <div className={styles.commentMeta}>
                  <Link href={`/user/${comment.user_id}/profile`} className={styles.commentAuthor}>
                    {comment.username}
                  </Link>
                  <time dateTime={comment.created_at}>{formatPreciseDateTime(comment.created_at)}</time>
                  {currentUserId === comment.user_id || isOwner ? (
                    <button
                      type="button"
                      className={styles.commentDelete}
                      disabled={deletingId === comment.id}
                      onClick={() => void deleteComment(comment)}
                    >
                      {deletingId === comment.id ? "删除中" : "删除"}
                    </button>
                  ) : null}
                </div>
                <p className={styles.commentContent}>{comment.content}</p>
              </article>
            )) : <div className={styles.empty}>还没有评论</div>}
          </div>

          {composerOpen ? (
            <div className={styles.composer}>
              {canWrite ? (
                <>
                  <label htmlFor={`experience-comment-${cardId}`} className={styles.empty}>写评论</label>
                  <textarea
                    id={`experience-comment-${cardId}`}
                    className={styles.textarea}
                    maxLength={1000}
                    value={commentText}
                    onChange={(event) => setCommentText(event.target.value)}
                  />
                  <div className={styles.composerActions}>
                    <button type="button" className={styles.cancel} onClick={() => setComposerOpen(false)}>取消</button>
                    <button type="button" className={styles.submit} disabled={submitting} onClick={() => void submitComment()}>
                      {submitting ? "发送中..." : "发布评论"}
                    </button>
                  </div>
                </>
              ) : (
                <div className={styles.empty}>
                  {currentUserId ? getCreateContentBlockedText(membership) : "登录后可评论"}
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              className={styles.action}
              onClick={() => {
                if (!requireWritableAccount()) return;
                setComposerOpen(true);
              }}
            >
              写评论
            </button>
          )}
        </div>
      ) : null}
    </section>
  );
}
