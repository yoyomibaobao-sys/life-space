"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

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

type Props = {
  siteKey: string;
  action: "auth" | "register" | "resend";
  onTokenChange: (token: string | null) => void;
  resetKey: number;
  loadingText: string;
  errorText: string;
};

const SCRIPT_ID = "cloudflare-turnstile";
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export default function TurnstileChallengeView({
  siteKey,
  action,
  onTokenChange,
  resetKey,
  loadingText,
  errorText,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenChangeRef = useRef(onTokenChange);
  const [scriptReady, setScriptReady] = useState(
    () => typeof window !== "undefined" && Boolean(window.turnstile),
  );
  const [scriptFailed, setScriptFailed] = useState(false);

  useEffect(() => {
    onTokenChangeRef.current = onTokenChange;
  }, [onTokenChange]);

  useEffect(() => {
    if (!siteKey) return;

    if (window.turnstile) {
      setScriptFailed(false);
      setScriptReady(true);
      return;
    }

    let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    const handleLoad = () => {
      setScriptFailed(false);
      setScriptReady(true);
    };
    const handleError = () => {
      setScriptFailed(true);
      setScriptReady(false);
      onTokenChangeRef.current(null);
    };

    if (!script) {
      script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }

    script.addEventListener("load", handleLoad);
    script.addEventListener("error", handleError);

    if (window.turnstile) handleLoad();

    return () => {
      script?.removeEventListener("load", handleLoad);
      script?.removeEventListener("error", handleError);
    };
  }, [siteKey]);

  useEffect(() => {
    if (!siteKey || !scriptReady || !containerRef.current || !window.turnstile) {
      return;
    }

    const widgetId = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
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
  }, [action, scriptReady, siteKey]);

  useEffect(() => {
    if (resetKey === 0 || !window.turnstile || !widgetIdRef.current) return;

    window.turnstile.reset(widgetIdRef.current);
    onTokenChangeRef.current(null);
  }, [resetKey]);

  if (!siteKey) return null;

  return (
    <div style={containerStyle}>
      <div ref={containerRef} />
      {!scriptReady && !scriptFailed ? (
        <p style={messageStyle}>{loadingText}</p>
      ) : null}
      {scriptFailed ? <p style={errorStyle}>{errorText}</p> : null}
    </div>
  );
}

const containerStyle: CSSProperties = {
  marginTop: 14,
  minHeight: 65,
  display: "grid",
  justifyItems: "center",
};

const messageStyle: CSSProperties = {
  margin: 0,
  color: "#667466",
  fontSize: 12,
  lineHeight: 1.5,
};

const errorStyle: CSSProperties = {
  ...messageStyle,
  color: "#8a4a4a",
};
