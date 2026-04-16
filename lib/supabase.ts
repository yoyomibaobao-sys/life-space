import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      persistSession: true,       // ✅ 持久登录
      autoRefreshToken: true,     // ✅ 自动续期
      detectSessionInUrl: true,   // ✅ 支持邮箱验证跳转
    },
  }
);