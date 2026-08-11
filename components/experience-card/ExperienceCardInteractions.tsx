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
import { useLanguage } from "@/lib/i18n/useLanguage";

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
  const { language, t } = useLanguage();
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
        (profile) => [profile.id, profile.username?.trim() || t.experience.default_user]
      )
    );
    setComments(
      rows.map((row) => ({ ...row, username: names.get(row.user_id) || t.experience.default_user }))
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
  }, [cardId, currentUserId, language]);

  function requireWritableAccount() {
    if (!available) {
      showToast(t.experience.interactions_unavailable_toast);
      return false;
    }
    if (!currentUserId) {
      showToast(t.experience.login_first);
      return false;
    }
    if (!canCreateMembershipContent(membership)) {
      showToast(getCreateContentBlockedText(membership, language));
      return false;
    }
    if (!isPublic) {
      showToast(t.experience.publish_before_interact);
      return false;
    }
    return true;
  }

  function openComposer() {
    setCommentsOpen(true);
    setComposerOpen(true);
  }

  async function toggleBookmark() {
    if (isOwner) return;
    if (summary.bookmarkedByMe) {
      const { error } = await supabase
        .from("experience_card_bookmarks")
        .delete()
        .eq("card_id", cardId)
        .eq("user_id", currentUserId);
      if (error) return showToast(t.experience.remove_bookmark_failed);
      showToast(t.experience.bookmark_removed);
      await loadSummary();
      return;
    }
    if (!requireWritableAccount()) return;
    const { error } = await supabase.from("experience_card_bookmarks").insert({
      card_id: cardId,
      user_id: currentUserId,
    });
    if (error) return showToast(t.experience.bookmark_failed);
    showToast(t.experience.bookmarked);
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
      if (error) return showToast(t.experience.unmark_failed);
      showToast(t.experience.helpful_unmarked);
      await loadSummary();
      return;
    }
    if (!requireWritableAccount()) return;
    const { error } = await supabase.from("experience_card_helpful_marks").insert({
      card_id: cardId,
      user_id: currentUserId,
    });
    if (error) return showToast(t.experience.mark_failed);
    showToast(t.experience.helpful_marked);
    await loadSummary();
  }

  async function submitComment() {
    const content = commentText.trim();
    if (!content) return showToast(t.experience.comment_required);
    if (!requireWritableAccount()) return;
    setSubmitting(true);
    const { error } = await supabase.from("experience_card_comments").insert({
      card_id: cardId,
      user_id: currentUserId,
      content,
    });
    setSubmitting(false);
    if (error) return showToast(t.experience.comment_send_failed);
    setCommentText("");
    setComposerOpen(false);
    showToast(t.experience.comment_sent);
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
    if (error) return showToast(t.experience.comment_delete_failed);
    showToast(t.experience.comment_deleted);
    await Promise.all([loadComments(), loadSummary()]);
  }

  return (
    <section
      id="experience-card-interactions"
      className={styles.section}
      aria-label={t.experience.interactions_aria}
    >
      <div className={styles.actionRow}>
        {isOwner ? (
          <span className={styles.staticMetric} aria-label={`${t.experience.bookmarked_metric} ${summary.bookmarkCount}`}>
            <UiIcon name="bookmark" size={15} /> {t.experience.bookmarked_metric} {summary.bookmarkCount}
          </span>
        ) : (
          <button
            type="button"
            className={styles.action}
            aria-pressed={summary.bookmarkedByMe}
            onClick={() => void toggleBookmark()}
          >
            <UiIcon name={summary.bookmarkedByMe ? "bookmark-filled" : "bookmark"} size={15} />
            {summary.bookmarkedByMe ? t.experience.saved : t.experience.bookmark} {summary.bookmarkCount}
          </button>
        )}

        {isOwner ? (
          <span className={styles.staticMetric} aria-label={`${t.experience.helpful} ${summary.helpfulCount}`}>
            <UiIcon name="helpful" size={15} /> {t.experience.helpful} {summary.helpfulCount}
          </span>
        ) : (
          <button
            type="button"
            className={styles.action}
            aria-pressed={summary.helpfulByMe}
            onClick={() => void toggleHelpful()}
          >
            <UiIcon name="helpful" size={15} />
            {summary.helpfulByMe ? t.experience.marked : t.experience.helpful} {summary.helpfulCount}
          </button>
        )}

        {isPublic ? (
          <button
            type="button"
            className={styles.action}
            aria-expanded={commentsOpen}
            onClick={() => setCommentsOpen((value) => !value)}
          >
            <UiIcon name="comment" size={15} /> {t.experience.comments} {summary.commentCount}
          </button>
        ) : (
          <span className={styles.staticMetric}>
            <UiIcon name="comment" size={15} /> {t.experience.comments} {summary.commentCount}
          </span>
        )}

        {isPublic ? (
          <button
            type="button"
            className={styles.writeAction}
            onClick={openComposer}
          >
            {t.experience.write_comment}
          </button>
        ) : null}
      </div>

      {!isOwner ? (
        <p className={styles.hint}>
          {isPublic
            ? t.experience.helpful_hint
            : t.experience.private_interaction_hint}
        </p>
      ) : null}

      {!available ? (
        <div className={styles.unavailable}>
          {t.experience.interactions_temporarily_unavailable}
        </div>
      ) : null}

      {commentsOpen ? (
        <div className={styles.comments}>
          <div className={styles.commentList}>
            {!available ? (
              <div className={styles.empty}>{t.experience.interactions_unreadable}</div>
            ) : comments.length ? comments.map((comment) => (
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
                      {deletingId === comment.id ? t.experience.deleting_short : t.experience.delete}
                    </button>
                  ) : null}
                </div>
                <p className={styles.commentContent}>{comment.content}</p>
              </article>
            )) : <div className={styles.empty}>{t.experience.no_comments}</div>}
          </div>

          {composerOpen ? (
            <div className={styles.composer}>
              {!available ? (
                <div className={styles.empty}>{t.experience.preview_comments_disabled}</div>
              ) : canWrite ? (
                <>
                  <label htmlFor={`experience-comment-${cardId}`} className={styles.empty}>{t.experience.write_comment}</label>
                  <textarea
                    id={`experience-comment-${cardId}`}
                    className={styles.textarea}
                    maxLength={1000}
                    value={commentText}
                    onChange={(event) => setCommentText(event.target.value)}
                  />
                  <div className={styles.composerActions}>
                    <button type="button" className={styles.cancel} onClick={() => setComposerOpen(false)}>{t.experience.cancel}</button>
                    <button type="button" className={styles.submit} disabled={submitting} onClick={() => void submitComment()}>
                      {submitting ? t.experience.sending : t.experience.send_comment}
                    </button>
                  </div>
                </>
              ) : (
                <div className={styles.commentGate}>
                  <span>
                    {currentUserId
                      ? getCreateContentBlockedText(membership, language)
                      : t.experience.login_to_comment}
                  </span>
                  <Link
                    href={currentUserId ? "/membership" : "/login"}
                    className={styles.gateLink}
                  >
                    {currentUserId ? t.experience.learn_membership : t.experience.go_login}
                  </Link>
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              className={styles.action}
              onClick={openComposer}
            >
              {t.experience.write_comment}
            </button>
          )}
        </div>
      ) : null}
    </section>
  );
}
