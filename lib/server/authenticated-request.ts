import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseServer } from "@/lib/supabaseServer";

function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Missing Supabase env for authenticated request.");
  }

  return { url, anonKey };
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
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

export function hasValidMutationOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export async function getAuthenticatedRequestClient(
  request: Request
): Promise<{ supabase: SupabaseClient; userId: string } | null> {
  const cookieClient = await getSupabaseServer();
  const cookieUser = await cookieClient.auth.getUser();

  if (!cookieUser.error && cookieUser.data.user?.id) {
    return {
      supabase: cookieClient,
      userId: cookieUser.data.user.id,
    };
  }

  const accessToken = getBearerToken(request);
  if (!accessToken) return null;

  const tokenClient = createSupabaseWithBearerToken(accessToken);
  const tokenUser = await tokenClient.auth.getUser(accessToken);

  if (tokenUser.error || !tokenUser.data.user?.id) return null;

  return {
    supabase: tokenClient,
    userId: tokenUser.data.user.id,
  };
}
