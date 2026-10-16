"use client";

import { useRef, useState, type FormEvent } from "react";
import AuthCaptcha, { AUTH_CAPTCHA_ENABLED } from "@/components/AuthCaptcha";
import AndroidProfileInfoPage from "@/components/profile/AndroidProfileInfoPage";
import MobilePageHeaderView from "@/components/mobile/MobilePageHeaderView";
import PasswordInput from "@/components/PasswordInput";
import { completeAndroidAuthLogin } from "@/lib/android-auth-state";
import { buildAuthEmailRedirect } from "@/lib/auth-return";
import { useLanguage } from "@/lib/i18n/useLanguage";
import { registerAccount } from "@/lib/registration";
import { supabase } from "@/lib/supabase";

const legalLinkStyle = { border: 0, background: "none", padding: 0, font: "inherit", color: "#3b6840", textDecoration: "underline" } as const;

export function AndroidRegistration({ online, onBack, onLogin, onLocalUse, onConfirmEmail, onSignedIn }: {
  online: boolean;
  onBack: () => void;
  onLogin: () => void;
  onLocalUse: () => void;
  onConfirmEmail: (email: string) => void;
  onSignedIn: (userId: string) => void;
}) {
  const { language, t } = useLanguage();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [terms, setTerms] = useState(false);
  const [crossBorder, setCrossBorder] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [legal, setLegal] = useState<"terms" | "privacy" | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!online) { setMessage(t.auth.network_local_fallback); return; }
    if (!cleanEmail || !password) { setMessage(t.auth.enter_email_password); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) { setMessage(t.auth.invalid_email); return; }
    if (password.length < 8) { setMessage(t.auth.password_minimum); return; }
    if (!terms || !crossBorder) { setMessage(t.auth.registration_consent_required); return; }
    if (AUTH_CAPTCHA_ENABLED && !captchaToken) { setMessage(t.auth.captcha_required); return; }
    setLoading(true);
    setMessage("");
    try {
      const { data, error } = await registerAccount({ email: cleanEmail, password, captchaToken, returnTo: "/archive" });
      if (error) {
        const cause = error.message.toLowerCase();
        setMessage(cause.includes("already registered") || cause.includes("been registered") ? t.auth.already_registered
          : cause.includes("password") ? t.auth.register_failed_password
          : cause.includes("failed to fetch") || cause.includes("network") || cause.includes("load failed")
            ? t.auth.network_local_fallback : `${t.auth.register_failed_prefix}${error.message}`);
        return;
      }
      if (data.user && (data.user.identities ?? []).length === 0) { setMessage(t.auth.already_registered); return; }
      if (data.session?.user) {
        completeAndroidAuthLogin(data.session.user);
        onSignedIn(data.session.user.id);
      } else {
        onConfirmEmail(cleanEmail);
      }
    } catch {
      setMessage(t.auth.network_local_fallback);
    } finally {
      setCaptchaToken(null);
      setResetKey((value) => value + 1);
      setLoading(false);
    }
  }

  return <div data-android-shell-page="register">
    <div hidden={legal !== null}>
      <MobilePageHeaderView title={t.auth.register_title} titleText={t.auth.register_title} showBack onBack={onBack} />
      <section className="panel" style={{ maxWidth: 480, margin: "0 auto", padding: 18 }}>
        <form className="form" style={{ gridTemplateColumns: "minmax(0, 1fr)" }} onSubmit={(event) => void submit(event)}>
          <div className="field"><label htmlFor="android-register-email">{t.auth.email}</label>
            <input id="android-register-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)}
              autoComplete="email" autoCapitalize="none" inputMode="email" spellCheck={false} required />
          </div>
          <div className="field"><label>{t.auth.password}</label>
            <PasswordInput value={password} onChange={setPassword} autoComplete="new-password" minLength={8} required />
          </div>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 12, fontSize: 13, lineHeight: 1.55 }}>
            <input type="checkbox" checked={terms} onChange={(event) => setTerms(event.target.checked)} required />
            <span style={{ minWidth: 0 }}>{t.auth.registration_terms_prefix}
              <button type="button" style={legalLinkStyle} onClick={() => setLegal("terms")}>{t.auth.registration_terms}</button>
              {t.auth.registration_terms_joiner}
              <button type="button" style={legalLinkStyle} onClick={() => setLegal("privacy")}>{t.auth.registration_privacy}</button>
            </span>
          </label>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 12, fontSize: 13, lineHeight: 1.55 }}>
            <input type="checkbox" checked={crossBorder} onChange={(event) => setCrossBorder(event.target.checked)} required />
            <span style={{ minWidth: 0 }}>{language === "zh"
              ? "我单独同意由境外服务商处理注册及登录所需账号信息和我主动上传的云端内容（详见隐私说明）。"
              : "I separately consent to overseas processing of account information and cloud content I choose to upload (see Privacy Notice)."}</span>
          </label>
          <AuthCaptcha compact action="register" onTokenChange={setCaptchaToken} resetKey={resetKey} />
          {message ? <p role="alert" className="project-meta">{message}</p> : null}
          <div className="submit-row"><button type="submit" className="primary-button" disabled={loading || !online}>{loading ? t.auth.processing : t.register}</button></div>
        </form>
        <div className="action-row" style={{ marginTop: 12 }}>
          <button type="button" className="secondary-button" onClick={onLogin}>{t.auth.existing_account_login}</button>
          <button type="button" className="secondary-button" onClick={onLocalUse}>{t.auth.local_first}</button>
        </div>
      </section>
    </div>
    {legal ? <AndroidProfileInfoPage kind={`legal-${legal}`} online={online} signedIn={false}
      onBack={() => setLegal(null)} onNavigate={(path) => {
        if (path === "/legal/terms") setLegal("terms");
        if (path === "/legal/privacy") setLegal("privacy");
      }} /> : null}
  </div>;
}

