from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"anchor not found: {label}")
    return text.replace(old, new, 1)


# 1. Experience card detail: move video before the card/timeline.
page_path = Path("app/experience-cards/[id]/page.tsx")
page = page_path.read_text(encoding="utf-8")
old_order = '''      <article style={cardShellStyle}>\n'''
new_order = '''      {isOwner ? (\n        <ExperienceCardVideoPanel detail={detail} />\n      ) : null}\n\n      <article style={cardShellStyle}>\n'''
if new_order.strip() not in page:
    page = replace_once(page, old_order, new_order, "experience card video first")
old_video_block = '''\n      {isOwner ? (\n        <ExperienceCardVideoPanel detail={detail} />\n      ) : null}\n\n      <footer style={footerStyle}>\n'''
page = replace_once(page, old_video_block, '''\n      <footer style={footerStyle}>\n''', "remove old video position")
page_path.write_text(page, encoding="utf-8")


# 2. Experience card video scene selection and smaller text overlay.
video_lib_path = Path("lib/experience-card-video.ts")
video_lib = video_lib_path.read_text(encoding="utf-8")
video_lib = replace_once(
    video_lib,
    '''export type ExperienceCardVideoImage = ImageBitmap | HTMLImageElement;\nexport type ExperienceCardVideoImages = Map<string, ExperienceCardVideoImage>;\n''',
    '''export type ExperienceCardVideoImage = ImageBitmap | HTMLImageElement;\nexport type ExperienceCardVideoImages = Map<string, ExperienceCardVideoImage>;\nexport type ExperienceCardVideoImageSelection = Record<string, string | null>;\n''',
    "video image selection type",
)
video_lib = replace_once(
    video_lib,
    '''export function buildExperienceCardVideoScenes(\n  detail: ExperienceCardDetail\n): ExperienceCardVideoScene[] {\n''',
    '''export function buildExperienceCardVideoScenes(\n  detail: ExperienceCardDetail,\n  imageSelection?: ExperienceCardVideoImageSelection\n): ExperienceCardVideoScene[] {\n''',
    "scene builder signature",
)
video_lib = replace_once(
    video_lib,
    '''    const chunks = splitExperienceCardVideoText(record.note);\n    const imageUrl = getExperienceCardRecordVideoImageUrl(record);\n    const tags = getRecordTags(record);\n''',
    '''    const chunks = splitExperienceCardVideoText(record.note);\n    const hasExplicitImageSelection = Boolean(\n      imageSelection &&\n        Object.prototype.hasOwnProperty.call(imageSelection, record.id)\n    );\n    const imageUrl = hasExplicitImageSelection\n      ? imageSelection?.[record.id] || null\n      : getExperienceCardRecordVideoImageUrl(record);\n    const tags = getRecordTags(record);\n''',
    "record image selection",
)
video_lib = replace_once(
    video_lib,
    '''export async function loadExperienceCardVideoImages(\n  detail: ExperienceCardDetail\n): Promise<ExperienceCardVideoImages> {\n  const urls = Array.from(\n    new Set(\n      buildExperienceCardVideoScenes(detail)\n''',
    '''export async function loadExperienceCardVideoImages(\n  detail: ExperienceCardDetail,\n  scenes: ExperienceCardVideoScene[] = buildExperienceCardVideoScenes(detail)\n): Promise<ExperienceCardVideoImages> {\n  const urls = Array.from(\n    new Set(\n      scenes\n''',
    "load selected images",
)
video_lib = replace_once(
    video_lib,
    '''  const bottomOverlay = context.createLinearGradient(0, height * 0.36, 0, height);\n  bottomOverlay.addColorStop(0, "rgba(15,27,17,0.02)");\n  bottomOverlay.addColorStop(0.42, "rgba(15,27,17,0.52)");\n  bottomOverlay.addColorStop(1, "rgba(15,27,17,0.92)");\n  context.fillStyle = bottomOverlay;\n  context.fillRect(0, height * 0.34, width, height * 0.66);\n''',
    '''  const bottomOverlayStart = image ? height * 0.58 : height * 0.42;\n  const bottomOverlay = context.createLinearGradient(0, bottomOverlayStart, 0, height);\n  bottomOverlay.addColorStop(0, "rgba(15,27,17,0)");\n  bottomOverlay.addColorStop(0.52, "rgba(15,27,17,0.42)");\n  bottomOverlay.addColorStop(1, "rgba(15,27,17,0.90)");\n  context.fillStyle = bottomOverlay;\n  context.fillRect(0, bottomOverlayStart, width, height - bottomOverlayStart);\n''',
    "smaller bottom overlay",
)
video_lib = replace_once(
    video_lib,
    '''  const panelX = 42 * scale;\n  const panelWidth = width - panelX * 2;\n  const panelY = height * 0.59;\n  const panelHeight = height - panelY - 58 * scale;\n''',
    '''  const panelX = 42 * scale;\n  const panelWidth = width - panelX * 2;\n  const panelY = image ? height * 0.70 : height * 0.56;\n  const panelHeight = height - panelY - 46 * scale;\n''',
    "smaller caption panel",
)
video_lib = replace_once(
    video_lib,
    '''  const fitted = fitWrappedText(\n    context,\n    scene.text,\n    contentWidth,\n    7,\n    34 * scale,\n    24 * scale\n  );\n  const lineHeight = fitted.size * 1.45;\n  context.fillStyle = "#ffffff";\n  fitted.lines.slice(0, 8).forEach((line, index) => {\n''',
    '''  const maxTextLines = image ? 5 : 7;\n  const fitted = fitWrappedText(\n    context,\n    scene.text,\n    contentWidth,\n    maxTextLines,\n    (image ? 28 : 34) * scale,\n    (image ? 21 : 24) * scale\n  );\n  const lineHeight = fitted.size * (image ? 1.35 : 1.45);\n  context.fillStyle = "#ffffff";\n  fitted.lines.slice(0, maxTextLines).forEach((line, index) => {\n''',
    "smaller caption text",
)
video_lib_path.write_text(video_lib, encoding="utf-8")


