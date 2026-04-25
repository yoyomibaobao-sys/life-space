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
import type { AppProfile } from "@/lib/domain-types";

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
}: {
  recordId: string;
  recordOwnerId: string;
  recordStatusTag: "help" | "resolved" | null;
  currentUserId: string | null | undefined;
  initialCommentCount?: number | null;
  onCommentCountChange?: (count: number) => void;
}) {
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [recordLikeCount, setRecordLikeCount] = useState(0);
  const [recordLikedByMe, setRecordLikedByMe] = useState(false);

  const canWrite = Boolean(currentUserId);
  const canAwardFlowers = Boolean(
    currentUserId &&
      currentUserId === recordOwnerId &&
      (recordStatusTag === "help" || recordStatusTag === "resolved")
  );

  const commentCount = comments.length || initialCommentCount || 0;
  const lastReportedCountRef = useRef<number | null>(null);

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordId, currentUserId]);

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
    const profileIds = Array.from(new Set(commentRows.map((item) => item.user_id).filter(Boolean)));

    const [profilesResult, commentLikesResult, flowersResult, recordLikesResult] = await Promise.all([
      profileIds.length
        ? supabase.from("profiles").select("id, username, avatar_url").in("id", profileIds)
        : Promise.resolve({ data: [] as Pick<AppProfile, "id" | "username" | "avatar_url">[] }),
      commentIds.length
        ? supabase.from("comment_likes").select("id, comment_id, user_id, created_at").in("comment_id", commentIds)
        : Promise.resolve({ data: [] as CommentLikeRow[] }),
      commentIds.length
        ? supabase
            .from("comment_flowers")
            .select("id, record_id, comment_id, sender_user_id, receiver_user_id, created_at, revoked_at, revoke_until, reason")
            .eq("record_id", recordId)
            .in("comment_id", commentIds)
        : Promise.resolve({ data: [] as CommentFlowerRow[] }),
      supabase
        .from("record_likes")
        .select("id, record_id, user_id, created_at")
        .eq("record_id", recordId),
    ]);

    const profileMap = new Map<string, Pick<AppProfile, "id" | "username" | "avatar_url">>();
    for (const profile of ((profilesResult as any).data || []) as Pick<AppProfile, "id" | "username" | "avatar_url">[]) {
      profileMap.set(profile.id, profile);
    }

    const commentLikes = ((commentLikesResult as any).data || []) as CommentLikeRow[];
    const flowers = ((flowersResult as any).data || []) as CommentFlowerRow[];
    const recordLikes = ((recordLikesResult as any).data || []) as RecordLikeRow[];

    const nextComments: CommentItem[] = commentRows.map((comment) => {
      const likes = commentLikes.filter((item) => item.comment_id === comment.id);
      const flowerRows = flowers.filter((item) => item.comment_id === comment.id && !item.revoked_at);
      const myFlower = flowers.find(
        (item) => item.comment_id === comment.id && item.sender_user_id === currentUserId
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
    setRecordLikedByMe(recordLikes.some((item) => item.user_id === currentUserId));
    setLoading(false);
  }

  async function handleToggleRecordLike() {
    if (!currentUserId) {
      showToast("请先登录后再点赞");
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
      showToast("请先登录后再评论");
      return;
    }
    if (!content) {
      showToast("请输入评论内容");
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
    showToast("评论已发送");
    await loadData();
  }

  async function handleToggleCommentLike(comment: CommentItem) {
    if (!currentUserId) {
      showToast("请先登录后再点赞");
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
            ? { ...item, likedByMe: false, likeCount: Math.max(0, item.likeCount - 1) }
            : item
        )
      );
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
          : item
      )
    );
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

    const revokeUntil = flower.revoke_until ? new Date(flower.revoke_until).getTime() : 0;
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
    if (recordStatusTag === "help") return "当前是求助记录，记录主人可给真正有帮助的评论送花。";
    if (recordStatusTag === "resolved") return "这条求助已解决，历史花朵保留，仍可补送花。";
    return "欢迎留下评论交流经验。";
  }, [recordStatusTag]);

  return (
    <section
      style={{
        marginTop: 14,
        paddingTop: 12,
        borderTop: "1px solid #eef2ec",
      }}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={handleToggleRecordLike}
          style={smallActionButtonStyle(recordLikedByMe ? "#f8f1ff" : "#fff", recordLikedByMe ? "#7440a0" : "#667066", recordLikedByMe ? "#dfccf0" : "#dfe5dc")}
        >
          {recordLikedByMe ? "已点赞" : "点赞"} · {recordLikeCount}
        </button>
        <span style={{ fontSize: 12, color: "#7a8676" }}>评论 · {commentCount}</span>
        {(recordStatusTag === "help" || recordStatusTag === "resolved") ? (
          <span style={{ fontSize: 12, color: "#8a6b2f" }}>花朵仅限求助记录主人送给有帮助的评论</span>
        ) : null}
      </div>

      <div style={{ marginTop: 10, fontSize: 12, color: "#7c8878", lineHeight: 1.7 }}>{commentHint}</div>

      <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
        {loading ? (
          <div style={{ fontSize: 13, color: "#7c8878" }}>评论加载中...</div>
        ) : comments.length === 0 ? (
          <div style={{ fontSize: 13, color: "#7c8878" }}>还没有评论，欢迎留下第一条交流。</div>
        ) : (
          comments.map((comment) => {
            const revokeUntilTime = comment.myFlower?.revoke_until ? new Date(comment.myFlower.revoke_until).getTime() : 0;
            const canRevoke = Boolean(
              comment.myFlower &&
                !comment.myFlower.revoked_at &&
                revokeUntilTime > Date.now()
            );

            return (
              <article
                key={comment.id}
                style={{
                  border: "1px solid #edf1ea",
                  borderRadius: 14,
                  padding: 12,
                  background: "#fafcf9",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
                    {comment.profile?.avatar_url ? (
                      <img src={String(comment.profile.avatar_url)} alt="" style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover" }} />
                    ) : (
                      <div style={{ width: 34, height: 34, borderRadius: "50%", background: "#eaf2e4", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🌱</div>
                    )}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#22301f" }}>{comment.profile?.username || "用户"}</div>
                      <div style={{ fontSize: 12, color: "#7b8776" }}>{formatDateTime(comment.created_at)}</div>
                    </div>
                  </div>
                  {comment.flowerCount > 0 ? (
                    <div style={{ fontSize: 12, color: "#9d6f1f", border: "1px solid #f1ddb7", background: "#fff9ef", padding: "4px 10px", borderRadius: 999 }}>
                      🌸 已获花朵
                    </div>
                  ) : null}
                </div>

                <div style={{ marginTop: 10, fontSize: 14, color: "#233022", lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
                  {comment.content}
                </div>

                <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <button
                    type="button"
                    onClick={() => void handleToggleCommentLike(comment)}
                    style={smallActionButtonStyle(comment.likedByMe ? "#f3f8ff" : "#fff", comment.likedByMe ? "#2f5f93" : "#667066", comment.likedByMe ? "#cfe0f4" : "#dfe5dc")}
                  >
                    {comment.likedByMe ? "已赞" : "点赞"} · {comment.likeCount}
                  </button>

                  {canAwardFlowers && comment.user_id !== currentUserId ? (
                    comment.myFlower && !comment.myFlower.revoked_at ? (
                      <button
                        type="button"
                        onClick={() => void handleRevokeFlower(comment)}
                        style={smallActionButtonStyle("#fff6f2", "#9f5d22", "#efd8c4")}
                      >
                        {canRevoke ? "已送花 · 可撤回" : "已送花"}
                      </button>
                    ) : comment.myFlower?.revoked_at ? (
                      <span style={{ fontSize: 12, color: "#9b8771" }}>已撤回送花</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void handleSendFlower(comment)}
                        style={smallActionButtonStyle("#fff9ef", "#9d6f1f", "#f1ddb7")}
                      >
                        送花
                      </button>
                    )
                  ) : null}
                </div>
              </article>
            );
          })
        )}
      </div>

      <div style={{ marginTop: 12 }}>
        {canWrite ? (
          <>
            <textarea
              value={commentText}
              onChange={(event) => setCommentText(event.target.value)}
              placeholder="写下你的评论或经验…"
              rows={3}
              style={{
                width: "100%",
                borderRadius: 14,
                border: "1px solid #dce5d7",
                padding: 12,
                fontSize: 14,
                resize: "vertical",
                outline: "none",
                background: "#fff",
              }}
            />
            <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ fontSize: 12, color: "#7b8776" }}>
                评论会显示在这条记录下。花朵记录可在 <Link href="/profile/flowers" style={{ color: "#4c7b3f" }}>我的花朵</Link> 中追溯。
              </div>
              <button
                type="button"
                onClick={() => void handleSubmitComment()}
                disabled={submitting}
                style={{
                  border: "1px solid #d7e4d0",
                  background: "#f6fbf3",
                  color: "#365b2e",
                  borderRadius: 999,
                  padding: "10px 16px",
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                {submitting ? "发送中..." : "发表评论"}
              </button>
            </div>
          </>
        ) : (
          <div style={{ fontSize: 13, color: "#7b8776" }}>登录后可评论和点赞。</div>
        )}
      </div>
    </section>
  );
}
