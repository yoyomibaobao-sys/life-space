import { buildAuthEmailRedirect } from "@/lib/auth-return";
import { supabase } from "@/lib/supabase";

const LEGAL_VERSION = "2026-09-01";

// Shared by the website and the bundled Android form. Confirmation continues
// through the existing email callback; registration never uploads local data.
export function registerAccount(input: {
  email: string;
  password: string;
  captchaToken: string | null;
  returnTo: string;
}) {
  return supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      captchaToken: input.captchaToken || undefined,
      emailRedirectTo: buildAuthEmailRedirect("signup", input.returnTo),
      data: {
        legal_terms_accepted: true,
        legal_terms_version: LEGAL_VERSION,
        privacy_notice_accepted: true,
        privacy_notice_version: LEGAL_VERSION,
        cross_border_consent: true,
        cross_border_consent_version: LEGAL_VERSION,
      },
    },
  });
}
