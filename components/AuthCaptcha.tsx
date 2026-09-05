"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/lib/i18n/useLanguage";

const TURNSTILE_SITE_KEY =
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || "";

export const AUTH_CAPTCHA_ENABLED = TURNSTILE_SITE_KEY.length > 0;

type TurnstileOptions = {
  sitekey: string;
  action: string;
  theme: "auto";
  language: "auto";
  callback: (token: string) => void;
  "expired-callback": () => void;
  "error-callback": () => void;
};

type TurnstileApi = {
  render: (container: HTMLElement, options: TurnstileOptions) => string;
  remove: (widgetId: string) => void;
  reset: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

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
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenChangeRef = useRef(onTokenChange);
  const [scriptReady, setScriptReady] = useState(false);
  const [scriptFailed, setScriptFailed] = useState(false);

  useEffect(() => {
    onTokenChangeRef.current = onTokenChange;
  }, [onTokenChange]);

  useEffect(() => {
    if (
      !AUTH_CAPTCHA_ENABLED ||
      !scriptReady ||
      !containerRef.current ||
      !window.turnstile
    ) {
      return;
    }

    const widgetId = window.turnstile.render(containerRef.current, {
      sitekey: TURNSTILE_SITE_KEY,
      action,
      theme: "auto",
      language: "auto",
      callback: (token) => onTokenChangeRef.current(token),
      "expired-callback": () => onTokenChangeRef.current(null),
      "error-callback": () => onTokenChangeRef.current(null),
    });

    widgetIdRef.current = widgetId;

    return () => {
      if (window.turnstile && widgetIdRef.current) {
        window.turnstile.remove(widgetIdRef.current);
      }
      widgetIdRef.current = null;
      onTokenChangeRef.current(null);
    };
  }, [action, scriptReady]);

  useEffect(() => {
    if (resetKey === 0 || !window.turnstile || !widgetIdRef.current) return;

    window.turnstile.reset(widgetIdRef.current);
    onTokenChangeRef.current(null);
  }, [resetKey]);

  if (!AUTH_CAPTCHA_ENABLED) return null;

  return (
    <div
      style={{
        marginTop: 14,
        minHeight: 65,
        display: "grid",
        justifyItems: "center",
      }}
    >
      <Script
        id="cloudflare-turnstile"
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={() => {
          setScriptFailed(false);
          setScriptReady(true);
        }}
        onError={() => {
          setScriptFailed(true);
          setScriptReady(false);
          onTokenChangeRef.current(null);
        }}
      />
      <div ref={containerRef} />
      {!scriptReady && !scriptFailed ? (
        <p style={captchaMessageStyle}>{t.auth.captcha_loading}</p>
      ) : null}
      {scriptFailed ? (
        <p style={captchaErrorStyle}>{t.auth.captcha_load_failed}</p>
      ) : null}
    </div>
  );
}

const captchaMessageStyle: React.CSSProperties = {
  margin: 0,
  color: "#667466",
  fontSize: 12,
  lineHeight: 1.5,
};

const captchaErrorStyle: React.CSSProperties = {
  ...captchaMessageStyle,
  color: "#8a4a4a",
};