# 3. Video panel: per-record optional image selection.
panel_path = Path("components/experience-card/ExperienceCardVideoPanel.tsx")
panel = panel_path.read_text(encoding="utf-8")
panel = replace_once(
    panel,
    '''import type { ExperienceCardDetail } from "@/lib/experience-card-types";\n''',
    '''import type {\n  ExperienceCardDetail,\n  ExperienceCardMedia,\n  ExperienceCardSourceRecord,\n} from "@/lib/experience-card-types";\n''',
    "video panel record types",
)
panel = replace_once(
    panel,
    '''  type ExperienceCardVideoImages,\n} from "@/lib/experience-card-video";\n\nexport default function ExperienceCardVideoPanel({\n''',
    '''  type ExperienceCardVideoImages,\n  type ExperienceCardVideoImageSelection,\n} from "@/lib/experience-card-video";\n\ntype RecordImageOption = {\n  id: string;\n  sourceUrl: string;\n  previewUrl: string;\n};\n\nfunction isImageMedia(media: ExperienceCardMedia) {\n  const mimeType = String(media.mime_type || "").toLowerCase();\n  const type = String(media.type || "").toLowerCase();\n  if (mimeType) return mimeType.startsWith("image/");\n  if (type) return type === "image" || type === "photo";\n  return true;\n}\n\nfunction getRecordImageOptions(record: ExperienceCardSourceRecord): RecordImageOption[] {\n  return record.media\n    .filter(\n      (media) =>\n        isImageMedia(media) &&\n        Boolean(media.display_url || media.display_thumb_url)\n    )\n    .map((media) => ({\n      id: media.id,\n      sourceUrl: media.display_url || media.display_thumb_url || "",\n      previewUrl: media.display_thumb_url || media.display_url || "",\n    }))\n    .filter((item) => Boolean(item.sourceUrl));\n}\n\nfunction buildDefaultImageSelection(\n  detail: ExperienceCardDetail\n): ExperienceCardVideoImageSelection {\n  return Object.fromEntries(\n    detail.records.map((record) => [\n      record.id,\n      getRecordImageOptions(record)[0]?.sourceUrl || null,\n    ])\n  );\n}\n\nexport default function ExperienceCardVideoPanel({\n''',
    "video panel helpers",
)
panel = replace_once(
    panel,
    '''  const [videoUrl, setVideoUrl] = useState("");\n  const [errorText, setErrorText] = useState("");\n\n  const scenes = useMemo(\n    () => buildExperienceCardVideoScenes(detail),\n    [detail]\n  );\n''',
    '''  const [videoUrl, setVideoUrl] = useState("");\n  const [errorText, setErrorText] = useState("");\n  const [selectedImageByRecordId, setSelectedImageByRecordId] =\n    useState<ExperienceCardVideoImageSelection>(() =>\n      buildDefaultImageSelection(detail)\n    );\n\n  const imageOptionsByRecordId = useMemo(\n    () =>\n      new Map(\n        detail.records.map((record) => [\n          record.id,\n          getRecordImageOptions(record),\n        ])\n      ),\n    [detail]\n  );\n  const selectedImageCount = useMemo(\n    () =>\n      detail.records.filter((record) =>\n        Boolean(selectedImageByRecordId[record.id])\n      ).length,\n    [detail.records, selectedImageByRecordId]\n  );\n  const scenes = useMemo(\n    () => buildExperienceCardVideoScenes(detail, selectedImageByRecordId),\n    [detail, selectedImageByRecordId]\n  );\n''',
    "video panel selection state",
)
panel = replace_once(
    panel,
    '''  useEffect(() => {\n    let cancelled = false;\n    let loadedImages: ExperienceCardVideoImages = new Map();\n''',
    '''  useEffect(() => {\n    setSelectedImageByRecordId(buildDefaultImageSelection(detail));\n    clearGeneratedVideo();\n    setErrorText("");\n    // eslint-disable-next-line react-hooks/exhaustive-deps\n  }, [detail.card.id]);\n\n  useEffect(() => {\n    let cancelled = false;\n    let loadedImages: ExperienceCardVideoImages = new Map();\n''',
    "reset image selection",
)
panel = replace_once(
    panel,
    '''    void loadExperienceCardVideoImages(detail)\n''',
    '''    void loadExperienceCardVideoImages(detail, scenes)\n''',
    "load selected images call",
)
panel = replace_once(
    panel,
    '''  }, [detail]);\n\n  useEffect(() => {\n    const canvas = canvasRef.current;\n''',
    '''  }, [detail, scenes]);\n\n  useEffect(() => {\n    const canvas = canvasRef.current;\n''',
    "load selected images dependency",
)
panel = replace_once(
    panel,
    '''  function clearGeneratedVideo() {\n    if (videoUrl) URL.revokeObjectURL(videoUrl);\n    setVideoUrl("");\n    setVideoBlob(null);\n  }\n\n  async function handleGenerate() {\n''',
    '''  function clearGeneratedVideo() {\n    if (videoUrl) URL.revokeObjectURL(videoUrl);\n    setVideoUrl("");\n    setVideoBlob(null);\n  }\n\n  function selectRecordImage(recordId: string, imageUrl: string | null) {\n    if (generating) return;\n    clearGeneratedVideo();\n    setErrorText("");\n    setSelectedImageByRecordId((current) => ({\n      ...current,\n      [recordId]: imageUrl,\n    }));\n  }\n\n  async function handleGenerate() {\n''',
    "select record image handler",
)
panel = replace_once(
    panel,
    '''      <p style={descriptionStyle}>\n        所有被选记录都会进入视频；每条记录的原文字自动烧录为字幕，并采用该记录的首张照片。视频只在当前设备生成，不上传云端，也不占云空间。\n      </p>\n\n      <div style={contentGridStyle}>\n''',
    '''      <p style={descriptionStyle}>\n        所有被选记录都会进入视频；原文字自动烧录为字幕。每条记录的图片可以单独选择，也可以不使用图片。视频只在当前设备生成，不上传云端，也不占云空间。\n      </p>\n\n      <details style={imageSelectorStyle}>\n        <summary style={imageSelectorSummaryStyle}>\n          选择记录图片（已选择 {selectedImageCount}/{detail.records.length}）\n        </summary>\n        <div style={imageSelectorListStyle}>\n          {detail.records.map((record, index) => {\n            const options = imageOptionsByRecordId.get(record.id) || [];\n            const selectedUrl = selectedImageByRecordId[record.id] || null;\n\n            return (\n              <div key={record.id} style={imageSelectorRecordStyle}>\n                <div style={imageSelectorRecordTitleStyle}>\n                  第 {index + 1} 条记录\n                </div>\n                <div style={imageChoiceGridStyle}>\n                  <button\n                    type="button"\n                    onClick={() => selectRecordImage(record.id, null)}\n                    aria-pressed={!selectedUrl}\n                    style={imageNoneButtonStyle(!selectedUrl)}\n                  >\n                    不使用图片\n                  </button>\n                  {options.map((option) => {\n                    const active = selectedUrl === option.sourceUrl;\n                    return (\n                      <button\n                        key={option.id}\n                        type="button"\n                        onClick={() =>\n                          selectRecordImage(record.id, option.sourceUrl)\n                        }\n                        aria-pressed={active}\n                        style={imageChoiceButtonStyle(active)}\n                      >\n                        <img\n                          src={option.previewUrl}\n                          alt={`第${index + 1}条记录可选图片`}\n                          style={imageChoiceImageStyle}\n                        />\n                      </button>\n                    );\n                  })}\n                </div>\n              </div>\n            );\n          })}\n        </div>\n      </details>\n\n      <div style={contentGridStyle}>\n''',
    "record image selector ui",
)
panel = replace_once(
    panel,
    '''const contentGridStyle: CSSProperties = {\n''',
    '''const imageSelectorStyle: CSSProperties = {\n  margin: "0 0 16px",\n  border: "1px solid #dfe8db",\n  borderRadius: 14,\n  background: "#fff",\n  overflow: "hidden",\n};\n\nconst imageSelectorSummaryStyle: CSSProperties = {\n  padding: "11px 13px",\n  color: "#466043",\n  fontSize: 13,\n  fontWeight: 800,\n  cursor: "pointer",\n};\n\nconst imageSelectorListStyle: CSSProperties = {\n  display: "grid",\n  gap: 10,\n  padding: "0 12px 12px",\n};\n\nconst imageSelectorRecordStyle: CSSProperties = {\n  paddingTop: 10,\n  borderTop: "1px solid #edf1ea",\n};\n\nconst imageSelectorRecordTitleStyle: CSSProperties = {\n  marginBottom: 7,\n  color: "#6b7967",\n  fontSize: 12,\n  fontWeight: 800,\n};\n\nconst imageChoiceGridStyle: CSSProperties = {\n  display: "grid",\n  gridTemplateColumns: "repeat(auto-fill, minmax(68px, 1fr))",\n  gap: 7,\n};\n\nfunction imageChoiceButtonStyle(active: boolean): CSSProperties {\n  return {\n    aspectRatio: "1 / 1",\n    padding: 2,\n    border: active ? "2px solid #5f8b59" : "1px solid #dce5d8",\n    borderRadius: 10,\n    background: active ? "#edf5e9" : "#f8faf7",\n    overflow: "hidden",\n    cursor: "pointer",\n  };\n}\n\nfunction imageNoneButtonStyle(active: boolean): CSSProperties {\n  return {\n    ...imageChoiceButtonStyle(active),\n    minHeight: 68,\n    aspectRatio: "auto",\n    color: active ? "#365c34" : "#6f7c6b",\n    fontSize: 12,\n    fontWeight: 800,\n    lineHeight: 1.35,\n  };\n}\n\nconst imageChoiceImageStyle: CSSProperties = {\n  width: "100%",\n  height: "100%",\n  objectFit: "cover",\n  display: "block",\n  borderRadius: 7,\n};\n\nconst contentGridStyle: CSSProperties = {\n''',
    "image selector styles",
)
panel_path.write_text(panel, encoding="utf-8")


