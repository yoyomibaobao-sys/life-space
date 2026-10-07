"use client";

import { useLanguage } from "@/lib/i18n/useLanguage";
import TurnstileChallengeView from "@/components/auth/TurnstileChallengeView";

const TURNSTILE_SITE_KEY =
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || "";

export const AUTH_CAPTCHA_ENABLED = TURNSTILE_SITE_KEY.length > 0;

type AuthCaptchaProps = {
  action: "auth" | "register" | "resend";
  onTokenChange: (token: string | null) => void;
  resetKey: number;
};

export default function AuthCaptcha({
  action,
  onTokenChange,
  resetKey,
}: AuthCaptchaProps) {
  const { t } = useLanguage();

  return (
    <TurnstileChallengeView
      siteKey={TURNSTILE_SITE_KEY}
      action={action}
      onTokenChange={onTokenChange}
      resetKey={resetKey}
      loadingText={t.auth.captcha_loading}
      errorText={t.auth.captcha_load_failed}
    />
  );
}
