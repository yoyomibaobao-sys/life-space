"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { initialAuthCallback, supabase } from "@/lib/supabase";
import { buildLoginHref, getSafeReturnTo } from "@/lib/auth-return";
import { useLanguage } from "@/lib/i18n/useLanguage";

type EmailToken = { token_hash: string; type: "email" | "recovery" };

export default function ConfirmEmailPage() {
  const { language } = useLanguage();
  const en = language === "en";
  const tokenRef = useRef<EmailToken | null>(null);
  const busyRef = useRef(false);
  const initializedRef = useRef(false);
  const [state, setState] = useState<"checking" | "ready" | "working" | "success" | "invalid" | "network">("checking");
  const [destination, setDestination] = useState("/archive");
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    const query = new URLSearchParams(window.location.search);
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const type = fragment.get("type") || query.get("type") || initialAuthCallback?.type;
    const isRecovery = type === "recovery";
    setRecovery(isRecovery);
    setDestination(isRecovery ? "/reset-password" : getSafeReturnTo(query.get("returnTo")));
    const tokenHash = fragment.get("token_hash") || query.get("token_hash");
    if (initialAuthCallback?.hasError || fragment.has("error") || query.has("error") || fragment.has("error_code") || query.has("error_code")) {
      window.history.replaceState(null, "", "/auth/confirm");
      setState("invalid");
      return;
    }
    if (tokenHash) {
      // A token is consumed only after an explicit click, so email link previews
      // cannot accidentally confirm an account or consume a recovery link.
      window.history.replaceState(null, "", "/auth/confirm");
      if ((type !== "email" && type !== "signup" && type !== "recovery") || !/^[a-zA-Z0-9_-]{32,512}$/.test(tokenHash)) {
        setState("invalid");
        return;
      }
      tokenRef.current = { token_hash: tokenHash, type: isRecovery ? "recovery" : "email" };
      setState("ready");
      return;
    }
    // Older ConfirmationURL emails contain a session fragment. The existing
    // browser client restores it; do not claim success from a pre-existing login.
    const hasCallback = initialAuthCallback?.hasSession || initialAuthCallback?.hasCode || fragment.has("access_token") || query.has("code");
    if (!hasCallback) { setState("invalid"); return; }
    void (async () => {
      try {
        let result = await supabase.auth.getSession();
        const code = new URLSearchParams(window.location.search).get("code");
        if (code) result = await supabase.auth.exchangeCodeForSession(code);
        if (result.error || !result.data.session) { setState("invalid"); return; }
        const { data, error } = await supabase.auth.getUser();
        if (error || !data.user?.email_confirmed_at) { setState("invalid"); return; }
        setState("success");
      } catch { setState("network"); }
      finally { window.history.replaceState(null, "", "/auth/confirm"); }
    })();
  }, []);

  async function confirm() {
    if (!tokenRef.current || busyRef.current) return;
    busyRef.current = true;
    setState("working");
    try {
      const { data, error } = await supabase.auth.verifyOtp(tokenRef.current);
      if (error) {
        setState(error.status && error.status < 500 ? "invalid" : "network");
        return;
      }
      if (!data.session || !data.user?.email_confirmed_at) { setState("invalid"); return; }
      tokenRef.current = null;
      setState("success");
    } catch { setState("network"); }
    finally { busyRef.current = false; }
  }

  const invalid = state === "invalid";
  return (
    <main style={{ maxWidth: 440, margin: "0 auto", padding: "36px 20px", color: "#263a28" }}>
      <h1 style={{ fontSize: 24 }}>{recovery ? (en ? "Reset password" : "重置密码") : (en ? "Confirm email" : "确认邮箱")}</h1>
      <p role="status" style={{ lineHeight: 1.8 }}>
        {state === "success" ? (recovery ? (en ? "Link verified. You can now set a new password." : "验证成功，可以设置新密码。") : (en ? "Email confirmed. Your account is ready." : "邮箱已确认，账号可以正常使用。"))
          : invalid ? (en ? "This link is invalid or has expired. Request a new email." : "链接无效或已过期，请重新发送邮件。")
            : state === "network" ? (en ? "Could not connect. Check your connection and try again." : "暂时无法连接，请检查网络后重试。")
              : state === "checking" || state === "working" ? (en ? "Verifying…" : "正在验证…")
                : (en ? "Continue to verify this email link." : "点击下方按钮完成本次邮件验证。")}
      </p>
      {state === "ready" || (state === "network" && tokenRef.current) || state === "working" ? (
        <button type="button" onClick={() => void confirm()} disabled={state === "working"} style={actionStyle}>
          {en ? "Continue verification" : "确认并继续"}
        </button>
      ) : null}
      {state === "success" ? <Link href={destination} style={actionStyle}>{recovery ? (en ? "Set new password" : "设置新密码") : (en ? "Open My Space" : "进入我的空间")}</Link> : null}
      {invalid || state === "network" ? <Link href={buildLoginHref("/archive")} style={{ display: "block", marginTop: 18 }}>{en ? "Return to sign in" : "返回登录，重新发送邮件"}</Link> : null}
    </main>
  );
}

const actionStyle = { display: "inline-block", padding: "12px 20px", border: 0, borderRadius: 24, background: "#527c46", color: "#fff", textDecoration: "none", fontSize: 15, cursor: "pointer" };
