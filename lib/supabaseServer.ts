import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { CookieWriteOptions } from "@/lib/domain-types";

function getSupabaseEnv() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing Supabase env. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local."
    );
  }

  return { url, anonKey };
}

export async function getSupabaseServer() {
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabaseEnv();

  return createServerClient(url, anonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieWriteOptions) {
        try {
          cookieStore.set({ name, value, ...options });
        } catch {
          // Server Components may not be able to set cookies; middleware/route handlers can.
        }
      },
      remove(name: string, options: CookieWriteOptions) {
        try {
          cookieStore.set({ name, value: "", ...options });
        } catch {
          // Server Components may not be able to remove cookies; middleware/route handlers can.
        }
      },
    },
  });
}
