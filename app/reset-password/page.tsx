"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PasswordInput from "@/components/PasswordInput";
import { supabase } from "@/lib/supabase";
import { useLanguage } from "@/lib/i18n/useLanguage";

export default function ResetPasswordPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [checkingSession, setCheckingSession] = useState(true);
  const [canReset, setCanReset] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updateSucceeded, setUpdateSucceeded] = useState(false);

  useEffect(() => {
    let mounted = true;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;

      if (event === "PASSWORD_RECOVERY" || session) {
        setCanReset(true);
        setMessage("");
      }

      setCheckingSession(false);
    });

    async function checkSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) return;

      if (session) {
        setCanReset(true);
        setMessage("");
        setCheckingSession(false);
        return;
      }

      const code = new URLSearchParams(window.location.search).get("code");

      if (code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);

        if (!mounted) return;

        if (!error && data.session) {
          window.history.replaceState(null, "", "/reset-password");
          setCanReset(true);
          setMessage("");
        } else {
          setCanReset(false);
          setMessage(t.auth.reset_link_invalid);
        }

        setCheckingSession(false);
        return;
      } else {
        setCanReset(false);
        setMessage(t.auth.open_from_reset_email);
      }

      setCheckingSession(false);
    }

    void checkSession();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [t.auth]);

  async function handleUpdate() {
    if (!canReset) {
      setUpdateSucceeded(false);
      setMessage(t.auth.open_from_reset_email);
      return;
    }

    const nextPassword = password.trim();
    const nextConfirmPassword = confirmPassword.trim();

    if (!nextPassword || !nextConfirmPassword) {
      setUpdateSucceeded(false);
      setMessage(t.auth.enter_confirm_new_password);
      return;
    }

    if (nextPassword.length < 8) {
      setUpdateSucceeded(false);
      setMessage(t.auth.password_length_error);
      return;
    }

    if (nextPassword !== nextConfirmPassword) {
      setUpdateSucceeded(false);
      setMessage(t.auth.password_mismatch);
      return;
    }

    setSaving(true);
    setUpdateSucceeded(false);
    setMessage("");

    try {
      const { error } = await supabase.auth.updateUser({ password: nextPassword });

      if (error) {
        setMessage(t.auth.password_update_failed);
        return;
      }

      setUpdateSucceeded(true);
      setMessage(t.auth.password_updated);

      setTimeout(() => {
        router.push("/login");
      }, 900);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main style={{ padding: "40px 20px", maxWidth: 420, margin: "0 auto", color: "#1f2d1f" }}>
      <h2 style={{ marginBottom: 8 }}>{t.auth.reset_title}</h2>
      <p style={{ marginTop: 0, marginBottom: 22, color: "#6f7f6f", fontSize: 14 }}>
        {t.auth.reset_intro}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <label style={{ fontSize: 13, color: "#536553" }}>
          {t.auth.new_password}
          <div style={{ marginTop: 6 }}>
            <PasswordInput
              value={password}
              onChange={setPassword}
              placeholder={t.auth.new_password_placeholder}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
        </label>

        <label style={{ fontSize: 13, color: "#536553" }}>
          {t.auth.confirm_new_password}
          <div style={{ marginTop: 6 }}>
            <PasswordInput
              value={confirmPassword}
              onChange={setConfirmPassword}
              placeholder={t.auth.confirm_new_password_placeholder}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
        </label>

        <button
          type="button"
          onClick={handleUpdate}
          disabled={checkingSession || saving || !canReset}
          style={{
            marginTop: 4,
            width: "100%",
            padding: "12px",
            borderRadius: 10,
            border: "none",
            background: checkingSession || saving || !canReset ? "#9aa59a" : "#111",
            color: "#fff",
            cursor: checkingSession || saving || !canReset ? "default" : "pointer",
            fontWeight: 700,
          }}
        >
          {checkingSession ? t.auth.checking_link : saving ? t.auth.updating : t.auth.update_password}
        </button>
      </div>

      {message && (
        <div
          style={{
            marginTop: 14,
            padding: "10px 12px",
            borderRadius: 10,
            background: updateSucceeded ? "#f0fff4" : "#fff7f7",
            border: updateSucceeded ? "1px solid #cae9ca" : "1px solid #e6c9c9",
            color: updateSucceeded ? "#2e7d32" : "#8a4a4a",
            fontSize: 13,
          }}
        >
          {message}
        </div>
      )}
    </main>
  );
}
