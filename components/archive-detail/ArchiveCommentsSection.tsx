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
  CommentLikeRow,
  RecordComment,
  RecordLikeRow,
} from "@/lib/archive-detail-types";
import { PUBLIC_PROFILE_SELECT, type AppProfile } from "@/lib/domain-types";
import {
  canCreateMembershipContent,
  getCreateContentBlockedText,
  normalizeMembershipRpcResult,
  type MyMembership,
} from "@/lib/membership";

type CommentItem = RecordComment & {
  profile: Pick<AppProfile, "id" | "username" | "avatar_url"> | null;
  likeCount: number;
  likedByMe: boolean;
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
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [recordLikeCount, setRecordLikeCount] = useState(0);
  const [recordLikedByMe, setRecordLikedByMe] = useState(false);
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

    const [
      profilesResult,
      commentLikesResult,
      flowersResult,
      recordLikesResult,
    ] = await Promise.all([
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
            .from("comment_likes")
            .select("id, comment_id, user_id, created_at")
            .in("comment_id", commentIds)
        : Promise.resolve({ data: [] as CommentLikeRow[] }),
      commentIds.length
        ? supabase
            .from("comment_flowers")
            .select(
              "id, record_id, comment_id, sender_user_id, receiver_user_id, created_at, revoked_at, revoke_until, reason",
            )
            .eq("record_id", recordId)
            .in("comment_id", commentIds)
        : Promise.resolve({ data: [] as CommentFlowerRow[] }),
      supabase
        .from("record_likes")
        .select("id, record_id, user_id, created_at")
        .eq("record_id", recordId),
    ]);

    const profileMap = new Map<
      string,
      Pick<AppProfile, "id" | "username" | "avatar_url">
    >();
    for (const profile of ((profilesResult as any).data || []) as Pick<
      AppProfile,
      "id" | "username" | "avatar_url"
    >[]) {
      profileMap.set(profile.id, profile);
    }

    const commentLikes = ((commentLikesResult as any).data ||
      []) as CommentLikeRow[];
    const flowers = ((flowersResult as any).data || []) as CommentFlowerRow[];
    const recordLikes = ((recordLikesResult as any).data ||
      []) as RecordLikeRow[];

    const nextComments: CommentItem[] = commentRows.map((comment) => {
      const likes = commentLikes.filter(
        (item) => item.comment_id === comment.id,
      );
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
        likeCount: likes.length,
        likedByMe: likes.some((item) => item.user_id === currentUserId),
        flowerCount: flowerRows.length,
        myFlower,
      };
    });

    setComments(nextComments);
    setRecordLikeCount(recordLikes.length);
    setRecordLikedByMe(
      recordLikes.some((item) => item.user_id === currentUserId),
    );
    setLoading(false);
  }

  async function handleToggleRecordLike() {
    if (!currentUserId) {
      showToast("请先登录");
      return;
    }

    if (recordLikedByMe) {
      const { error } = await supabase
        .from("record_likes")
        .delete()
        .eq("record_id", recordId)
        .eq("user_id", currentUserId);

      if (error) {
        showToast("取消点赞失败");
        return;
      }

      setRecordLikedByMe(false);
      setRecordLikeCount((prev) => Math.max(0, prev - 1));
      return;
    }

    if (membershipLoading) {
      showToast("状态读取中");
      return;
    }

    if (!canCreateMembershipContent(membership)) {
      showToast(getCreateContentBlockedText(membership));
      return;
    }

    const { error } = await supabase.from("record_likes").insert({
      record_id: recordId,
      user_id: currentUserId,
    });

    if (error) {
      showToast("点赞失败");
      return;
    }

    setRecordLikedByMe(true);
    setRecordLikeCount((prev) => prev + 1);
  }

  async function handleSubmitComment() {
    const content = commentText.trim();
    if (!currentUserId) {
      showToast("请先登录");
      return;
    }
    if (!content) {
      showToast("请输入评论");
      return;
    }

    if (membershipLoading) {
      showToast("状态读取中");
      return;
    }

    if (!canCreateMembershipContent(membership)) {
      showToast(getCreateContentBlockedText(membership));
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
      showToast("评论发送失败");
      return;
    }

    setCommentText("");
    setCommentsExpanded(true);
    setComposerOpen(false);
    showToast("评论已发送");
    await loadData();
  }

  async function handleToggleCommentLike(comment: CommentItem) {
    if (!currentUserId) {
      showToast("请先登录");
      return;
    }

    if (comment.likedByMe) {
      const { error } = await supabase
        .from("comment_likes")
        .delete()
        .eq("comment_id", comment.id)
        .eq("user_id", currentUserId);

      if (error) {
        showToast("取消点赞失败");
        return;
      }

      setComments((prev) =>
        prev.map((item) =>
          item.id === comment.id
            ? {
                ...item,
                likedByMe: false,
                likeCount: Math.max(0, item.likeCount - 1),
              }
            : item,
        ),
      );
      return;
    }

    if (membershipLoading) {
      showToast("状态读取中");
      return;
    }

    if (!canCreateMembershipContent(membership)) {
      showToast(getCreateContentBlockedText(membership));
      return;
    }

    const { error } = await supabase.from("comment_likes").insert({
      comment_id: comment.id,
      user_id: currentUserId,
    });

    if (error) {
      showToast("点赞失败");
      return;
    }

    setComments((prev) =>
      prev.map((item) =>
        item.id === comment.id
          ? { ...item, likedByMe: true, likeCount: item.likeCount + 1 }
          : item,
      ),
  );
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
      showToast("你没有权限删除这条评论");
      return;
    }

    const ok = window.confirm("确定删除这条评论吗？");
    if (!ok) return;

    setDeletingCommentId(comment.id);
    const { error } = await supabase
      .from("comments")
      .delete()
      .eq("id", comment.id);
    setDeletingCommentId(null);

    if (error) {
      showToast("评论删除失败");
      return;
    }

    setComments((prev) => prev.filter((item) => item.id !== comment.id));
    showToast("评论已删除");
  }

  async function handleSendFlower(comment: CommentItem) {
    if (!currentUserId || !canAwardFlowers) {
      showToast("只有求助记录的主人才能送花");
      return;
    }
    if (comment.user_id === currentUserId) {
      showToast("不能给自己的评论送花");
      return;
    }
    if (comment.myFlower && !comment.myFlower.revoked_at) {
      showToast("这条评论已经送过花了");
      return;
    }

    if (membershipLoading) {
      showToast("状态读取中");
      return;
    }

    if (!canCreateMembershipContent(membership)) {
      showToast(getCreateContentBlockedText(membership));
      return;
    }

    const { error } = await supabase.from("comment_flowers").insert({
      record_id: recordId,
      comment_id: comment.id,
      sender_user_id: currentUserId,
      receiver_user_id: comment.user_id,
      reason: "求助评论送花",
    });

    if (error) {
      showToast("送花失败");
      return;
    }

    showToast("已送花");
    await loadData();
  }

  async function handleRevokeFlower(comment: CommentItem) {
    const flower = comment.myFlower;
    if (!flower || !currentUserId) return;

    const revokeUntil = flower.revoke_until
      ? new Date(flower.revoke_until).getTime()
      : 0;
    if (!revokeUntil || Date.now() > revokeUntil) {
      showToast("已超过撤回时间");
      return;
    }

    const { error } = await supabase
      .from("comment_flowers")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", flower.id)
      .eq("sender_user_id", currentUserId);

    if (error) {
      showToast("撤回送花失败");
      return;
    }

    showToast("已撤回送花");
    await loadData();
  }

  const commentHint = useMemo(() => {
    if (recordStatusTag === "help")
      return "记录主人可送花。";
    if (recordStatusTag === "resolved")
      return "可补送花。";
    return "";
  }, [recordStatusTag]);

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
          onClick={handleToggleRecordLike}
          style={
            compactMobile
              ? mobileCommentActionButtonStyle(recordLikedByMe)
              : smallActionButtonStyle(
                  recordLikedByMe ? "#fff3f3" : "#fff",
                  recordLikedByMe ? "#b64a4a" : "#667066",
                  recordLikedByMe ? "#efc4c4" : "#dfe5dc",
                )
          }
          aria-label={recordLikedByMe ? "取消喜欢" : "喜欢"}
        >
          {recordLikedByMe ? "♥" : "♡"} {recordLikeCount}
        </button>

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
            ? `评论 ${commentCount}`
            : `${commentsExpanded ? "收起评论" : "评论"} · ${commentCount}`}
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
            写评论
          </button>
        ) : !compactMobile && membershipLoading && currentUserId ? (
          <span style={{ fontSize: 12, color: "#8b9688" }}>状态读取中...</span>
        ) : !compactMobile && membershipBlocked ? (
          <span style={{ fontSize: 12, color: "#9a6232" }}>
            {getCreateContentBlockedText(membership)}，
            <Link href="/membership" style={{ color: "#4c7b3f", fontWeight: 700 }}>
              查看云空间
            </Link>
          </span>
        ) : !compactMobile ? (
          <span style={{ fontSize: 12, color: "#8b9688" }}>登录后可评论</span>
        ) : null}

        {showStatusHint && commentHint && !commentsExpanded ? (
          <span
            style={{
              fontSize: 12,
              color: recordStatusTag === "help" ? "#9a6232" : "#4f7a55",
            }}
          >
            {recordStatusTag === "help" ? "求助中" : "已解决"}
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
                评论加载中...
              </div>
            ) : comments.length === 0 ? (
              <div style={{ fontSize: 12, color: "#8b9688" }}>暂无评论</div>
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
                const username = comment.profile?.username || "用户";
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
                        🌸
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void handleToggleCommentLike(comment)}
                      style={{
                        border: "none",
                        background: "transparent",
                        color: comment.likedByMe ? "#b64a4a" : "#7b8776",
                        fontSize: 12,
                        padding: 0,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                      aria-label={comment.likedByMe ? "取消喜欢" : "喜欢评论"}
                    >
                      {comment.likedByMe ? "♥" : "♡"} {comment.likeCount}
                    </button>

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
                        {deletingCommentId === comment.id ? "删除中" : "删除"}
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
                          {canRevoke ? "已送花 · 撤回" : "已送花"}
                        </button>
                      ) : comment.myFlower?.revoked_at ? (
                        <span
                          style={{ color: "#9b8771", whiteSpace: "nowrap" }}
                        >
                          已撤回送花
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
                          送花
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
                    placeholder="写评论"
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
                      花朵记录可在{" "}
                      <Link
                        href="/profile/flowers"
                        style={{ color: "#4c7b3f" }}
                      >
                        我的花朵
                      </Link>{" "}
                      中追溯。
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
                        取消
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
                        {submitting ? "发送中..." : "发布评论"}
                      </button>
                    </div>
                  </div>
                </>
              ) : membershipLoading && currentUserId ? (
                <div style={{ fontSize: 12, color: "#7b8776" }}>
                  状态读取中...
                </div>
              ) : membershipBlocked ? (
                <div style={{ fontSize: 12, color: "#7b8776", lineHeight: 1.7 }}>
                  {getCreateContentBlockedText(membership)}，请{" "}
                  <Link href="/membership" style={{ color: "#4c7b3f", fontWeight: 700 }}>
                    查看云空间
                  </Link>
                  。
                </div>
              ) : (
                <div style={{ fontSize: 12, color: "#7b8776" }}>
                  登录后可评论。
                </div>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