# 4. Mobile archive tabs: archive, records, experience cards, growth line.
archive_detail_path = Path("app/archive/[id]/page.tsx")
archive_detail = archive_detail_path.read_text(encoding="utf-8")
archive_detail = replace_once(
    archive_detail,
    '''type MobileArchiveEditableField =\n''',
    '''type MobileArchiveDetailTab = "profile" | "records" | "experience" | "growth";\n\ntype MobileArchiveEditableField =\n''',
    "mobile detail tab type",
)
archive_detail = replace_once(
    archive_detail,
    '''  const [mobileDetailTab, setMobileDetailTab] = useState<"profile" | "records">("records");\n''',
    '''  const [mobileDetailTab, setMobileDetailTab] = useState<MobileArchiveDetailTab>("records");\n''',
    "mobile detail tab state",
)
old_nav = '''          <button\n            type="button"\n            onClick={() => setMobileDetailTab("profile")}\n            style={archiveDetailTabButtonStyle(mobileDetailTab === "profile")}\n          >\n            档案\n          </button>\n          <button\n            type="button"\n            onClick={() => setMobileDetailTab("records")}\n            style={archiveDetailTabButtonStyle(mobileDetailTab === "records")}\n          >\n            记录\n          </button>\n'''
new_nav = '''          <button\n            type="button"\n            onClick={() => setMobileDetailTab("profile")}\n            style={archiveDetailTabButtonStyle(mobileDetailTab === "profile")}\n          >\n            档案\n          </button>\n          <button\n            type="button"\n            onClick={() => setMobileDetailTab("records")}\n            style={archiveDetailTabButtonStyle(mobileDetailTab === "records")}\n          >\n            记录\n          </button>\n          <button\n            type="button"\n            onClick={() => setMobileDetailTab("experience")}\n            style={archiveDetailTabButtonStyle(mobileDetailTab === "experience")}\n          >\n            经验卡\n          </button>\n          <button\n            type="button"\n            onClick={() => setMobileDetailTab("growth")}\n            style={archiveDetailTabButtonStyle(mobileDetailTab === "growth")}\n          >\n            生长线\n          </button>\n'''
archive_detail = replace_once(archive_detail, old_nav, new_nav, "four mobile tabs")
archive_detail = replace_once(
    archive_detail,
    '''        {isMobileViewport && mobileDetailTab === "profile" ? (\n          <ArchiveExperienceCards\n            archiveId={activeArchive.id}\n            isOwner={isOwner}\n          />\n        ) : null}\n\n        {mode === "owner" ? (\n''',
    '''        {isMobileViewport && mobileDetailTab === "experience" ? (\n          <ArchiveExperienceCards\n            archiveId={activeArchive.id}\n            isOwner={isOwner}\n          />\n        ) : null}\n\n        {isMobileViewport && mobileDetailTab === "growth" ? (\n          <section style={mobileGrowthLinePlaceholderStyle}>\n            <strong>生长线</strong>\n            <span>生长线将在后续开放，并与档案、记录、经验卡保持同级入口。</span>\n          </section>\n        ) : null}\n\n        {mode === "owner" && (!isMobileViewport || mobileDetailTab === "records") ? (\n''',
    "mobile experience and growth tabs",
)
archive_detail = replace_once(
    archive_detail,
    '''  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",\n''',
    '''  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",\n''',
    "four-column tab grid",
)
archive_detail = replace_once(
    archive_detail,
    '''    fontSize: 14,\n    fontWeight: 800,\n''',
    '''    fontSize: 13,\n    fontWeight: 800,\n''',
    "mobile tab font",
)
archive_detail = replace_once(
    archive_detail,
    '''const mobileArchiveProfileStyle: CSSProperties = {\n''',
    '''const mobileGrowthLinePlaceholderStyle: CSSProperties = {\n  display: "grid",\n  gap: 8,\n  marginBottom: 14,\n  padding: 18,\n  border: "1px dashed #d6e3d0",\n  borderRadius: 16,\n  background: "#fbfdf9",\n  color: "#60705c",\n  fontSize: 13,\n  lineHeight: 1.65,\n};\n\nconst mobileArchiveProfileStyle: CSSProperties = {\n''',
    "growth placeholder style",
)
archive_detail_path.write_text(archive_detail, encoding="utf-8")


