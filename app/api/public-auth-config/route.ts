import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const turnstileSiteKey =
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || "";

  return NextResponse.json(
    { turnstileSiteKey },
    {
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
