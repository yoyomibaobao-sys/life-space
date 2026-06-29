import { NextResponse } from "next/server";
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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const apkUrl =
    process.env.ANDROID_APK_DOWNLOAD_URL ||
    process.env.NEXT_PUBLIC_ANDROID_APK_URL ||
    null;

  try {
    const anonymousId = url.searchParams.get("anonymous_id");
    const userAgent = request.headers.get("user-agent");
    const referrer = sanitizeReferrer(request.headers.get("referer"));

    await getSupabaseAdmin().from("analytics_events").insert({
      event_name: "apk_download",
      anonymous_id: anonymousId || null,
      platform: "android",
      user_agent: userAgent,
      referrer,
      metadata: {},
    });
  } catch (error) {
    console.error("record apk download analytics failed:", error);
  }

  if (!apkUrl) {
    return NextResponse.json(
      { error: "Android APK 下载地址暂未配置，请稍后再试。" },
      { status: 503 }
    );
  }

  return NextResponse.redirect(new URL(apkUrl, request.url));
}