export function AndroidRegistrationEmail({ email, online, onLogin, onBack }: {
  email: string;
  online: boolean;
  onLogin: () => void;
  onBack: () => void;
}) {
  const { t } = useLanguage();
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [lastSentTime, setLastSentTime] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const busy = useRef(false);
  async function resend() {
    if (!email) { setMessage(t.auth.missing_email); return; }
    if (busy.current || !online) { setMessage(t.auth.network_error); return; }
    if (Date.now() - lastSentTime < 30000) { setMessage(t.auth.retry_after_30_seconds); return; }
    if (AUTH_CAPTCHA_ENABLED && !captchaToken) { setMessage(t.auth.captcha_required); return; }
    busy.current = true;
    setLoading(true);
    setMessage("");
    try {
      const { error } = await supabase.auth.resend({ type: "signup", email,
        options: { captchaToken: captchaToken || undefined, emailRedirectTo: buildAuthEmailRedirect("signup", "/archive") },
      });
      if (error) setMessage(`${t.auth.send_failed_prefix}${error.message}`);
      else { setLastSentTime(Date.now()); setMessage(t.auth.confirmation_sent); }
    } catch { setMessage(t.auth.network_error); }
    finally { busy.current = false; setCaptchaToken(null); setResetKey((value) => value + 1); setLoading(false); }
  }
  return <div data-android-shell-page="check-email">
    <MobilePageHeaderView title={t.auth.confirm_email_title} titleText={t.auth.confirm_email_title} showBack onBack={onBack} />
    <section className="panel" style={{ maxWidth: 480, margin: "0 auto", padding: 18, textAlign: "center" }}>
      <h1>{t.auth.confirm_email_title}</h1><p>{t.auth.confirm_email_intro}</p>
      <p style={{ overflowWrap: "anywhere" }}>{t.auth.current_email_prefix}{email}</p>
      <AuthCaptcha action="resend" onTokenChange={setCaptchaToken} resetKey={resetKey} />
      {message ? <p role="status">{message}</p> : null}
      <div className="action-row" style={{ justifyContent: "center" }}>
        <button type="button" className="secondary-button" disabled={loading || !online} onClick={() => void resend()}>{loading ? t.auth.processing : t.auth.resend_confirmation}</button>
        <button type="button" className="primary-button" onClick={onLogin}>{t.auth.return_login}</button>
      </div>
    </section>
  </div>;
}
