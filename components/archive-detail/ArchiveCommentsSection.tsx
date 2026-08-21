"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { showToast } from "@/components/Toast";
import {
  formatDateTime,
  smallActionButtonStyle,
} from "@/lib/archive-detail-utils";
import type {
  CommentFlowerRow,
  RecordComment,
} from "@/lib/archive-detail-types";
import { PUBLIC_PROFILE_SELECT, type AppProfile } from "@/lib/domain-types";
import UiIcon from "@/components/ui/UiIcon";
import {
  canCreateMembershipContent,
  getCreateContentBlockedText,
  normalizeMembershipRpcResult,
  type MyMembership,
} from "@/lib/membership";
import { useLanguage } from "@/lib/i18n/useLanguage";

type CommentItem = RecordComment & {
  profile: Pick<AppProfile, "id" | "username" | "avatar_url"> | null;
  flowerCount: number;
  myFlower: CommentFlowerRow | null;
};

export default function ArchiveCommentsSection({
  recordId,
  recordOwnerId,
  recordStatusTag,
  currentUserId,
  initialCommentCount = 0,
  onCommentCountChange,
  showStatusHint = true,
  compactMobile = false,
}: {
  recordId: string;
  recordOwnerId: string;
  recordStatusTag: "help" | "resolved" | null;
  currentUserId: string | null | undefined;
  initialCommentCount?: number | null;
  onCommentCountChange?: (count: number) => void;
  showStatusHint?: boolean;
  compactMobile?: boolean;
}) {
  const { language, t } = useLanguage();
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [commentsExpanded, setCommentsExpanded] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const [membership, setMembership] = useState<MyMembership | null>(null);
  const [membershipLoading, setMembershipLoading] = useState(false);

  const membershipBlocked = Boolean(
    currentUserId &&
      !membershipLoading &&
      !canCreateMembershipContent(membership),
  );
  const canWrite = Boolean(currentUserId && !membershipLoading && !membershipBlocked);
  const canAwardFlowers = Boolean(
    currentUserId &&
    currentUserId === recordOwnerId &&
    (recordStatusTag === "help" || recordStatusTag === "resolved"),
  );

  const commentCount = comments.length || initialCommentCount || 0;
  const lastReportedCountRef = useRef<number | null>(null);

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordId, currentUserId]);

  useEffect(() => {
    async function loadMembership() {
      if (!currentUserId) {
        setMembership(null);
        setMembershipLoading(false);
        return;
      }

      setMembershipLoading(true);
      const { data, error } = await supabase.rpc("get_my_membership");

      if (error) {
        console.error("load comment membership error:", error);
        setMembership(null);
      } else {
        setMembership(normalizeMembershipRpcResult(data));
      }

      setMembershipLoading(false);
    }

    void loadMembership();
  }, [currentUserId]);

  useEffect(() => {
    if (!onCommentCountChange) return;
    if (lastReportedCountRef.current === comments.length) return;
    lastReportedCountRef.current = comments.length;
    onCommentCountChange(comments.length);
  }, [comments.length, onCommentCountChange]);

  async function loadData() {
    setLoading(true);
    const commentsResult = await supabase
      .from("comments")
      .select("id, record_id, user_id, content, accepted, created_at")
      .eq("record_id", recordId)
      .order("created_at", { ascending: true });

    const commentRows = (commentsResult.data || []) as RecordComment[];
    const commentIds = commentRows.map((item) => item.id);
    const profileIds = Array.from(
      new Set(commentRows.map((item) => item.user_id).filter(Boolean)),
    );

    const [profilesResult, flowersResult] = await Promise.all([
      profileIds.length
        ? supabase
            .from("public_profiles")
            .select(PUBLIC_PROFILE_SELECT)
            .in("id", profileIds)
        : Promise.resolve({
            data: [] as Pick<AppProfile, "id" | "username" | "avatar_url">[],
          }),
      commentIds.length
        ? supabase
            .from("comment_flowers")
            .select(
              "id, record_id, comment_id, sender_user_id, receiver_user_id, created_at, revoked_at, revoke_until, reason",
            )
            .eq("record_id", recordId)
            .in("comment_id", commentIds)
        : Promise.resolve({ data: [] as CommentFlowerRow[] }),
    ]);

    const profileMap = new Map<
      string,
      Pick<AppProfile, "id" | "username" | "avatar_url">
    >();
    for (const profile of (profilesResult.data || []) as Pick<
      AppProfile,
      "id" | "username" | "avatar_url"
    >[]) {
      profileMap.set(profile.id, profile);
    }

    const flowers = (flowersResult.data || []) as CommentFlowerRow[];

    const nextComments: CommentItem[] = commentRows.map((comment) => {
      const flowerRows = flowers.filter(
        (item) => item.comment_id === comment.id && !item.revoked_at,
      );
      const myFlower =
        flowers.find(
          (item) =>
            item.comment_id === comment.id &&
            item.sender_user_id === currentUserId,
        ) || null;

      return {
        ...comment,
        profile: profileMap.get(comment.user_id) || null,
        flowerCount: flowerRows.length,
        myFlower,
      };
    });

    setComments(nextComments);
    setLoading(false);
  }

  async function handleSubmitComment() {
    const content = commentText.trim();
    if (!currentUserId) {
      showToast(t.archive_comments.login_required);
      return;
    }
    if (!content) {
      showToast(t.archive_comments.comment_required);
      return;
    }

    if (membershipLoading) {
      showToast(t.archive_comments.membership_loading);
      return;
    }

    if (!canCreateMembershipContent(membership)) {
      showToast(getCreateContentBlockedText(membership, language));
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.from("comments").insert({
      record_id: recordId,
      user_id: currentUserId,
      content,
    });
    setSubmitting(false);

    if (error) {
      showToast(t.archive_comments.send_failed);
      return;
    }

    setCommentText("");
    setCommentsExpanded(true);
    setComposerOpen(false);
    showToast(t.archive_comments.sent);
    await loadData();
  }

  function mobileCommentActionButtonStyle(active: boolean) {
  return {
    border: "none",
    background: "transparent",
    color: active ? "#3f6b34" : "#6f7b69",
    fontSize: 13,
    fontWeight: active ? 750 : 650,
    padding: "4px 0",
    cursor: "pointer",
  } as const;
  }

  async function handleDeleteComment(comment: CommentItem) {
    const canDelete = Boolean(
      currentUserId &&
        (currentUserId === comment.user_id || currentUserId === recordOwnerId),
    );

    if (!canDelete) {
      showToast(t.archive_comments.delete_forbidden);
      return;
    }

    const ok = window.confirm(t.archive_comments.delete_confirm);
    if (!ok) return;

    setDeletingCommentId(comment.id);
    const { error } = await supabase
      .from("comments")
      .delete()
      .eq("id", comment.id);
    setDeletingCommentId(null);

    if (error) {
      showToast(t.archive_comments.delete_failed);
      return;
    }

    setComments((prev) => prev.filter((item) => item.id !== comment.id));
    showToast(t.archive_comments.deleted);
  }

  async function handleSendFlower(comment: CommentItem) {
    if (!currentUserId || !canAwardFlowers) {
      showToast(t.archive_comments.owner_only_helpful);
      return;
    }
    if (comment.user_id === currentUserId) {
      showToast(t.archive_comments.self_helpful_forbidden);
      return;
    }
    if (comment.myFlower && !comment.myFlower.revoked_at) {
      showToast(t.archive_comments.already_helpful);
      return;
    }

    if (membershipLoading) {
      showToast(t.archive_comments.membership_loading);
      return;
    }

    if (!canCreateMembershipContent(membership)) {
      showToast(getCreateContentBlockedText(membership, language));
      return;
    }

    const { error } = await supabase.from("comment_flowers").insert({
      record_id: recordId,
      comment_id: comment.id,
      sender_user_id: currentUserId,
      receiver_user_id: comment.user_id,
      reason: "求助回答有帮助",
    });

    if (error) {
      showToast(t.archive_comments.mark_failed);
      return;
    }

    showToast(t.archive_comments.marked_helpful);
    await loadData();
  }

  async function handleRevokeFlower(comment: CommentItem) {
    const flower = comment.myFlower;
    if (!flower || !currentUserId) return;

    const revokeUntil = flower.revoke_until
      ? new Date(flower.revoke_until).getTime()
      : 0;
    if (!revokeUntil || Date.now() > revokeUntil) {
      showToast(t.archive_comments.revoke_expired);
      return;
    }

    const { error } = await supabase
      .from("comment_flowers")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", flower.id)
      .eq("sender_user_id", currentUserId);

    if (error) {
      showToast(t.archive_comments.revoke_failed);
      return;
    }

    showToast(t.archive_comments.revoked);
    await loadData();
  }

  const commentHint = useMemo(() => {
    if (recordStatusTag === "help")
      return t.archive_comments.help_hint;
    if (recordStatusTag === "resolved")
      return t.archive_comments.resolved_hint;
    return "";
  }, [recordStatusTag, t]);

  return (
    <section
      style={{
        marginTop: compactMobile ? 4 : 8,
        paddingTop: compactMobile ? 4 : 8,
        borderTop: compactMobile ? "none" : "1px dashed #edf1ea",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: compactMobile ? 12 : 6,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          onClick={() =>
            setCommentsExpanded((prev) => {
              const next = !prev;
              if (compactMobile && next && canWrite) setComposerOpen(true);
              return next;
            })
          }
          style={
            compactMobile
              ? mobileCommentActionButtonStyle(commentsExpanded)
              : smallActionButtonStyle(
                  commentsExpanded ? "#f3f8f1" : "#fff",
                  commentsExpanded ? "#3f6b34" : "#667066",
                  commentsExpanded ? "#cfe0c9" : "#dfe5dc",
                )
          }
        >
          {compactMobile
            ? `${t.archive_comments.comments} ${commentCount}`
            : `${
                commentsExpanded
                  ? t.archive_comments.collapse_comments
                  : t.archive_comments.comments
              } · ${commentCount}`}
        </button>

        {!compactMobile && canWrite ? (
          <button
            type="button"
            onClick={() => {
              setCommentsExpanded(true);
              setComposerOpen(true);
            }}
            style={smallActionButtonStyle("#f8fbf6", "#4c7441", "#dbe9d6")}
          >
            {t.archive_comments.write_comment}
          </button>
        ) : !compactMobile && membershipLoading && currentUserId ? (
          <span style={{ fontSize: 12, color: "#8b9688" }}>
            {t.archive_comments.membership_loading}{t.archive_comments.loading_suffix}
          </span>
        ) : !compactMobile && membershipBlocked ? (
          <span style={{ fontSize: 12, color: "#9a6232" }}>
            {getCreateContentBlockedText(membership, language)}
            {t.archive_comments.membership_link_prefix}
            <Link href="/membership" style={{ color: "#4c7b3f", fontWeight: 700 }}>
              {t.archive_comments.learn_membership}
            </Link>
            {t.archive_comments.membership_link_suffix}
          </span>
        ) : !compactMobile ? (
          <span style={{ fontSize: 12, color: "#8b9688" }}>
            {t.archive_comments.login_to_comment}
          </span>
        ) : null}

        {showStatusHint && commentHint && !commentsExpanded ? (
          <span
            style={{
              fontSize: 12,
              color: recordStatusTag === "help" ? "#9a6232" : "#4f7a55",
            }}
          >
            {recordStatusTag === "help"
              ? t.archive_comments.help_open
              : t.archive_comments.resolved}
          </span>
        ) : null}
      </div>

      {commentsExpanded ? (
        <div style={{ marginTop: 8 }}>
          {showStatusHint && commentHint ? (
            <div
              style={{
                marginBottom: 8,
                fontSize: 12,
                color: "#7c8878",
                lineHeight: 1.5,
              }}
            >
              {commentHint}
            </div>
          ) : null}

          <div style={{ display: "grid", gap: 0 }}>
            {loading ? (
              <div style={{ fontSize: 12, color: "#7c8878" }}>
                {t.archive_comments.comments_loading}
              </div>
            ) : comments.length === 0 ? (
              <div style={{ fontSize: 12, color: "#8b9688" }}>
                {t.archive_comments.no_comments}
              </div>
            ) : (
              comments.map((comment) => {
                const revokeUntilTime = comment.myFlower?.revoke_until
                  ? new Date(comment.myFlower.revoke_until).getTime()
                  : 0;
                const canRevoke = Boolean(
                  comment.myFlower &&
                  !comment.myFlower.revoked_at &&
                  revokeUntilTime > Date.now(),
                );
                const username = comment.profile?.username || t.archive_comments.default_user;
                const canDeleteComment = Boolean(
                  currentUserId &&
                    (currentUserId === comment.user_id ||
                      currentUserId === recordOwnerId),
                );

                return (
                  <article
                    key={comment.id}
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: 8,
                      padding: "6px 0",
                      borderTop: "1px solid #edf1ea",
                      fontSize: 12,
                      color: "#536050",
                      lineHeight: 1.45,
                      flexWrap: "wrap",
                    }}
                  >
                    <span
                      style={{
                        flex: "1 1 220px",
                        minWidth: 0,
                        color: "#263324",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                    >
                      {comment.content}
                    </span>
                    <span
                      style={{
                        display: "inline-flex",
                        gap: 5,
                        alignItems: "center",
                        color: "#a0aa9c",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <Link
                        href={`/user/${comment.user_id}/profile`}
                        style={{
                          color: "#7d8a78",
                          fontWeight: 400,
                          textDecoration: "none",
                        }}
                      >
                        {username}
                      </Link>
                      <span>·</span>
                      <span>{formatDateTime(comment.created_at)}</span>
                    </span>
                    {comment.flowerCount > 0 ? (
                      <span style={{ color: "#9d6f1f", whiteSpace: "nowrap" }}>
                        <UiIcon name="helpful" size={13} /> {t.archive_comments.helpful} {comment.flowerCount}
                      </span>
                    ) : null}
                    {canDeleteComment ? (
                      <button
                        type="button"
                        onClick={() => void handleDeleteComment(comment)}
                        disabled={deletingCommentId === comment.id}
                        style={{
                          border: "none",
                          background: "transparent",
                          color: "#a07b73",
                          fontSize: 12,
                          padding: 0,
                          cursor:
                            deletingCommentId === comment.id
                              ? "default"
                              : "pointer",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {deletingCommentId === comment.id
                          ? t.archive_comments.deleting
                          : t.archive_comments.delete}
                      </button>
                    ) : null}

                    {canAwardFlowers && comment.user_id !== currentUserId ? (
                      comment.myFlower && !comment.myFlower.revoked_at ? (
                        <button
                          type="button"
                          onClick={() => void handleRevokeFlower(comment)}
                          style={{
                            border: "none",
                            background: "transparent",
                            color: "#9f5d22",
                            fontSize: 12,
                            padding: 0,
                            cursor: canRevoke ? "pointer" : "default",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {canRevoke
                            ? t.archive_comments.marked_revoke
                            : t.archive_comments.marked}
                        </button>
                      ) : comment.myFlower?.revoked_at ? (
                        <span
                          style={{ color: "#9b8771", whiteSpace: "nowrap" }}
                        >
                          {t.archive_comments.mark_revoked}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void handleSendFlower(comment)}
                          style={{
                            border: "none",
                            background: "transparent",
                            color: "#9d6f1f",
                            fontSize: 12,
                            padding: 0,
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {t.archive_comments.helpful}
                        </button>
                      )
                    ) : null}
                  </article>
                );
              })
            )}
          </div>

          {composerOpen ? (
            <div style={{ marginTop: 10 }}>
              {canWrite ? (
                <>
                  <textarea
                    value={commentText}
                    onChange={(event) => setCommentText(event.target.value)}
                    placeholder={t.archive_comments.composer_placeholder}
                    rows={2}
                    style={{
                      width: "100%",
                      borderRadius: 12,
                      border: "1px solid #dce5d7",
                      padding: 10,
                      fontSize: 13,
                      resize: "vertical",
                      outline: "none",
                      background: "#fff",
                    }}
                  />
                  <div
                    style={{
                      marginTop: 6,
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ fontSize: 11, color: "#7b8776" }}>
                      {t.archive_comments.trace_prefix}{" "}
                      <Link
                        href="/profile/helpful"
                        style={{ color: "#4c7b3f" }}
                      >
                        {t.archive_comments.trace_link}
                      </Link>{" "}
                      {t.archive_comments.trace_suffix}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => setComposerOpen(false)}
                        style={smallActionButtonStyle(
                          "#fff",
                          "#7b8776",
                          "#dfe5dc",
                        )}
                      >
                        {t.archive_comments.cancel}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleSubmitComment()}
                        disabled={submitting}
                        style={{
                          border: "1px solid #d7e4d0",
                          background: "#f6fbf3",
                          color: "#365b2e",
                          borderRadius: 999,
                          padding: "8px 14px",
                          fontSize: 13,
                          cursor: "pointer",
                        }}
                      >
                        {submitting
                          ? t.archive_comments.sending
                          : t.archive_comments.publish_comment}
                      </button>
                    </div>
                  </div>
                </>
              ) : membershipLoading && currentUserId ? (
                <div style={{ fontSize: 12, color: "#7b8776" }}>
                  {t.archive_comments.membership_loading}{t.archive_comments.loading_suffix}
                </div>
              ) : membershipBlocked ? (
                <div style={{ fontSize: 12, color: "#7b8776", lineHeight: 1.7 }}>
                  {getCreateContentBlockedText(membership, language)}
                  {t.archive_comments.membership_link_prefix}{" "}
                  <Link href="/membership" style={{ color: "#4c7b3f", fontWeight: 700 }}>
                    {t.archive_comments.learn_membership}
                  </Link>
                  {t.archive_comments.membership_link_suffix}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: "#7b8776" }}>
                  {t.archive_comments.login_to_comment}
                </div>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