# 5. Personal space page: visible My Experience Cards entry.
archive_page_path = Path("app/archive/page.tsx")
archive_page = archive_page_path.read_text(encoding="utf-8")
archive_page = replace_once(
    archive_page,
    '''import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";\nimport { useRouter } from "next/navigation";\n''',
    '''import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";\nimport Link from "next/link";\nimport { useRouter } from "next/navigation";\n''',
    "personal space Link import",
)
archive_page = replace_once(
    archive_page,
    '''      <ArchiveWorkspaceTemplate<ArchiveSourceFilter>\n''',
    '''      <section style={personalSpaceEntryRowStyle}>\n        <Link href="/experience-cards" style={personalSpaceExperienceCardEntryStyle}>\n          <span style={personalSpaceExperienceCardTextStyle}>\n            <strong>我的经验卡</strong>\n            <small>集中查看和管理全部项目的经验卡</small>\n          </span>\n          <span style={personalSpaceExperienceCardArrowStyle}>进入 →</span>\n        </Link>\n      </section>\n\n      <ArchiveWorkspaceTemplate<ArchiveSourceFilter>\n''',
    "personal space experience card entry",
)
archive_page = replace_once(
    archive_page,
    '''const workspaceFilterPanelStyle: CSSProperties = {\n''',
    '''const personalSpaceEntryRowStyle: CSSProperties = {\n  marginBottom: 12,\n};\n\nconst personalSpaceExperienceCardEntryStyle: CSSProperties = {\n  display: "flex",\n  alignItems: "center",\n  justifyContent: "space-between",\n  gap: 12,\n  padding: "13px 15px",\n  border: "1px solid #dbe7d6",\n  borderRadius: 16,\n  background: "linear-gradient(135deg, #f7fbf4, #ffffff)",\n  color: "#2f4f2f",\n  textDecoration: "none",\n};\n\nconst personalSpaceExperienceCardTextStyle: CSSProperties = {\n  display: "grid",\n  gap: 3,\n  minWidth: 0,\n};\n\nconst personalSpaceExperienceCardArrowStyle: CSSProperties = {\n  flexShrink: 0,\n  color: "#4f7650",\n  fontSize: 13,\n  fontWeight: 800,\n};\n\nconst workspaceFilterPanelStyle: CSSProperties = {\n''',
    "personal space entry styles",
)
archive_page_path.write_text(archive_page, encoding="utf-8")


