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
  compact?: boolean;
  interactionOnly?: boolean;
};

export default function AuthCaptcha({
  action,
  onTokenChange,
  resetKey,
  compact = false,
  interactionOnly = false,
}: AuthCaptchaProps) {
  const { t } = useLanguage();

  return (
    <TurnstileChallengeView
      siteKey={TURNSTILE_SITE_KEY}
      action={action}
      onTokenChange={onTokenChange}
      resetKey={resetKey}
      compact={compact}
      interactionOnly={interactionOnly}
      loadingText={t.auth.captcha_loading}
      errorText={t.auth.captcha_load_failed}
    />
  );
}
