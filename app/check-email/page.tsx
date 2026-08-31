"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useLanguage } from "@/lib/i18n/useLanguage";
import { buildLoginHref, buildRegisterHref, getSafeReturnTo } from "@/lib/auth-return";

function CheckEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useLanguage();

  const email = useMemo(() => searchParams.get("email")?.trim() || "", [searchParams]);
  const type = searchParams.get("type") || "signup";
  const returnTo = getSafeReturnTo(searchParams.get("returnTo"));

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [lastSentTime, setLastSentTime] = useState(0);

  async function handleResend() {
    if (!email) {
      setMessage(t.auth.missing_email);
      return;
    }

    const now = Date.now();
    if (now - lastSentTime < 30000) {
      setMessage(t.auth.retry_after_30_seconds);
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const { error } = await supabase.auth.resend({
        type: type === "signup" ? "signup" : "signup",
        email,
        options: {
          emailRedirectTo: `${window.location.origin}${returnTo}`,
        },
      });

      if (error) {
        setMessage(`${t.auth.send_failed_prefix}${error.message}`);
        return;
      }

      setLastSentTime(now);
      setMessage(t.auth.confirmation_sent);
    } catch {
      setMessage(t.auth.network_error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        padding: "32px 20px",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div style={{ width: "100%", maxWidth: 360, textAlign: "center" }}>
        <h1>{t.auth.confirm_email_title}</h1>

        <p style={{ marginTop: 20, fontSize: 14, color: "#666", lineHeight: 1.8 }}>
          {t.auth.confirm_email_intro}
        </p>

        {email && (
          <div
            style={{
              marginTop: 12,
              padding: "12px 14px",
              background: "#f5f5f5",
              borderRadius: 8,
              fontSize: 14,
              color: "#333",
              wordBreak: "break-all",
            }}
          >
            {t.auth.current_email_prefix}{email}
          </div>
        )}

        <div style={{ display: "grid", gap: 10, marginTop: 24 }}>
          <button
            onClick={handleResend}
            disabled={loading}
            style={{
              padding: "12px 20px",
              background: "#4CAF50",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? t.auth.processing : t.auth.resend_confirmation}
          </button>

          <button
            onClick={() => router.push(buildLoginHref(returnTo))}
            style={{
              padding: "12px 20px",
              background: "#fff",
              color: "#333",
              border: "1px solid #ddd",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            {t.auth.return_login}
          </button>

          <button
            onClick={() => router.push(buildRegisterHref(returnTo))}
            style={{
              padding: "12px 20px",
              background: "#fff",
              color: "#333",
              border: "1px solid #ddd",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            {t.auth.return_register}
          </button>
        </div>

        {message && (
          <div
            style={{
              marginTop: 20,
              background: "#f5f5f5",
              padding: 12,
              borderRadius: 8,
              fontSize: 14,
              lineHeight: 1.6,
              textAlign: "left",
            }}
          >
            {message}
          </div>
        )}
      </div>
    </main>
  );
}


export default function CheckEmailPage() {
  const { t } = useLanguage();

  return (
    <Suspense
      fallback={
        <main
          style={{
            padding: "32px 20px",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <div style={{ width: "100%", maxWidth: 360, textAlign: "center" }}>
            <h1>{t.auth.confirm_email_title}</h1>
            <p style={{ marginTop: 20, fontSize: 14, color: "#666", lineHeight: 1.8 }}>
              {t.auth.page_loading}
            </p>
          </div>
        </main>
      }
    >
      <CheckEmailContent />
    </Suspense>
  );
}
