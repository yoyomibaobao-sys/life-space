import { createClient } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { getArchiveCategoryLabel } from "@/lib/archive-categories";
import { SimpleZipBuilder } from "@/lib/export-zip";

type ProfileRow = {
  id: string;
  email: string | null;
  username: string | null;
  location: string | null;
  avatar_url: string | null;
  country_code: string | null;
  country_name: string | null;
  region_name: string | null;
  city_name: string | null;
  created_at: string | null;
};

type ArchiveRow = {
  id: string;
  title: string;
  category: string | null;
  note: string | null;
  system_name: string | null;
  species_name_snapshot: string | null;
  cover_image_url: string | null;
  is_public: boolean | null;
  status: string | null;
  created_at: string | null;
  ended_at: string | null;
  record_count: number | null;
  last_record_time: string | null;
};

type RecordRow = {
  id: string;
  archive_id: string | null;
  note: string | null;
  photo_time: string | null;
  record_time: string | null;
  upload_time: string | null;
  created_at: string | null;
  visibility: string | null;
  status_tag: string | null;
  primary_image_url: string | null;
};

type MediaRow = {
  id: string;
  record_id: string | null;
  type: string | null;
  url: string | null;
  size_mb: number | null;
  size_bytes?: number | null;
  duration_sec: number | null;
  storage_class: string | null;
  created_at: string | null;
  sort_order: number | null;
};

type ExportMedia = MediaRow & {
  export_path?: string | null;
  relative_path?: string | null;
  download_failed?: boolean;
};

export const runtime = "nodejs";

type SupabaseServerClient = Awaited<ReturnType<typeof getSupabaseServer>>;

function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Missing Supabase env for export route.");
  }

  return { url, anonKey };
}

