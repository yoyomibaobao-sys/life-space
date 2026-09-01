"use client";

import Link from "next/link";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import PasswordInput from "@/components/PasswordInput";
import AuthCaptcha, { AUTH_CAPTCHA_ENABLED } from "@/components/AuthCaptcha";
import { trackAnalyticsEvent } from "@/lib/analytics-events";
import { useLanguage } from "@/lib/i18n/useLanguage";
import { buildLoginHref, getSafeReturnTo } from "@/lib/auth-return";

const LEGAL_VERSION = "2026-09-01";

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isNetworkError(message: string) {
  const text = message.toLowerCase();
  return [
    "failed to fetch",
    "fetch failed",
    "network request failed",
    "network error",
    "load failed",
  ].some((part) => text.includes(part));
}

function getErrorMessage(
  message: string,
  copy: {
    already_registered: string;
    register_failed_password: string;
    register_failed_prefix: string;
  }
) {
  const text = message.toLowerCase();

  if (text.includes("already registered") || text.includes("been registered")) {
    return copy.already_registered;
  }

  if (text.includes("password")) {
    return copy.register_failed_password;
  }

  return `${copy.register_failed_prefix}${message}`;
}

export default function RegisterPage() {
  const router = useRouter();
  const { t } = useLanguage();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [showLocalFallback, setShowLocalFallback] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedCrossBorder, setAcceptedCrossBorder] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaResetKey, setCaptchaResetKey] = useState(0);

  async function handleRegister(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setShowLocalFallback(false);

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !password) {
      setMessage(t.auth.enter_email_password);
      return;
    }

    if (!isEmail(cleanEmail)) {
      setMessage(t.auth.invalid_email);
      return;
    }

    if (password.length < 8) {
      setMessage(t.auth.password_minimum);
      return;
    }

    if (!acceptedTerms || !acceptedCrossBorder) {
      setMessage(t.auth.registration_consent_required);
      return;
    }

    if (AUTH_CAPTCHA_ENABLED && !captchaToken) {
      setMessage(t.auth.captcha_required);
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const returnTo = getSafeReturnTo(new URLSearchParams(window.location.search).get("returnTo"));
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          captchaToken: captchaToken || undefined,
          emailRedirectTo: `${window.location.origin}${returnTo}`,
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

      if (error) {
        if (isNetworkError(error.message)) {
          setMessage(t.auth.network_local_fallback);
          setShowLocalFallback(true);
          return;
        }

        setMessage(getErrorMessage(error.message, t.auth));
        return;
      }

      const identities = data.user?.identities ?? [];
      if (data.user && identities.length === 0) {
        setMessage(t.auth.already_registered);
        return;
      }

      void trackAnalyticsEvent("register");

      if (data.session) {
        router.replace(returnTo);
        return;
      }

      router.push(`/check-email?email=${encodeURIComponent(cleanEmail)}&type=signup&returnTo=${encodeURIComponent(returnTo)}`);
    } catch {
      setMessage(t.auth.network_local_fallback);
      setShowLocalFallback(true);
    } finally {
      setCaptchaResetKey((value) => value + 1);
      setLoading(false);
    }
  }

  return (
    <main style={{ padding: "32px 20px", display: "flex", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 320 }}>
        <h1 style={{ marginBottom: 10 }}>{t.auth.register_title}</h1>

        <div
          style={{
            marginBottom: 20,
            padding: 12,
            borderRadius: 12,
            background: "#f6faf3",
            border: "1px solid #e1ecd9",
            color: "#5f6f58",
            fontSize: 13,
            lineHeight: 1.7,
          }}
        >
          {t.auth.registration_intro}
        </div>

        <form onSubmit={handleRegister}>
          <p>{t.auth.email}</p>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t.auth.email_placeholder}
            autoComplete="email"
            autoCapitalize="none"
            inputMode="email"
            enterKeyHint="next"
            spellCheck={false}
            required
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 6,
              border: "1px solid #ccc",
              boxSizing: "border-box",
            }}
          />

          <p style={{ marginTop: 16 }}>{t.auth.password}</p>
          <PasswordInput
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            minLength={8}
            required
          />

          <label style={consentLabelStyle}>
            <input
              type="checkbox"
              checked={acceptedTerms}
              onChange={(event) => setAcceptedTerms(event.target.checked)}
              required
            />
            <span>
              {t.auth.registration_terms_prefix}
              <Link href="/legal/terms" target="_blank" rel="noreferrer" style={consentLinkStyle}>
                {t.auth.registration_terms}
              </Link>
              {t.auth.registration_terms_joiner}
              <Link href="/legal/privacy" target="_blank" rel="noreferrer" style={consentLinkStyle}>
                {t.auth.registration_privacy}
              </Link>
            </span>
          </label>

          <label style={consentLabelStyle}>
            <input
              type="checkbox"
              checked={acceptedCrossBorder}
              onChange={(event) => setAcceptedCrossBorder(event.target.checked)}
              required
            />
            <span>{t.auth.registration_cross_border_consent}</span>
          </label>

          <AuthCaptcha
            action="register"
            onTokenChange={setCaptchaToken}
            resetKey={captchaResetKey}
          />

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: 12,
              marginTop: 20,
              background: "#4CAF50",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              opacity: loading ? 0.6 : 1,
            }}
          >
          {loading ? t.auth.processing : t.register}
          </button>
        </form>

        <button
          type="button"
          onClick={() => router.push(buildLoginHref(getSafeReturnTo(new URLSearchParams(window.location.search).get("returnTo"))))}
          style={{
            marginTop: 12,
            padding: 0,
            border: "none",
            background: "transparent",
            fontSize: 12,
            color: "#4CAF50",
            cursor: "pointer",
          }}
        >
          {t.auth.existing_account_login}
        </button>

        {message && (
          <div
            style={{
              marginTop: 20,
              background: "#f5f5f5",
              padding: 12,
              borderRadius: 6,
              fontSize: 14,
              lineHeight: 1.6,
            }}
          >
            {message}
          </div>
        )}

        {showLocalFallback ? (
          <button
            type="button"
            onClick={() => router.push("/local/archive")}
            style={{
              width: "100%",
              marginTop: 12,
              padding: 12,
              border: "1px solid #dfe8da",
              background: "#f6faf3",
              borderRadius: 6,
              fontSize: 14,
              color: "#496b3f",
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            {t.auth.local_first}
          </button>
        ) : null}
      </div>
    </main>
  );
}

const consentLabelStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 8,
  marginTop: 14,
  color: "#556653",
  fontSize: 12,
  lineHeight: 1.55,
};

const consentLinkStyle: React.CSSProperties = {
  color: "#326b37",
  fontWeight: 700,
  textDecoration: "underline",
};
