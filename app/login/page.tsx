"use client";

import { Capacitor } from "@capacitor/core";
import { Keyboard } from "@capacitor/keyboard";
import { useEffect, useRef, useState } from "react";
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
  const focusTimersRef = useRef<number[]>([]);

  useEffect(() => {
    const savedEmail = localStorage.getItem("remember_email");
    if (savedEmail) {
      setEmail(savedEmail);
    }
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let disposed = false;
    let listenerHandles: Array<{ remove: () => Promise<void> }> = [];

    function scrollFocusedFieldIntoView() {
      const activeElement = document.activeElement;
      if (!(activeElement instanceof HTMLInputElement)) return;

      const timer = window.setTimeout(() => {
        activeElement.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "nearest",
        });
      }, 120);
      focusTimersRef.current.push(timer);
    }

    function markKeyboardOpen(keyboardHeight: number) {
      document.documentElement.dataset.authKeyboardOpen = "true";
      document.documentElement.style.setProperty(
        "--auth-keyboard-height",
        `${Math.max(0, keyboardHeight)}px`,
      );
      scrollFocusedFieldIntoView();
    }

    function markKeyboardClosed() {
      delete document.documentElement.dataset.authKeyboardOpen;
      document.documentElement.style.setProperty(
        "--auth-keyboard-height",
        "0px",
      );
    }

    void Promise.all([
      Keyboard.addListener("keyboardWillShow", (info) => {
        markKeyboardOpen(info.keyboardHeight);
      }),
      Keyboard.addListener("keyboardDidShow", (info) => {
        markKeyboardOpen(info.keyboardHeight);
      }),
      Keyboard.addListener("keyboardWillHide", markKeyboardClosed),
      Keyboard.addListener("keyboardDidHide", markKeyboardClosed),
    ]).then((handles) => {
      if (disposed) {
        for (const handle of handles) void handle.remove();
        return;
      }

      listenerHandles = handles;
    });

    return () => {
      disposed = true;
      for (const handle of listenerHandles) void handle.remove();
      for (const timer of focusTimersRef.current) window.clearTimeout(timer);
      focusTimersRef.current = [];
      markKeyboardClosed();
    };
  }, []);

  function keepFieldVisible(element: HTMLInputElement) {
    if (!Capacitor.isNativePlatform()) return;

    document.documentElement.dataset.authKeyboardOpen = "true";
    const timer = window.setTimeout(() => {
      element.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "nearest",
      });
    }, 180);
    focusTimersRef.current.push(timer);
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
      style={{
        minHeight: "calc(100dvh - 50px - var(--app-safe-area-top))",
        padding: "32px 20px max(32px, calc(var(--auth-keyboard-height) + 24px))",
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        overflowY: "auto",
        scrollPaddingBlock: 24,
      }}
    >
      <div style={{ width: "100%", maxWidth: 320 }}>
        <h1 style={{ marginBottom: 10 }}>{t.auth.login_title}</h1>

        <form onSubmit={handleLogin}>
          <p>{t.auth.email}</p>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onFocus={(e) => keepFieldVisible(e.currentTarget)}
            placeholder={t.auth.email_placeholder}
            autoComplete="email"
            style={{
              padding: "12px",
              width: "100%",
              borderRadius: "6px",
              border: "1px solid #ccc",
              boxSizing: "border-box",
            }}
          />

          <p style={{ marginTop: 16 }}>{t.auth.password}</p>
          <PasswordInput
            value={password}
            onChange={setPassword}
            onFocus={keepFieldVisible}
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
      </div>
    </main>
  );
}