function createSupabaseWithBearerToken(accessToken: string) {
  const { url, anonKey } = getSupabaseEnv();

  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

const textEncoder = new TextEncoder();

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function safeFileName(value: string, fallback: string) {
  const cleaned = String(value || fallback)
    .trim()
    .replace(/[\\/:*?"<>|#%{}^~`\[\]]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/\.+$/g, "")
    .slice(0, 80);

  return cleaned || fallback;
}

function padNumber(value: number, length = 2) {
  return String(value).padStart(length, "0");
}

function formatDate(value: string | null | undefined) {
  if (!value) return "未记录时间";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("zh-CN", { hour12: false });
}

function formatDateForFile(value = new Date()) {
  return [
    value.getFullYear(),
    padNumber(value.getMonth() + 1),
    padNumber(value.getDate()),
  ].join("-");
}

function uniquePath(basePath: string, usedPaths: Set<string>) {
  if (!usedPaths.has(basePath)) {
    usedPaths.add(basePath);
    return basePath;
  }

  const lastDot = basePath.lastIndexOf(".");
  const stem = lastDot > -1 ? basePath.slice(0, lastDot) : basePath;
  const ext = lastDot > -1 ? basePath.slice(lastDot) : "";
  let index = 2;
  let candidate = `${stem}-${index}${ext}`;

  while (usedPaths.has(candidate)) {
    index += 1;
    candidate = `${stem}-${index}${ext}`;
  }

  usedPaths.add(candidate);
  return candidate;
}

function inferExtension(url: string | null | undefined, contentType?: string | null) {
  if (contentType?.includes("png")) return "png";
  if (contentType?.includes("webp")) return "webp";
  if (contentType?.includes("gif")) return "gif";
  if (contentType?.includes("jpeg") || contentType?.includes("jpg")) return "jpg";

  try {
    const pathname = new URL(String(url || "")).pathname;
    const match = pathname.match(/\.([a-zA-Z0-9]{2,5})$/);
    if (match) return match[1].toLowerCase();
  } catch {}

  return "jpg";
}

function getStorageObjectFromPublicUrl(url: string | null | undefined) {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    const marker = "/storage/v1/object/public/";
    const index = parsed.pathname.indexOf(marker);
    if (index === -1) return null;

    const rest = parsed.pathname.slice(index + marker.length);
    const [bucket, ...pathParts] = rest.split("/");
    const path = decodeURIComponent(pathParts.join("/"));

    if (!bucket || !path) return null;
    return { bucket, path };
  } catch {
    return null;
  }
}

async function blobToUint8Array(blob: Blob) {
  return new Uint8Array(await blob.arrayBuffer());
}

async function downloadUrlAsBytes({
  supabase,
  url,
}: {
  supabase: SupabaseServerClient;
  url: string | null | undefined;
}) {
  if (!url) return null;

  const storageObject = getStorageObjectFromPublicUrl(url);
  if (storageObject) {
    const { data, error } = await supabase.storage
      .from(storageObject.bucket)
      .download(storageObject.path);

    if (!error && data) {
      return {
        bytes: await blobToUint8Array(data),
        contentType: data.type || null,
      };
    }
  }

  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return {
      bytes: new Uint8Array(await response.arrayBuffer()),
      contentType: response.headers.get("content-type"),
    };
  } catch {
    return null;
  }
}

function buildReadme() {
  return `有时·耕作导出说明\n\n1. 双击 index.html，可以查看所有项目目录。\n2. 每个项目文件夹里也有一个 index.html，可以查看该项目的记录时间线。\n3. images 文件夹里保存该项目相关图片。\n4. data.json 是内部备份数据，普通查看不需要打开。\n5. 本导出包只包含你自己的项目、记录、图片和基础资料，不包含评论、他人资料或社交互动数据。\n`;
}

function buildRootHtml({
  profile,
  archives,
  archiveDirs,
  exportedAt,
}: {
  profile: ProfileRow | null;
  archives: ArchiveRow[];
  archiveDirs: Map<string, string>;
  exportedAt: string;
}) {
  const archiveLinks = archives.map((archive) => {
    const dir = archiveDirs.get(archive.id) || "";
    const category = getArchiveCategoryLabel(archive.category);
    return `<li><a href="${escapeHtml(dir)}index.html">${escapeHtml(archive.title || "未命名项目")}</a><span>${escapeHtml(category)} · ${escapeHtml(formatDate(archive.created_at))}</span></li>`;
  }).join("\n");

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>有时·耕作 - 我的导出记录</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0;background:#f6f8f1;color:#1f2a1f;line-height:1.7}.wrap{max-width:920px;margin:0 auto;padding:32px 18px}.hero,.card{background:#fff;border:1px solid #e4ecdc;border-radius:20px;padding:22px;box-shadow:0 10px 28px rgba(32,56,24,.06)}h1{margin:0;font-size:28px}h2{margin:24px 0 12px;font-size:20px}.muted{color:#6f7b69;font-size:14px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-top:16px}.meta{background:#f8fbf3;border:1px solid #e1ecd9;border-radius:14px;padding:12px}ul{list-style:none;padding:0;margin:0}.archives li{display:flex;justify-content:space-between;gap:16px;border-bottom:1px solid #edf2e8;padding:12px 0}.archives a{color:#3f6427;font-weight:700;text-decoration:none}.archives span{color:#7b8676;font-size:13px;text-align:right}@media(max-width:640px){.archives li{display:block}.archives span{display:block;text-align:left;margin-top:4px}}
</style>
</head>
<body>
<div class="wrap">
  <section class="hero">
    <div class="muted">有时·耕作 · 我的导出记录</div>
    <h1>${escapeHtml(profile?.username || "我的空间")}</h1>
    <p>人生，是一个场的旅行，也是一场修行。<br />有时，记录你的照料、陪伴、滋养与成长，让生命有迹可循。</p>
    <div class="grid">
      <div class="meta"><strong>导出时间</strong><br />${escapeHtml(exportedAt)}</div>
      <div class="meta"><strong>项目数量</strong><br />${archives.length}</div>
      <div class="meta"><strong>账号邮箱</strong><br />${escapeHtml(profile?.email || "未记录")}</div>
      <div class="meta"><strong>所在地区</strong><br />${escapeHtml([profile?.country_name, profile?.region_name, profile?.city_name].filter(Boolean).join(" · ") || profile?.location || "未记录")}</div>
    </div>
  </section>

  <section class="card" style="margin-top:18px">
    <h2>项目档案</h2>
    <ul class="archives">
      ${archiveLinks || "<li>暂无项目档案</li>"}
    </ul>
  </section>
</div>
</body>
</html>`;
}

function buildArchiveHtml({
  archive,
  records,
  mediaByRecord,
}: {
  archive: ArchiveRow;
  records: RecordRow[];
  mediaByRecord: Map<string, ExportMedia[]>;
}) {
  const recordItems = records.map((record) => {
    const media = mediaByRecord.get(record.id) || [];
    const images = media.map((item) => {
      if (item.relative_path && !item.download_failed) {
        return `<img src="${escapeHtml(item.relative_path)}" alt="" />`;
      }
      if (item.url) {
        return `<a class="missing" href="${escapeHtml(item.url)}">图片未能下载，查看原链接</a>`;
      }
      return "";
    }).join("\n");

    return `<article class="record">
  <div class="time">${escapeHtml(formatDate(record.photo_time || record.record_time || record.created_at))}</div>
  <div class="note">${escapeHtml(record.note || "（无文字记录）").replace(/\n/g, "<br />")}</div>
  ${images ? `<div class="images">${images}</div>` : ""}
</article>`;
  }).join("\n");

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(archive.title || "项目档案")}</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0;background:#f6f8f1;color:#1f2a1f;line-height:1.7}.wrap{max-width:900px;margin:0 auto;padding:28px 16px}.hero,.record{background:#fff;border:1px solid #e4ecdc;border-radius:18px;padding:18px;box-shadow:0 8px 24px rgba(32,56,24,.05)}a{color:#4f762c;text-decoration:none}.back{font-size:14px}.muted,.time{color:#6f7b69;font-size:13px}h1{margin:8px 0 6px;font-size:26px}.tags{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.tag{background:#f1f6ec;border:1px solid #dfead5;border-radius:999px;padding:4px 10px;font-size:13px;color:#506345}.record{margin-top:14px}.note{margin-top:8px;white-space:normal}.images{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-top:12px}.images img{width:100%;border-radius:14px;border:1px solid #e7efe3;object-fit:cover}.missing{display:block;background:#fff8ea;border:1px solid #ead9b8;border-radius:12px;padding:10px;color:#7a5c24}
</style>
</head>
<body>
<div class="wrap">
  <a class="back" href="../../index.html">← 返回全部项目</a>
  <section class="hero">
    <div class="muted">项目档案</div>
    <h1>${escapeHtml(archive.title || "未命名项目")}</h1>
    <div class="tags">
      <span class="tag">${escapeHtml(getArchiveCategoryLabel(archive.category))}</span>
      <span class="tag">${archive.is_public ? "公开" : "私密"}</span>
      <span class="tag">${archive.status === "ended" ? "已结束" : "进行中"}</span>
    </div>
    ${archive.note ? `<p>${escapeHtml(archive.note).replace(/\n/g, "<br />")}</p>` : ""}
    <p class="muted">创建时间：${escapeHtml(formatDate(archive.created_at))} · 记录数量：${records.length}</p>
  </section>
  ${recordItems || `<section class="record">暂无记录</section>`}
</div>
</body>
</html>`;
}

export async function GET(request: Request) {
  let supabase = await getSupabaseServer();
  let {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  // 当前项目的登录态主要保存在浏览器 localStorage 中；
  // 直接打开 API 链接时，服务端不一定能读到 Supabase Cookie。
  // 因此导出按钮会携带 Authorization Bearer token，这里作为补充认证方式。
  if (userError || !user) {
    const accessToken = getBearerToken(request);

    if (accessToken) {
      const tokenSupabase = createSupabaseWithBearerToken(accessToken);
      const tokenUserResult = await tokenSupabase.auth.getUser(accessToken);

      if (!tokenUserResult.error && tokenUserResult.data.user) {
        supabase = tokenSupabase as unknown as SupabaseServerClient;
        user = tokenUserResult.data.user;
        userError = null;
      }
    }
  }

  if (userError || !user) {
    return new Response("请先登录后再导出。", { status: 401 });
  }

  const [profileResult, archivesResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id,email,username,location,avatar_url,country_code,country_name,region_name,city_name,created_at")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("archives")
      .select("id,title,category,note,system_name,species_name_snapshot,cover_image_url,is_public,status,created_at,ended_at,record_count,last_record_time")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true }),
  ]);

  if (profileResult.error) {
    return new Response(`读取用户资料失败：${profileResult.error.message}`, { status: 500 });
  }

  if (archivesResult.error) {
    return new Response(`读取项目失败：${archivesResult.error.message}`, { status: 500 });
  }

  const profile = (profileResult.data || null) as ProfileRow | null;
  const archives = (archivesResult.data || []) as ArchiveRow[];
  const archiveIds = archives.map((archive) => archive.id);

  let records: RecordRow[] = [];
  if (archiveIds.length > 0) {
    const recordsResult = await supabase
      .from("records")
      .select("id,archive_id,note,photo_time,record_time,upload_time,created_at,visibility,status_tag,primary_image_url")
      .eq("user_id", user.id)
      .in("archive_id", archiveIds)
      .order("record_time", { ascending: false });

    if (recordsResult.error) {
      return new Response(`读取记录失败：${recordsResult.error.message}`, { status: 500 });
    }

    records = (recordsResult.data || []) as RecordRow[];
  }

  const recordIds = records.map((record) => record.id);
  let mediaRows: ExportMedia[] = [];
  if (recordIds.length > 0) {
    const mediaResult = await supabase
      .from("media")
      .select("id,record_id,type,url,size_mb,size_bytes,duration_sec,storage_class,created_at,sort_order")
      .eq("user_id", user.id)
      .in("record_id", recordIds)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (mediaResult.error) {
      return new Response(`读取图片失败：${mediaResult.error.message}`, { status: 500 });
    }

    mediaRows = (mediaResult.data || []) as ExportMedia[];
  }

  const zip = new SimpleZipBuilder();
  const usedPaths = new Set<string>();
  const archiveDirs = new Map<string, string>();
  const recordsByArchive = new Map<string, RecordRow[]>();
  const mediaByRecord = new Map<string, ExportMedia[]>();
  const failedDownloads: string[] = [];

  records.forEach((record) => {
    if (!record.archive_id) return;
    const list = recordsByArchive.get(record.archive_id) || [];
    list.push(record);
    recordsByArchive.set(record.archive_id, list);
  });

  mediaRows.forEach((media) => {
    if (!media.record_id) return;
    const list = mediaByRecord.get(media.record_id) || [];
    list.push(media);
    mediaByRecord.set(media.record_id, list);
  });

  archives.forEach((archive, index) => {
    const dirName = `${padNumber(index + 1)}-${safeFileName(archive.title, "未命名项目")}`;
    archiveDirs.set(archive.id, `项目档案/${dirName}/`);
  });

  for (const archive of archives) {
    const archiveDir = archiveDirs.get(archive.id) || `项目档案/${archive.id}/`;
    const archiveRecords = recordsByArchive.get(archive.id) || [];

    for (let recordIndex = 0; recordIndex < archiveRecords.length; recordIndex += 1) {
      const record = archiveRecords[recordIndex];
      const media = mediaByRecord.get(record.id) || [];

      for (let mediaIndex = 0; mediaIndex < media.length; mediaIndex += 1) {
        const item = media[mediaIndex];
        const downloaded = await downloadUrlAsBytes({ supabase, url: item.url });
        const ext = inferExtension(item.url, downloaded?.contentType || null);
        const fileName = `${padNumber(recordIndex + 1, 3)}-${padNumber(mediaIndex + 1, 2)}-${safeFileName(item.id, "image")}.${ext}`;
        const zipPath = uniquePath(`${archiveDir}images/${fileName}`, usedPaths);
        item.export_path = zipPath;
        item.relative_path = `images/${zipPath.split("/").pop()}`;

        if (downloaded?.bytes) {
          zip.addFile(zipPath, downloaded.bytes);
        } else {
          item.download_failed = true;
          failedDownloads.push(`${archive.title || archive.id} / ${formatDate(record.record_time || record.created_at)} / ${item.url || item.id}`);
        }
      }
    }

    if (archive.cover_image_url && !mediaRows.some((media) => media.url === archive.cover_image_url)) {
      const downloaded = await downloadUrlAsBytes({ supabase, url: archive.cover_image_url });
      if (downloaded?.bytes) {
        const ext = inferExtension(archive.cover_image_url, downloaded.contentType);
        const coverPath = uniquePath(`${archiveDir}images/cover.${ext}`, usedPaths);
        zip.addFile(coverPath, downloaded.bytes);
      }
    }
  }

  if (profile?.avatar_url) {
    const avatar = await downloadUrlAsBytes({ supabase, url: profile.avatar_url });
    if (avatar?.bytes) {
      const ext = inferExtension(profile.avatar_url, avatar.contentType);
      zip.addFile(`个人资料/avatar.${ext}`, avatar.bytes);
    }
  }

  const exportedAt = new Date().toLocaleString("zh-CN", { hour12: false });

  for (const archive of archives) {
    const archiveDir = archiveDirs.get(archive.id) || `项目档案/${archive.id}/`;
    const archiveRecords = recordsByArchive.get(archive.id) || [];
    zip.addFile(
      `${archiveDir}index.html`,
      buildArchiveHtml({ archive, records: archiveRecords, mediaByRecord })
    );
    zip.addFile(
      `${archiveDir}records.json`,
      JSON.stringify(
        {
          archive,
          records: archiveRecords.map((record) => ({
            ...record,
            media: mediaByRecord.get(record.id) || [],
          })),
        },
        null,
        2
      )
    );
  }

  const exportData = {
    exported_at: new Date().toISOString(),
    product: "有时·耕作",
    scope: "仅包含用户本人项目、记录、图片和基础资料；不包含评论或他人数据。",
    profile,
    archives: archives.map((archive) => ({
      ...archive,
      records: (recordsByArchive.get(archive.id) || []).map((record) => ({
        ...record,
        media: mediaByRecord.get(record.id) || [],
      })),
    })),
  };

  zip.addFile("README.txt", buildReadme());
  zip.addFile("index.html", buildRootHtml({ profile, archives, archiveDirs, exportedAt }));
  zip.addFile("data.json", JSON.stringify(exportData, null, 2));

  if (failedDownloads.length > 0) {
    zip.addFile(
      "未能下载的图片清单.txt",
      `以下图片未能写入导出包，可能是原文件不存在、权限变化或网络失败。\n\n${failedDownloads.join("\n")}`
    );
  }

  const zipBytes = zip.generate();
  const zipBody = zipBytes.buffer.slice(
    zipBytes.byteOffset,
    zipBytes.byteOffset + zipBytes.byteLength
  );
  const fileName = `有时耕作-我的记录-${formatDateForFile()}.zip`;

  return new Response(zipBody, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="youshi-export-${formatDateForFile()}.zip"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Content-Length": String(zipBytes.length),
      "Cache-Control": "no-store",
    },
  });
}