# 6. Product rules.
agents_path = Path("AGENTS.md")
agents = agents_path.read_text(encoding="utf-8")
agents = replace_once(
    agents,
    '''* 所有被选记录都必须进入视频；每条记录自动采用首张可用照片，没有照片时使用文字背景。原记录文字自动生成烧录字幕，长文字自动分段，时长随记录数量和文字长度延长。\n* 输出为静音H.264竖屏MP4；生成完成后在页面中循环预览，可直接调用设备文件分享或保存后上传到外部视频平台。\n''',
    '''* 所有被选记录都必须进入视频；每条记录的图片由用户逐条选择，也可以选择不使用图片，没有选择图片时使用文字背景。原记录文字自动生成烧录字幕，长文字自动分段，时长随记录数量和文字长度延长。\n* 经验卡详情中MP4生成与预览区域放在时间线之前；有图片的记录画面应优先展示图片，字幕只占画面底部较小区域。\n* 输出为静音H.264竖屏MP4；生成完成后在页面中循环预览，可直接调用设备文件分享或保存后上传到外部视频平台。\n* 手机端项目详情采用“档案／记录／经验卡／生长线”同级入口；生长线未实现时保留同级占位。个人空间项目页应提供“我的经验卡”入口。\n''',
    "experience card refined product rules",
)
agents_path.write_text(agents, encoding="utf-8")


