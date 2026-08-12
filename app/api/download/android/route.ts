import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const BUNDLED_ANDROID_APK_NAME = "youshi-cultivation-android-test.apk";
const BUNDLED_ANDROID_APK_SIZE = 4_108_758;
const BUNDLED_ANDROID_APK_PARTS = Array.from(
  { length: 8 },
  (_, index) =>
    `/downloads/android-test-parts/part-${String(index).padStart(2, "0")}`,
);

async function serveBundledAndroidApk(request: Request) {
  try {
    const responses = await Promise.all(
      BUNDLED_ANDROID_APK_PARTS.map((part) =>
        fetch(new URL(part, request.url), { cache: "force-cache" }),
      ),
    );

    if (responses.some((response) => !response.ok)) {
      throw new Error("An Android APK part is unavailable.");
    }

    const parts = await Promise.all(
      responses.map((response) => response.arrayBuffer()),
    );
    const totalSize = parts.reduce((sum, part) => sum + part.byteLength, 0);

    if (totalSize !== BUNDLED_ANDROID_APK_SIZE) {
      throw new Error("The Android APK size does not match its manifest.");
    }

    const apk = new Blob(parts, {
      type: "application/vnd.android.package-archive",
    });

    return new NextResponse(apk, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${BUNDLED_ANDROID_APK_NAME}"`,
        "Content-Length": String(totalSize),
        "Content-Type": "application/vnd.android.package-archive",
      },
    });
  } catch (error) {
    console.error("serve bundled Android APK failed:", error);
    return NextResponse.json(
      { error: "Android APK 暂时无法下载，请稍后再试。" },
      { status: 503 },
    );
  }
}

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

  if (apkUrl) {
    return NextResponse.redirect(new URL(apkUrl, request.url));
  }

  return serveBundledAndroidApk(request);
}
