import { NextResponse } from "next/server";
import { ANDROID_RELEASE_APK_PATH } from "@/lib/android-release";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

function sanitizeReferrer(value?: string | null) {
  if (!value) return null;

  try {
    const parsed = new URL(value);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return null;
  }
}

function sanitizeSource(value?: string | null) {
  const normalized = value?.trim().toLowerCase() || "";
  return /^[a-z0-9_-]{1,40}$/.test(normalized) ? normalized : null;
}

async function recordAndroidDownload(request: Request) {
  const url = new URL(request.url);

  try {
    const anonymousId = url.searchParams.get("anonymous_id");
    const source = sanitizeSource(url.searchParams.get("source"));
    const userAgent = request.headers.get("user-agent");
    const referrer = sanitizeReferrer(request.headers.get("referer"));

    await getSupabaseAdmin().from("analytics_events").insert({
      event_name: "apk_download",
      anonymous_id: anonymousId || null,
      platform: "android",
      user_agent: userAgent,
      referrer,
      metadata: source ? { source } : {},
    });
  } catch (error) {
    console.error("record apk download analytics failed:", error);
  }
}

export async function GET(request: Request) {
  await recordAndroidDownload(request);

  const apkUrl =
    process.env.ANDROID_APK_DOWNLOAD_URL ||
    process.env.NEXT_PUBLIC_ANDROID_APK_URL ||
    ANDROID_RELEASE_APK_PATH;

  return NextResponse.redirect(new URL(apkUrl, request.url));
}
