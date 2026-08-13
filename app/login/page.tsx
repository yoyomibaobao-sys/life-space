"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import PasswordInput from "@/components/PasswordInput";
import { useLanguage } from "@/lib/i18n/useLanguage";

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

function getLoginErrorMessage(
  message: string,
  copy: {
    invalid_credentials: string;
    email_not_confirmed: string;
    login_failed_prefix: string;
  }
) {
  const text = message.toLowerCase();

  if (text.includes("invalid login credentials")) {
    return copy.invalid_credentials;
  }

  if (text.includes("email not confirmed")) {
    return copy.email_not_confirmed;
  }

  return `${copy.login_failed_prefix}${message}`;
}

export default function LoginPage() {
  const router = useRouter();
  const { t } = useLanguage();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [lastSentTime, setLastSentTime] = useState(0);
  const [showLocalFallback, setShowLocalFallback] = useState(false);
  const pageRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const savedEmail = localStorage.getItem("remember_email");
    if (savedEmail) {
      setEmail(savedEmail);
    }
  }, []);

  useEffect(() => {
    return () => {
      delete document.documentElement.dataset.authKeyboardOpen;
    };
  }, []);

  function markKeyboardOpen() {
    document.documentElement.dataset.authKeyboardOpen = "true";
  }

  function handleLoginPageBlur() {
    window.setTimeout(() => {
      const activeElement = document.activeElement;
      const keyboardFieldStillFocused =
        activeElement instanceof HTMLElement &&
        pageRef.current?.contains(activeElement) &&
        activeElement.matches(
          'input:not([type="checkbox"]):not([type="radio"]), textarea',
        );

      if (!keyboardFieldStillFocused) {
        delete document.documentElement.dataset.authKeyboardOpen;
      }
    }, 80);
  }

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setShowLocalFallback(false);

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !password) {
      setMessage(t.auth.enter_email_password);
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (error) {
        if (isNetworkError(error.message)) {
          setMessage(t.auth.network_local_fallback);
          setShowLocalFallback(true);
          return;
        }

        setMessage(getLoginErrorMessage(error.message, t.auth));
        return;
      }

      if (remember) {
        localStorage.setItem("remember_email", cleanEmail);
      } else {
        localStorage.removeItem("remember_email");
      }

      router.replace("/archive");
    } catch {
      setMessage(t.auth.network_local_fallback);
      setShowLocalFallback(true);
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword() {
    setShowLocalFallback(false);
    const now = Date.now();

    if (now - lastSentTime < 30000) {
      setMessage(t.auth.retry_after_30_seconds);
      return;
    }

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      setMessage(t.auth.enter_email);
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        setMessage(`${t.auth.send_failed_prefix}${error.message}`);
        return;
      }

      setLastSentTime(now);
      setMessage(t.auth.reset_email_sent);
    } catch {
      setMessage(t.auth.network_error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      ref={pageRef}
      className="auth-login-page"
      onBlurCapture={handleLoginPageBlur}
      style={{
        padding: "20px 20px 28px",
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      <div style={{ width: "100%", maxWidth: 360, margin: "0 auto" }}>
        <h1 style={{ margin: "0 0 14px", lineHeight: 1.2 }}>{t.auth.login_title}</h1>

        <form onSubmit={handleLogin}>
          <p style={{ margin: "0 0 6px" }}>{t.auth.email}</p>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onFocus={markKeyboardOpen}
            placeholder={t.auth.email_placeholder}
            autoComplete="email"
            autoCapitalize="none"
            inputMode="email"
            enterKeyHint="next"
            spellCheck={false}
            style={{
              padding: "11px 12px",
              width: "100%",
              borderRadius: "10px",
              border: "1px solid #ccc",
              boxSizing: "border-box",
            }}
          />

          <p style={{ margin: "12px 0 6px" }}>{t.auth.password}</p>
          <PasswordInput
            value={password}
            onChange={setPassword}
            onFocus={markKeyboardOpen}
          />

          <div style={{ marginTop: 10, fontSize: 12 }}>
            <label style={{ cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                style={{ marginRight: 6 }}
              />
              {t.auth.remember_email}
            </label>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "12px",
              borderRadius: "6px",
              border: "none",
              background: "#4CAF50",
              color: "#fff",
              marginTop: 20,
              cursor: "pointer",
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? t.auth.processing : t.auth.login}
          </button>

          <button
            type="button"
            onClick={() => router.push("/register")}
            disabled={loading}
            style={{
              width: "100%",
              padding: "12px",
              borderRadius: "6px",
              border: "1px solid #ddd",
              background: "#fafafa",
              marginTop: 10,
              cursor: "pointer",
              color: "#333",
              fontWeight: 500,
            }}
          >
            {t.auth.register_account}
          </button>

          <div
            onClick={handleResetPassword}
            style={{
              marginTop: 12,
              fontSize: 12,
              color: "#4CAF50",
              cursor: "pointer",
              textAlign: "right",
            }}
          >
            {t.auth.forgot_password}
          </div>
        </form>

        {message && (
          <div
            style={{
              marginTop: 20,
              padding: 12,
              background: "#f5f5f5",
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
            disabled={loading}
            style={{
              width: "100%",
              padding: "12px",
              borderRadius: "6px",
              border: "1px solid #dfe8da",
              background: "#f6faf3",
              marginTop: 10,
              cursor: "pointer",
              color: "#496b3f",
              fontWeight: 500,
            }}
          >
            {t.auth.local_first}
          </button>
        ) : null}

        <div style={loginLinkRowStyle}>
          <Link href="/" style={loginTextLinkStyle}>
            {t.local_mode.home}
          </Link>
          <Link href="/api/download/android" style={loginDownloadLinkStyle}>
            {t.home.download_android}
          </Link>
        </div>
      </div>
    </main>
  );
}

const loginLinkRowStyle: CSSProperties = {
  marginTop: 16,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};

const loginTextLinkStyle: CSSProperties = {
  color: "#647060",
  fontSize: 13,
  fontWeight: 700,
  textDecoration: "none",
};

const loginDownloadLinkStyle: CSSProperties = {
  ...loginTextLinkStyle,
  color: "#356b34",
  textDecoration: "underline",
  textUnderlineOffset: 3,
};
