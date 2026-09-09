import { createClient } from "@supabase/supabase-js";

// Capture only callback metadata before the SDK consumes its session fragment.
// Never persist or log the email token / access-token URL.
export const initialAuthCallback = (() => {
  if (typeof window === "undefined" || window.location.pathname !== "/auth/confirm") return null;
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const query = new URLSearchParams(window.location.search);
  return {
    hasSession: hash.has("access_token"),
    hasCode: query.has("code"),
    type: hash.get("type") || query.get("type"),
    hasError: hash.has("error") || hash.has("error_code") || query.has("error") || query.has("error_code"),
  };
})();

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )!,
  {
    auth: {
      persistSession: true,       // 持久登录
      autoRefreshToken: true,     // 自动续期
      detectSessionInUrl: true,   // 支持邮箱验证跳转
    },
  }
);
