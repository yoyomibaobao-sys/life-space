import { NextResponse } from "next/server";

export const runtime = "nodejs";

function hasPayPalRuntimeConfiguration() {
  const hasSupabaseUrl = Boolean(
    process.env.SUPABASE_URL?.trim() ||
      process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  );
  const requiredValues = [
    process.env.PAYPAL_CLIENT_ID,
    process.env.PAYPAL_CLIENT_SECRET,
    process.env.PAYPAL_WEBHOOK_ID,
    process.env.PAYPAL_SITE_ORIGIN,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  ];

  return hasSupabaseUrl && requiredValues.every((value) => Boolean(value?.trim()));
}

export async function GET() {
  const requested =
    process.env.PAYPAL_ENABLED?.trim().toLowerCase() === "true" ||
    process.env.NEXT_PUBLIC_PAYPAL_ENABLED?.trim().toLowerCase() === "true";

  return NextResponse.json(
    { enabled: requested && hasPayPalRuntimeConfiguration() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
