"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type CSSProperties,
} from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  MARKET_ITEM_CATEGORY_OPTIONS,
  MARKET_POST_TYPE_OPTIONS,
  type MarketItemCategory,
  type MarketPostRow,
  type MarketPostType,
} from "@/lib/market-types";
import type { SupabaseUser } from "@/lib/domain-types";

type ArchiveOption = {
  id: string;
  title: string | null;
  system_name: string | null;
  species_name_snapshot: string | null;
};

type MarketMediaRow = {
  id: string;
  market_post_id: string;
  user_id: string;
  url: string;
  path: string | null;
  source_media_id: string | null;
  source_record_id: string | null;
  sort_order: number | null;
  created_at: string | null;
};

export default function EditMarketPostPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id || "");

  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [item, setItem] = useState<MarketPostRow | null>(null);
  const [archives, setArchives] = useState<ArchiveOption[]>([]);
  const [marketMedia, setMarketMedia] = useState<MarketMediaRow[]>([]);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [postType, setPostType] = useState<MarketPostType>("offer");
  const [itemCategory, setItemCategory] =
    useState<MarketItemCategory>("seedling");
  const [archiveId, setArchiveId] = useState("");
  const [locationText, setLocationText] = useState("");

  const [uploading, setUploading] = useState(false);
  const [workingMediaId, setWorkingMediaId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [notOwner, setNotOwner] = useState(false);

  useEffect(() => {
    async function init() {
      setLoading(true);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.push("/login");
        return;
      }

      setUser(user);

      const { data, error } = await supabase
        .from("market_posts")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error) {
        console.error("load market post for edit error:", error);
        setItem(null);
        setLoading(false);
        return;
      }

      const row = (data || null) as MarketPostRow | null;

      if (!row) {
        setItem(null);
        setLoading(false);
        return;
      }

      if (row.user_id !== user.id) {
        setNotOwner(true);
        setItem(row);
        setLoading(false);
        return;
      }

      setItem(row);
      setTitle(row.title || "");
      setDescription(row.description || "");
      setPostType(row.post_type);
      setItemCategory(row.item_category);
      setArchiveId(row.archive_id || "");
      setLocationText(row.location_text || "");

      const [archiveResult, mediaResult] = await Promise.all([
        supabase
          .from("archives")
          .select("id, title, system_name, species_name_snapshot")
          .eq("user_id", user.id)
          .order("last_record_time", { ascending: false }),

        supabase
          .from("market_media")
          .select("*")
          .eq("market_post_id", row.id)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true }),
      ]);

      if (archiveResult.error) {
        console.error("load archives for market edit error:", archiveResult.error);
      }

      if (mediaResult.error) {
        console.error("load market media for edit error:", mediaResult.error);
      }

      setArchives((archiveResult.data || []) as ArchiveOption[]);
      setMarketMedia((mediaResult.data || []) as MarketMediaRow[]);
      setLoading(false);
    }

    if (id) {
      void init();
    }
  }, [id, router]);

  const selectedArchive = useMemo(() => {
    return archives.find((archive) => archive.id === archiveId) || null;
  }, [archives, archiveId]);

  async function reloadMarketMedia(postId: string) {
    const { data, error } = await supabase
      .from("market_media")
      .select("*")
      .eq("market_post_id", postId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      console.error("reload market media error:", error);
      return;
    }

    setMarketMedia((data || []) as MarketMediaRow[]);
  }

  async function handleSubmit() {
    if (!user || !item || saving || notOwner) return;

    const safeTitle = title.trim();
    const safeDescription = description.trim();
    const safeLocation = locationText.trim();

    if (!safeTitle) {
      setErrorMsg("请输入标题");
      return;
    }

    setSaving(true);
    setErrorMsg("");

    const { error } = await supabase
      .from("market_posts")
      .update({
        archive_id: archiveId || null,
        title: safeTitle,
        description: safeDescription || null,
        post_type: postType,
        item_category: itemCategory,
        location_text: safeLocation || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", item.id)
      .eq("user_id", user.id);

    setSaving(false);

    if (error) {
      console.error("update market post error:", error);
      setErrorMsg("保存失败，请稍后重试");
      return;
    }

    router.push(`/market/${item.id}`);
  }

  async function handleUploadImages(event: ChangeEvent<HTMLInputElement>) {
    if (!user || !item || uploading) return;

    const files = Array.from(event.target.files || []);
    event.target.value = "";

    if (files.length === 0) return;

    const imageFiles = files.filter((file) => file.type.startsWith("image/"));

    if (imageFiles.length !== files.length) {
      setErrorMsg("只能上传图片文件");
      return;
    }

    const tooLarge = imageFiles.find((file) => file.size > 6 * 1024 * 1024);
    if (tooLarge) {
      setErrorMsg("单张图片请控制在 6MB 以内");
      return;
    }

    setUploading(true);
    setErrorMsg("");

    const currentMaxSort = marketMedia.reduce((max, media) => {
      return Math.max(max, Number(media.sort_order || 0));
    }, -1);

    const uploadedRows: {
      url: string;
      path: string;
      sort_order: number;
    }[] = [];

    try {
      for (let index = 0; index < imageFiles.length; index += 1) {
        const file = imageFiles[index];
        const safeName = file.name.replace(/[^\w.\-]+/g, "_") || "image.jpg";
        const filePath = `${user.id}/market/${item.id}/${Date.now()}-${index}-${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from("media")
          .upload(filePath, file, {
            cacheControl: "3600",
            upsert: false,
          });

        if (uploadError) {
          throw uploadError;
        }

        const { data } = supabase.storage.from("media").getPublicUrl(filePath);

        uploadedRows.push({
          url: data.publicUrl,
          path: filePath,
          sort_order: currentMaxSort + index + 1,
        });
      }

      const insertRows = uploadedRows.map((row) => ({
        market_post_id: item.id,
        user_id: user.id,
        url: row.url,
        path: row.path,
        source_media_id: null,
        source_record_id: null,
        sort_order: row.sort_order,
      }));

      const { error: insertError } = await supabase
        .from("market_media")
        .insert(insertRows);

      if (insertError) {
        throw insertError;
      }

      if (!item.cover_image_url && uploadedRows[0]) {
        await setCoverFromValue({
          url: uploadedRows[0].url,
          path: uploadedRows[0].path,
        });
      }

      await reloadMarketMedia(item.id);
    } catch (err) {
      console.error("upload market images error:", err);

      const paths = uploadedRows.map((row) => row.path);
      if (paths.length > 0) {
        await supabase.storage.from("media").remove(paths);
      }

      setErrorMsg("图片上传失败，请稍后重试");
    } finally {
      setUploading(false);
    }
  }

  async function setCoverFromValue(params: { url: string; path: string | null }) {
    if (!user || !item) return;

    const oldCoverPath = item.cover_image_path || null;
    const oldCoverPathIsStillMedia = Boolean(
      oldCoverPath && marketMedia.some((media) => media.path === oldCoverPath)
    );

    const { error } = await supabase
      .from("market_posts")
      .update({
        cover_image_url: params.url,
        cover_image_path: params.path,
      })
      .eq("id", item.id)
      .eq("user_id", user.id);

    if (error) {
      console.error("set cover error:", error);
      setErrorMsg("设置封面失败");
      return;
    }

    if (
      oldCoverPath &&
      oldCoverPath !== params.path &&
      !oldCoverPathIsStillMedia
    ) {
      const { error: removeOldError } = await supabase.storage
        .from("media")
        .remove([oldCoverPath]);

      if (removeOldError) {
        console.error("remove old standalone cover error:", removeOldError);
      }
    }

    setItem({
      ...item,
      cover_image_url: params.url,
      cover_image_path: params.path,
    });
  }

  async function handleSetCover(media: MarketMediaRow) {
    if (!item || !user || workingMediaId) return;

    setWorkingMediaId(media.id);
    await setCoverFromValue({
      url: media.url,
      path: media.path,
    });
    setWorkingMediaId(null);
  }

  async function handleDeleteMedia(media: MarketMediaRow) {
    if (!item || !user || workingMediaId) return;

    const ok = window.confirm("确定删除这张集市图片吗？");
    if (!ok) return;

    setWorkingMediaId(media.id);
    setErrorMsg("");

    if (media.path) {
      const { error: removeError } = await supabase.storage
        .from("media")
        .remove([media.path]);

      if (removeError) {
        console.error("remove market media storage error:", removeError);
        setErrorMsg("图片文件删除失败");
        setWorkingMediaId(null);
        return;
      }
    }

    const { error } = await supabase
      .from("market_media")
      .delete()
      .eq("id", media.id)
      .eq("user_id", user.id);

    if (error) {
      console.error("delete market media error:", error);
      setErrorMsg("删除图片失败");
      setWorkingMediaId(null);
      return;
    }

    const remaining = marketMedia.filter((item) => item.id !== media.id);
    const deletingCurrentCover = item.cover_image_url === media.url;

    if (deletingCurrentCover) {
      const nextCover = remaining[0] || null;

      const { error: updateCoverError } = await supabase
        .from("market_posts")
        .update({
          cover_image_url: nextCover?.url || null,
          cover_image_path: nextCover?.path || null,
        })
        .eq("id", item.id)
        .eq("user_id", user.id);

      if (updateCoverError) {
        console.error("reset cover after delete media error:", updateCoverError);
      } else {
        setItem({
          ...item,
          cover_image_url: nextCover?.url || null,
          cover_image_path: nextCover?.path || null,
        });
      }
    }

    setMarketMedia(remaining);
    setWorkingMediaId(null);
  }

  if (loading) {
    return <main style={pageStyle}>加载中...</main>;
  }

  if (!item) {
    return (
      <main style={pageStyle}>
        <div style={shellStyle}>
          <Link href="/market" style={backLinkStyle}>
            ← 返回集市
          </Link>
          <section style={emptyStyle}>这条集市信息不存在或已不可见</section>
        </div>
      </main>
    );
  }

  if (notOwner) {
    return (
      <main style={pageStyle}>
        <div style={shellStyle}>
          <Link href={`/market/${item.id}`} style={backLinkStyle}>
            ← 返回集市详情
          </Link>
          <section style={emptyStyle}>只有发布者可以编辑这条集市信息。</section>
        </div>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <div style={shellStyle}>
        <Link href={`/market/${item.id}`} style={backLinkStyle}>
          ← 返回集市详情
        </Link>

        <section style={panelStyle}>
          <h1 style={titleStyle}>编辑集市信息</h1>
          <p style={subtitleStyle}>可修改标题、说明、地区、图片和封面。</p>

          {errorMsg ? <div style={errorStyle}>{errorMsg}</div> : null}

          <section style={imageManagerSectionStyle}>
            <div style={imageManagerHeaderStyle}>
              <div>
                <div style={sectionTitleStyle}>集市图片</div>
                <div style={imageHintStyle}>
                  可上传/拍照补充图片，删除图片，或设置某张图为封面。
                </div>
              </div>

              <label style={uploadButtonStyle}>
                {uploading ? "上传中..." : "上传/拍照"}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleUploadImages}
                  style={{ display: "none" }}
                  disabled={uploading}
                />
              </label>
            </div>

            {marketMedia.length > 0 ? (
              <div style={mediaManageGridStyle}>
                {marketMedia.map((media) => {
                  const isCover = item.cover_image_url === media.url;
                  const isWorking = workingMediaId === media.id;

                  return (
                    <article key={media.id} style={mediaManageCardStyle}>
                      <div style={mediaImageWrapStyle}>
                        <img src={media.url} alt="" style={mediaManageImageStyle} />
                        {isCover ? (
                          <span style={coverBadgeStyle}>封面</span>
                        ) : null}
                        {media.path ? (
                          <span style={uploadedBadgeStyle}>上传图</span>
                        ) : (
                          <span style={sourceBadgeStyle}>记录图</span>
                        )}
                      </div>

                      <div style={mediaActionRowStyle}>
                        <button
                          type="button"
                          onClick={() => handleSetCover(media)}
                          disabled={isCover || isWorking}
                          style={smallButtonStyle(isCover)}
                        >
                          {isCover ? "当前封面" : "设为封面"}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteMedia(media)}
                          disabled={isWorking}
                          style={smallDangerButtonStyle}
                        >
                          {isWorking ? "处理中..." : "删除"}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div style={emptyImageStyle}>
                还没有集市图片。可以上传或拍照补充图片。
              </div>
            )}
          </section>

          <div style={formStyle}>
            <div>
              <label style={labelStyle}>类型</label>
              <select
                value={postType}
                onChange={(event) =>
                  setPostType(event.target.value as MarketPostType)
                }
                style={inputStyle}
              >
                {MARKET_POST_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>类别</label>
              <select
                value={itemCategory}
                onChange={(event) =>
                  setItemCategory(event.target.value as MarketItemCategory)
                }
                style={inputStyle}
              >
                {MARKET_ITEM_CATEGORY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>标题</label>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                style={inputStyle}
                placeholder="例如：薄荷分株出让 / 求换番茄苗"
              />
            </div>

            <div>
              <label style={labelStyle}>关联项目，可选</label>
              <select
                value={archiveId}
                onChange={(event) => setArchiveId(event.target.value)}
                style={inputStyle}
              >
                <option value="">不关联项目</option>
                {archives.map((archive) => {
                  const systemName =
                    archive.system_name || archive.species_name_snapshot || "";

                  return (
                    <option key={archive.id} value={archive.id}>
                      {archive.title || "未命名项目"}
                      {systemName ? ` · ${systemName}` : ""}
                    </option>
                  );
                })}
              </select>
            </div>

            {selectedArchive ? (
              <div style={archiveHintStyle}>
                已关联项目：{selectedArchive.title || "未命名项目"}
              </div>
            ) : null}

            <div>
              <label style={labelStyle}>交易地区</label>
              <input
                value={locationText}
                onChange={(event) => setLocationText(event.target.value)}
                style={inputStyle}
                placeholder="例如：浙江 · 宁波 · 鄞州区 / 加州 · 湾区 · San Jose"
              />
            </div>

            <div>
              <label style={labelStyle}>说明</label>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                style={textareaStyle}
                placeholder="说明数量、状态、交换方式、是否限本地等。"
              />
            </div>
          </div>

          <div style={noticeStyle}>
            第一版集市只做信息发布，不做平台支付、担保、物流和纠纷处理。
          </div>

          <div style={buttonRowStyle}>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              style={primaryButtonStyle}
            >
              {saving ? "保存中..." : "保存修改"}
            </button>

            <Link href={`/market/${item.id}`} style={secondaryButtonStyle}>
              取消
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  background: "#f6f8f3",
  padding: "18px 12px 36px",
};

const shellStyle: CSSProperties = {
  width: "100%",
  maxWidth: 820,
  margin: "0 auto",
};

const backLinkStyle: CSSProperties = {
  display: "inline-block",
  color: "#587050",
  textDecoration: "none",
  fontSize: 14,
  marginBottom: 10,
};

const panelStyle: CSSProperties = {
  background: "#fff",
  border: "1px solid #e4ece0",
  borderRadius: 18,
  padding: 16,
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 26,
  color: "#1f2a1f",
};

const subtitleStyle: CSSProperties = {
  margin: "6px 0 0",
  color: "#6f7b69",
  fontSize: 14,
  lineHeight: 1.7,
};

const sectionTitleStyle: CSSProperties = {
  color: "#1f2a1f",
  fontSize: 17,
  fontWeight: 700,
};

const imageManagerSectionStyle: CSSProperties = {
  marginTop: 16,
  background: "#fafcf8",
  border: "1px solid #e4ece0",
  borderRadius: 16,
  padding: 12,
};

const imageManagerHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  flexWrap: "wrap",
  marginBottom: 12,
};

const imageHintStyle: CSSProperties = {
  marginTop: 4,
  color: "#7b8676",
  fontSize: 12,
  lineHeight: 1.5,
};

const uploadButtonStyle: CSSProperties = {
  display: "inline-block",
  cursor: "pointer",
  background: "#4f7b45",
  color: "#fff",
  borderRadius: 999,
  padding: "8px 13px",
  fontSize: 13,
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const mediaManageGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(128px, 1fr))",
  gap: 10,
};

const mediaManageCardStyle: CSSProperties = {
  background: "#fff",
  border: "1px solid #dfe8da",
  borderRadius: 14,
  padding: 8,
};

const mediaImageWrapStyle: CSSProperties = {
  position: "relative",
  borderRadius: 12,
  overflow: "hidden",
  border: "1px solid #e4ece0",
  background: "#f6f8f3",
};

const mediaManageImageStyle: CSSProperties = {
  width: "100%",
  aspectRatio: "1 / 1",
  objectFit: "cover",
  display: "block",
};

const coverBadgeStyle: CSSProperties = {
  position: "absolute",
  top: 6,
  right: 6,
  background: "#4f7b45",
  color: "#fff",
  borderRadius: 999,
  padding: "3px 7px",
  fontSize: 11,
  fontWeight: 700,
};

const sourceBadgeStyle: CSSProperties = {
  position: "absolute",
  left: 6,
  bottom: 6,
  background: "rgba(255,255,255,0.92)",
  color: "#6f7b69",
  borderRadius: 999,
  padding: "3px 7px",
  fontSize: 11,
  fontWeight: 700,
};

const uploadedBadgeStyle: CSSProperties = {
  ...sourceBadgeStyle,
  color: "#7a6636",
};

const mediaActionRowStyle: CSSProperties = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
  marginTop: 8,
};

function smallButtonStyle(disabled: boolean): CSSProperties {
  return {
    border: "1px solid #d7e2d2",
    background: disabled ? "#edf4e8" : "#fff",
    color: disabled ? "#4f7b45" : "#40583a",
    borderRadius: 999,
    padding: "5px 9px",
    cursor: disabled ? "default" : "pointer",
    fontSize: 12,
    fontWeight: 700,
  };
}

const smallDangerButtonStyle: CSSProperties = {
  border: "1px solid #ffd6cf",
  background: "#fff",
  color: "#c23a2b",
  borderRadius: 999,
  padding: "5px 9px",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 700,
};

const emptyImageStyle: CSSProperties = {
  color: "#7b8676",
  fontSize: 13,
  background: "#fff",
  border: "1px solid #e4ece0",
  borderRadius: 12,
  padding: 12,
};

const formStyle: CSSProperties = {
  display: "grid",
  gap: 12,
  marginTop: 16,
};

const labelStyle: CSSProperties = {
  display: "block",
  marginBottom: 5,
  color: "#5e6959",
  fontSize: 13,
  fontWeight: 700,
};

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #d8e3d3",
  borderRadius: 12,
  padding: "10px 11px",
  fontSize: 14,
  outline: "none",
};

const textareaStyle: CSSProperties = {
  ...inputStyle,
  minHeight: 120,
  resize: "vertical",
  lineHeight: 1.6,
};

const archiveHintStyle: CSSProperties = {
  background: "#f7fbf2",
  border: "1px solid #dfe8da",
  borderRadius: 12,
  padding: "9px 10px",
  color: "#5f6a5b",
  fontSize: 13,
};

const noticeStyle: CSSProperties = {
  marginTop: 14,
  background: "#fffaf0",
  border: "1px solid #f1e3c7",
  borderRadius: 12,
  padding: "10px 12px",
  color: "#7a6636",
  fontSize: 13,
  lineHeight: 1.7,
};

const buttonRowStyle: CSSProperties = {
  display: "flex",
  gap: 10,
  marginTop: 16,
  flexWrap: "wrap",
};

const primaryButtonStyle: CSSProperties = {
  border: "none",
  background: "#4f7b45",
  color: "#fff",
  borderRadius: 12,
  padding: "10px 16px",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 700,
};

const secondaryButtonStyle: CSSProperties = {
  textDecoration: "none",
  border: "1px solid #d8e3d3",
  color: "#40583a",
  borderRadius: 12,
  padding: "9px 15px",
  fontSize: 14,
  fontWeight: 700,
};

const errorStyle: CSSProperties = {
  marginTop: 12,
  background: "#fff2f0",
  border: "1px solid #ffd6cf",
  color: "#c23a2b",
  padding: "10px 12px",
  borderRadius: 12,
  fontSize: 14,
};

const emptyStyle: CSSProperties = {
  background: "#fff",
  border: "1px solid #e4ece0",
  borderRadius: 16,
  padding: 28,
  color: "#6f7b69",
  textAlign: "center",
};