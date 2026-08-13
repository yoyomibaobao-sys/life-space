"use client";

import { Capacitor } from "@capacitor/core";
import { Keyboard } from "@capacitor/keyboard";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
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

function getCurrentViewportHeight() {
  return Math.max(
    0,
    window.visualViewport?.height || window.innerHeight,
  );
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
  const pageRef = useRef<HTMLElement>(null);
  const focusedFieldRef = useRef<HTMLInputElement | null>(null);
  const keyboardOpenRef = useRef(false);
  const keyboardHeightRef = useRef(0);
  const baselineViewportHeightRef = useRef(0);

  const syncVisibleViewportHeight = useCallback(() => {
    const currentHeight = getCurrentViewportHeight();

    if (!keyboardOpenRef.current) {
      baselineViewportHeightRef.current = Math.max(
        baselineViewportHeightRef.current,
        currentHeight,
        window.innerHeight,
      );
    }

    const baselineHeight = Math.max(
      baselineViewportHeightRef.current,
      currentHeight,
    );
    const viewportAlreadyResized = currentHeight + 96 < baselineHeight;
    const nativeVisibleHeight =
      keyboardHeightRef.current > 0
        ? baselineHeight - keyboardHeightRef.current
        : currentHeight;
    const visibleHeight = keyboardOpenRef.current
      ? viewportAlreadyResized
        ? currentHeight
        : Math.max(240, nativeVisibleHeight)
      : currentHeight;

    document.documentElement.style.setProperty(
      "--auth-visible-viewport-height",
      `${Math.round(Math.max(240, visibleHeight))}px`,
    );
  }, []);

  const scrollFieldIntoVisibleArea = useCallback(
    (element?: HTMLInputElement | null) => {
      const target = element || focusedFieldRef.current;
      if (!target) return;

      focusedFieldRef.current = target;

      for (const delay of [0, 120, 280]) {
        const timer = window.setTimeout(() => {
          const container = pageRef.current;
          if (!container) {
            target.scrollIntoView({ block: "center", inline: "nearest" });
            return;
          }

          const containerRect = container.getBoundingClientRect();
          const targetRect = target.getBoundingClientRect();
          const visibleTop = containerRect.top + 12;
          const visibleBottom = containerRect.bottom - 16;
          let delta = 0;

          if (targetRect.bottom > visibleBottom) {
            delta = targetRect.bottom - visibleBottom;
          } else if (targetRect.top < visibleTop) {
            delta = targetRect.top - visibleTop;
          } else if (keyboardOpenRef.current && targetRect.top > visibleTop + 28) {
            delta = targetRect.top - visibleTop;
          }

          if (delta !== 0) {
            container.scrollBy({
              top: delta,
              behavior: delay === 0 ? "auto" : "smooth",
            });
          }
        }, delay);
        focusTimersRef.current.push(timer);
      }
    },
    [],
  );

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

    function markKeyboardOpen(keyboardHeight: number) {
      keyboardOpenRef.current = true;
      keyboardHeightRef.current = Math.max(0, keyboardHeight);
      document.documentElement.dataset.authKeyboardOpen = "true";
      document.documentElement.style.setProperty(
        "--auth-keyboard-height",
        `${keyboardHeightRef.current}px`,
      );
      syncVisibleViewportHeight();
      scrollFieldIntoVisibleArea();
    }

    function markKeyboardClosed() {
      keyboardOpenRef.current = false;
      keyboardHeightRef.current = 0;
      delete document.documentElement.dataset.authKeyboardOpen;
      document.documentElement.style.setProperty(
        "--auth-keyboard-height",
        "0px",
      );
      syncVisibleViewportHeight();
    }

    function handleViewportChange() {
      syncVisibleViewportHeight();
      if (keyboardOpenRef.current) {
        scrollFieldIntoVisibleArea();
      }
    }

    baselineViewportHeightRef.current = Math.max(
      window.innerHeight,
      getCurrentViewportHeight(),
    );
    syncVisibleViewportHeight();
    window.addEventListener("resize", handleViewportChange);
    window.visualViewport?.addEventListener("resize", handleViewportChange);
    window.visualViewport?.addEventListener("scroll", handleViewportChange);

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
      window.removeEventListener("resize", handleViewportChange);
      window.visualViewport?.removeEventListener("resize", handleViewportChange);
      window.visualViewport?.removeEventListener("scroll", handleViewportChange);
      for (const timer of focusTimersRef.current) window.clearTimeout(timer);
      focusTimersRef.current = [];
      markKeyboardClosed();
      document.documentElement.style.removeProperty(
        "--auth-visible-viewport-height",
      );
    };
  }, [scrollFieldIntoVisibleArea, syncVisibleViewportHeight]);

  function keepFieldVisible(element: HTMLInputElement) {
    if (!Capacitor.isNativePlatform()) return;

    focusedFieldRef.current = element;
    keyboardOpenRef.current = true;
    document.documentElement.dataset.authKeyboardOpen = "true";
    syncVisibleViewportHeight();
    scrollFieldIntoVisibleArea(element);
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
      style={{
        minHeight: "calc(100dvh - 50px - var(--app-safe-area-top))",
        padding: "20px 20px 28px",
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        overflowY: "auto",
        scrollPaddingBlock: 24,
      }}
    >
      <div style={{ width: "100%", maxWidth: 360 }}>
        <h1 style={{ margin: "0 0 14px", lineHeight: 1.2 }}>{t.auth.login_title}</h1>

        <form onSubmit={handleLogin}>
          <p style={{ margin: "0 0 6px" }}>{t.auth.email}</p>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onFocus={(e) => keepFieldVisible(e.currentTarget)}
            placeholder={t.auth.email_placeholder}
            autoComplete="email"
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
