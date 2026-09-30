import { supabase } from "@/lib/supabase";
import { isAndroidOnline } from "@/lib/android-connectivity";

export async function restoreBundledSession(client: typeof supabase = supabase, online = isAndroidOnline()) {
  const stored = await client.auth.getSession();
  if (stored.error) throw stored.error;
  const user = stored.data.session?.user || null;
  if (!user || !online) return user;
  const verified = await client.auth.getUser();
  if (verified.error || verified.data.user?.id !== user.id) return null;
  return verified.data.user;
}

export async function loginBundledWithTurnstile(input: {
  email: string;
  password: string;
  captchaToken: string | null;
  siteKeyConfigured: boolean;
}, client: typeof supabase = supabase) {
  if (!input.siteKeyConfigured) throw new Error("turnstile_site_key_missing");
  if (!input.captchaToken) throw new Error("turnstile_token_required");
  const result = await client.auth.signInWithPassword({
    email: input.email.trim().toLowerCase(), password: input.password,
    options: { captchaToken: input.captchaToken },
  });
  if (result.error) throw result.error;
  if (!result.data.user || !result.data.session) throw new Error("session_missing");
  return result.data.user;
}
