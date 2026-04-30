"use client";

import Link from "next/link";
import {
  Suspense,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type CSSProperties,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  MARKET_ITEM_CATEGORY_OPTIONS,
  MARKET_POST_TYPE_OPTIONS,
  type MarketItemCategory,
  type MarketPostType,
} from "@/lib/market-types";
import type { SupabaseUser } from "@/lib/domain-types";

type ArchiveOption = {
  id: string;
  title: string | null;
  system_name: string | null;
  species_name_snapshot: string | null;
};

type ProfileLocation = {
  country_name: string | null;
  region_name: string | null;
  city_name: string | null;
  location: string | null;
};

type SourceRecordBrief = {
  id: string;
  archive_id: string | null;
  user_id: string | null;
  note: string | null;
  photo_time: string | null;
};

type SourceMediaOption = {
  id: string;
  record_id: string | null;
  url: string;
  created_at: string | null;
};
export default function NewMarketPostPage() {
  return (
    <Suspense fallback={<main style={pageStyle}>加载中...</main>}>
      <NewMarketPostPageContent />
    </Suspense>
  );
}
function NewMarketPostPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const sourceArchiveIdParam = searchParams.get("archiveId") || "";
  const sourceRecordIdParam = searchParams.get("recordId") || "";

  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [archives, setArchives] = useState<ArchiveOption[]>([]);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [postType, setPostType] = useState<MarketPostType>("offer");
  const [itemCategory, setItemCategory] =
    useState<MarketItemCategory>("seedling");
  const [archiveId, setArchiveId] = useState("");
  const [locationText, setLocationText] = useState("");

  const [sourceRecordId, setSourceRecordId] = useState("");
  const [sourceRecordHint, setSourceRecordHint] = useState("");
  const [sourceMediaOptions, setSourceMediaOptions] = useState<
    SourceMediaOption[]
  >([]);
  const [selectedSourceMediaIds, setSelectedSourceMediaIds] = useState<string[]>(
    []
  );

  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const isFromSourceRecord = Boolean(sourceRecordId);

  useEffect(() => {
    async function init() {
      setLoading(true);

      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (error || !user) {
        router.push("/login");
        return;
      }

      setUser(user);

      const [profileResult, archivesResult] = await Promise.all([
        supabase
          .from("profiles")
          .select("country_name, region_name, city_name, location")
          .eq("id", user.id)
          .maybeSingle(),

        supabase
          .from("archives")
          .select("id, title, system_name, species_name_snapshot")
          .eq("user_id", user.id)
          .order("last_record_time", { ascending: false }),
      ]);

      const profile = (profileResult.data || null) as ProfileLocation | null;
      const defaultLocation = buildLocationText(profile);
      setLocationText(defaultLocation);

      const archiveRows = (archivesResult.data || []) as ArchiveOption[];
      setArchives(archiveRows);

      if (sourceArchiveIdParam) {
        setArchiveId(sourceArchiveIdParam);
      }

      if (sourceRecordIdParam) {
        const { data: recordData, error: recordError } = await supabase
          .from("records")
          .select("id, archive_id, user_id, note, photo_time")
          .eq("id", sourceRecordIdParam)
          .eq("user_id", user.id)
          .maybeSingle();

        if (recordError) {
          console.error("load source record error:", recordError);
        }

        const sourceRecord = (recordData || null) as SourceRecordBrief | null;

        if (sourceRecord) {
          const nextArchiveId = sourceRecord.archive_id || sourceArchiveIdParam;
          const sourceArchive = archiveRows.find(
            (item) => item.id === nextArchiveId
          );

          const archiveName =
            sourceArchive?.title ||
            sourceArchive?.system_name ||
            sourceArchive?.species_name_snapshot ||
            "来源项目";

          setSourceRecordId(sourceRecord.id);
          setArchiveId(nextArchiveId || "");

          setTitle(`${archiveName}的集市信息`);

          if (sourceRecord.note) {
            setDescription(sourceRecord.note);
          }

          setSourceRecordHint(
            sourceRecord.photo_time
              ? `${archiveName} · ${formatSourceRecordTime(
                  sourceRecord.photo_time
                )}`
              : archiveName
          );

          const { data: mediaData, error: mediaError } = await supabase
            .from("media")
            .select("id, record_id, url, created_at")
            .eq("record_id", sourceRecord.id)
            .eq("user_id", user.id)
            .eq("type", "image")
            .order("created_at", { ascending: true });

          if (mediaError) {
            console.error("load source record media error:", mediaError);
            setSourceMediaOptions([]);
          } else {
            setSourceMediaOptions((mediaData || []) as SourceMediaOption[]);
          }
        }
      }

      setLoading(false);
    }

    void init();
  }, [router, sourceArchiveIdParam, sourceRecordIdParam]);

  useEffect(() => {
    return () => {
      if (coverPreviewUrl) {
        URL.revokeObjectURL(coverPreviewUrl);
      }
    };
  }, [coverPreviewUrl]);

  const selectedArchive = useMemo(() => {
    return archives.find((item) => item.id === archiveId) || null;
  }, [archives, archiveId]);

  const selectedSourceMediaRows = useMemo(() => {
    return selectedSourceMediaIds
      .map((id) => sourceMediaOptions.find((item) => item.id === id) || null)
      .filter(Boolean) as SourceMediaOption[];
  }, [selectedSourceMediaIds, sourceMediaOptions]);

  function toggleSourceMedia(mediaId: string) {
    setSelectedSourceMediaIds((prev) => {
      if (prev.includes(mediaId)) {
        return prev.filter((id) => id !== mediaId);
      }

      return [...prev, mediaId];
    });
  }

  function handleCoverFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      setCoverFile(null);
      setCoverPreviewUrl("");
      return;
    }

    if (!file.type.startsWith("image/")) {
      setErrorMsg("封面图请选择图片文件");
      setCoverFile(null);
      setCoverPreviewUrl("");
      return;
    }

    if (file.size > 6 * 1024 * 1024) {
      setErrorMsg("封面图请控制在 6MB 以内");
      setCoverFile(null);
      setCoverPreviewUrl("");
      return;
    }

    if (coverPreviewUrl) {
      URL.revokeObjectURL(coverPreviewUrl);
    }

    setErrorMsg("");
    setCoverFile(file);
    setCoverPreviewUrl(URL.createObjectURL(file));
  }

  function clearCoverFile() {
    if (coverPreviewUrl) {
      URL.revokeObjectURL(coverPreviewUrl);
    }

    setCoverFile(null);
    setCoverPreviewUrl("");
  }

  async function uploadMarketCoverImage(params: {
    userId: string;
    postId: string;
    file: File;
  }) {
    const safeName = params.file.name.replace(/[^\w.\-]+/g, "_") || "cover.jpg";
    const filePath = `${params.userId}/market/${params.postId}/${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from("media")
      .upload(filePath, params.file, {
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      console.error("upload market cover error:", uploadError);
      return null;
    }

    const { data } = supabase.storage.from("media").getPublicUrl(filePath);

    return {
      path: filePath,
      url: data.publicUrl,
    };
  }

  async function handleSubmit() {
    if (!user || saving) return;

    const safeTitle = title.trim();
    const safeDescription = description.trim();
    const safeLocation = locationText.trim();

    if (!safeTitle) {
      setErrorMsg("请输入标题");
      return;
    }

    setSaving(true);
    setErrorMsg("");

    const firstSourceMedia = selectedSourceMediaRows[0] || null;

    const { data, error } = await supabase
      .from("market_posts")
      .insert({
        user_id: user.id,
        archive_id: archiveId || null,
        source_record_id: sourceRecordId || null,
        title: safeTitle,
        description: safeDescription || null,
        post_type: postType,
        item_category: itemCategory,
        location_text: safeLocation || null,
        cover_image_url: firstSourceMedia?.url || null,
        cover_image_path: null,
        status: "active",
      })
      .select("id")
      .single();

    if (error || !data?.id) {
      console.error("create market post error:", error);
      setSaving(false);
      setErrorMsg("发布失败，请稍后重试");
      return;
    }

    const postId = data.id as string;

    if (selectedSourceMediaRows.length > 0) {
      const mediaInsertRows = selectedSourceMediaRows.map((item, index) => ({
        market_post_id: postId,
        user_id: user.id,
        url: item.url,
        path: null,
        source_media_id: item.id,
        source_record_id: sourceRecordId || null,
        sort_order: index,
      }));

      const { error: marketMediaError } = await supabase
        .from("market_media")
        .insert(mediaInsertRows);

      if (marketMediaError) {
        console.error("create market media error:", marketMediaError);

        await supabase
          .from("market_posts")
          .delete()
          .eq("id", postId)
          .eq("user_id", user.id);

        setSaving(false);
        setErrorMsg("保存来源图片失败，请稍后重试");
        return;
      }
    }

    if (!isFromSourceRecord && coverFile) {
      const cover = await uploadMarketCoverImage({
        userId: user.id,
        postId,
        file: coverFile,
      });

      if (!cover) {
        await supabase
          .from("market_posts")
          .delete()
          .eq("id", postId)
          .eq("user_id", user.id);

        setSaving(false);
        setErrorMsg("封面图上传失败，请稍后重试");
        return;
      }

      const { error: updateCoverError } = await supabase
        .from("market_posts")
        .update({
          cover_image_url: cover.url,
          cover_image_path: cover.path,
        })
        .eq("id", postId)
        .eq("user_id", user.id);

      if (updateCoverError) {
        console.error("save market cover error:", updateCoverError);

        await supabase.storage.from("media").remove([cover.path]);
        await supabase
          .from("market_posts")
          .delete()
          .eq("id", postId)
          .eq("user_id", user.id);

        setSaving(false);
        setErrorMsg("封面图保存失败，请稍后重试");
        return;
      }
    }

    setSaving(false);
    router.push(`/market/${postId}`);
  }

  if (loading) {
    return <main style={pageStyle}>加载中...</main>;
  }

  return (
    <main style={pageStyle}>
      <div style={shellStyle}>
        <Link href="/market" style={backLinkStyle}>
          ← 返回集市
        </Link>

        <section style={panelStyle}>
          <h1 style={titleStyle}>发布集市信息</h1>
          <p style={subtitleStyle}>
            可发布种子、苗、枝条、盆栽、水草、鱼虾、昆虫和工具设施等交换信息。
          </p>

          {errorMsg ? <div style={errorStyle}>{errorMsg}</div> : null}

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
                {MARKET_POST_TYPE_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
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
                {MARKET_ITEM_CATEGORY_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
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

            {isFromSourceRecord ? (
              <div>
                <label style={labelStyle}>来源记录图片，可多选</label>

                {sourceMediaOptions.length > 0 ? (
                  <>
                    <div style={sourceMediaGridStyle}>
                      {sourceMediaOptions.map((media) => {
                        const active = selectedSourceMediaIds.includes(media.id);
                        const selectedIndex = selectedSourceMediaIds.indexOf(
                          media.id
                        );

                        return (
                          <button
                            key={media.id}
                            type="button"
                            onClick={() => toggleSourceMedia(media.id)}
                            style={sourceMediaButtonStyle(active)}
                          >
                            <img
                              src={media.url}
                              alt=""
                              style={sourceMediaImageStyle}
                            />
                            {active ? (
                              <span style={sourceMediaSelectedBadgeStyle}>
                                {selectedIndex === 0
                                  ? "封面"
                                  : `已选 ${selectedIndex + 1}`}
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>

                    <div style={coverHintStyle}>
                      已选 {selectedSourceMediaIds.length} 张。第一张选中的图片会作为集市封面。
                    </div>
                  </>
                ) : (
                  <div style={coverHintStyle}>
                    这条来源记录还没有图片。你可以先发布，之后在集市详情或编辑页补充图片。
                  </div>
                )}
              </div>
            ) : (
              <div>
                <label style={labelStyle}>封面图，可选</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleCoverFileChange}
                  style={fileInputStyle}
                />

                {coverPreviewUrl ? (
                  <div style={coverPreviewWrapStyle}>
                    <img
                      src={coverPreviewUrl}
                      alt="封面预览"
                      style={coverPreviewStyle}
                    />
                    <button
                      type="button"
                      onClick={clearCoverFile}
                      style={removeImageButtonStyle}
                    >
                      移除封面图
                    </button>
                  </div>
                ) : (
                  <div style={coverHintStyle}>
                    建议上传实物照片，例如苗、枝条、种子、工具或水族内容。
                  </div>
                )}
              </div>
            )}

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

            {sourceRecordHint ? (
              <div style={sourceRecordHintStyle}>
                来源记录：{sourceRecordHint}
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
              <div style={coverHintStyle}>
                建议填写“省/州 + 城市 + 区域”，别人更容易通过地区筛选找到。
              </div>
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
              {saving ? "发布中..." : "发布"}
            </button>

            <Link href="/market" style={secondaryButtonStyle}>
              取消
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}

function formatSourceRecordTime(value?: string | null) {
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

function buildLocationText(profile?: ProfileLocation | null) {
  if (!profile) return "";

  const parts = [
    profile.country_name,
    profile.region_name,
    profile.city_name,
  ].filter(Boolean);

  if (parts.length > 0) return parts.join(" · ");

  return profile.location || "";
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

const fileInputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #d8e3d3",
  borderRadius: 12,
  padding: "9px 10px",
  fontSize: 14,
  background: "#fff",
};

const sourceMediaGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(92px, 1fr))",
  gap: 8,
};

function sourceMediaButtonStyle(active: boolean): CSSProperties {
  return {
    position: "relative",
    border: active ? "2px solid #4f7b45" : "1px solid #dfe8da",
    background: "#fff",
    borderRadius: 14,
    padding: 3,
    cursor: "pointer",
    overflow: "hidden",
  };
}

const sourceMediaImageStyle: CSSProperties = {
  width: "100%",
  aspectRatio: "1 / 1",
  objectFit: "cover",
  borderRadius: 10,
  display: "block",
};

const sourceMediaSelectedBadgeStyle: CSSProperties = {
  position: "absolute",
  right: 6,
  top: 6,
  background: "#4f7b45",
  color: "#fff",
  borderRadius: 999,
  padding: "3px 7px",
  fontSize: 11,
  fontWeight: 700,
};

const coverHintStyle: CSSProperties = {
  marginTop: 7,
  color: "#8a9585",
  fontSize: 12,
  lineHeight: 1.6,
};

const coverPreviewWrapStyle: CSSProperties = {
  marginTop: 10,
  display: "grid",
  gap: 8,
};

const coverPreviewStyle: CSSProperties = {
  width: "100%",
  maxHeight: 260,
  objectFit: "cover",
  borderRadius: 14,
  border: "1px solid #e4ece0",
  background: "#f6f8f3",
};

const removeImageButtonStyle: CSSProperties = {
  width: "fit-content",
  border: "1px solid #eadbd7",
  background: "#fff",
  color: "#b74636",
  borderRadius: 999,
  padding: "6px 11px",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 700,
};

const archiveHintStyle: CSSProperties = {
  background: "#f7fbf2",
  border: "1px solid #dfe8da",
  borderRadius: 12,
  padding: "9px 10px",
  color: "#5f6a5b",
  fontSize: 13,
};

const sourceRecordHintStyle: CSSProperties = {
  background: "#fffaf0",
  border: "1px solid #f1e3c7",
  borderRadius: 12,
  padding: "9px 10px",
  color: "#7a6636",
  fontSize: 13,
  lineHeight: 1.6,
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