# 7. Regression tests.
tests_path = Path("tests/experience-cards.test.mjs")
tests = tests_path.read_text(encoding="utf-8")
addition = r'''

test("experience card MP4 is shown first, supports optional record images, and preserves photo area", async () => {
  const [detail, panel, renderer] = await Promise.all([
    source("app/experience-cards/[id]/page.tsx"),
    source("components/experience-card/ExperienceCardVideoPanel.tsx"),
    source("lib/experience-card-video.ts"),
  ]);

  assert.ok(
    detail.indexOf("<ExperienceCardVideoPanel detail={detail}") <
      detail.indexOf("<article style={cardShellStyle}")
  );
  assert.match(panel, /选择记录图片/);
  assert.match(panel, /不使用图片/);
  assert.match(panel, /selectedImageByRecordId/);
  assert.match(renderer, /imageSelection\?: ExperienceCardVideoImageSelection/);
  assert.match(renderer, /panelY = image \? height \* 0\.70/);
  assert.match(renderer, /maxTextLines = image \? 5 : 7/);
});

test("mobile project details expose archive, records, experience cards, and growth line as peers", async () => {
  const archiveDetail = await source("app/archive/[id]/page.tsx");

  assert.match(
    archiveDetail,
    /type MobileArchiveDetailTab = "profile" \| "records" \| "experience" \| "growth"/
  );
  assert.match(archiveDetail, />\s*档案\s*</);
  assert.match(archiveDetail, />\s*记录\s*</);
  assert.match(archiveDetail, />\s*经验卡\s*</);
  assert.match(archiveDetail, />\s*生长线\s*</);
  assert.match(archiveDetail, /mobileDetailTab === "experience"/);
  assert.match(archiveDetail, /mobileDetailTab === "growth"/);
  assert.match(archiveDetail, /repeat\(4, minmax\(0, 1fr\)\)/);
});

test("personal space project page has a direct My Experience Cards entry", async () => {
  const personalSpace = await source("app/archive/page.tsx");

  assert.match(personalSpace, /href="\/experience-cards"/);
  assert.match(personalSpace, /我的经验卡/);
  assert.match(personalSpace, /集中查看和管理全部项目的经验卡/);
});
'''
if 'test("experience card MP4 is shown first' not in tests:
    tests += addition
tests_path.write_text(tests, encoding="utf-8")
