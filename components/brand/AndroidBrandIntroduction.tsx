"use client";

import type { CSSProperties } from "react";

type Language = "zh" | "en";

export default function AndroidBrandIntroduction({ language, onLanguageChange, onRegister, onLogin, onLocalUse, onBrowseHome, onBack }: {
  language: Language;
  onLanguageChange: (language: Language) => void;
  onRegister?: () => void;
  onLogin?: () => void;
  onLocalUse?: () => void;
  onBrowseHome?: () => void;
  onBack?: () => void;
}) {
  const zh = language === "zh";
  return <section data-android-shell-page={onBack ? "about" : "welcome"} style={pageStyle}>
    <header style={headerStyle}>
      {onBack ? <button type="button" className="secondary-button" onClick={onBack} aria-label={zh ? "返回" : "Back"}>{zh ? "返回" : "Back"}</button> : <span />}
      <div role="group" aria-label={zh ? "语言" : "Language"} style={languageStyle}>
        <button type="button" aria-pressed={zh} onClick={() => onLanguageChange("zh")}>中文</button>
        <span aria-hidden="true">/</span>
        <button type="button" aria-pressed={!zh} onClick={() => onLanguageChange("en")}>EN</button>
      </div>
    </header>
    <div style={introductionStyle}>
      <img src="/brand/youshi-space-icon-192.png" alt="" width={72} height={72} style={{ borderRadius: 16 }} />
      <h1 style={{ margin: "22px 0 4px", fontSize: 27, lineHeight: 1.25 }}>LifeSpace·自然</h1>
      <p style={{ margin: 0, color: "#557350", fontWeight: 600 }}>有时·耕作</p>
      <p style={{ margin: "14px 0 32px", color: "#63715f" }}>{zh ? "一个围绕耕作展开的生活空间" : "LifeSpace for Cultivation"}</p>
      <div style={{ lineHeight: 1.85, color: "#40543c", fontSize: 15 }}>
        {zh ? <>
          <p>记录四时变化，留下发现与成长。<br />让生命被看见，让生活有迹可循。</p>
          <p style={mottoStyle}>留其间，守其度，<br />顺其时，共养成。</p>
        </> : <>
          <p>Record the changing seasons, and preserve moments of discovery and growth.</p>
          <p>Let life be seen, and let everyday living leave its trace.</p>
          <p style={mottoStyle}>Stay with it.<br />Keep its rhythm.<br />Follow its season.<br />Grow together.</p>
        </>}
      </div>
      {onBack && onBrowseHome ? <div style={actionsStyle}>
        {onRegister ? <button type="button" className="primary-button" onClick={onRegister}>{zh ? "注册账号" : "Create account"}</button> : null}
        {onLogin ? <button type="button" className="secondary-button" onClick={onLogin}>{zh ? "登录" : "Sign in"}</button> : null}
        <button type="button" className="secondary-button" onClick={onBrowseHome}>{zh ? "浏览首页" : "Browse home"}</button>
      </div> : onRegister && onLogin && onLocalUse ? <div style={actionsStyle}>
        <button type="button" className="primary-button" onClick={onRegister}>{zh ? "注册账号" : "Create account"}</button>
        <button type="button" className="secondary-button" onClick={onLogin}>{zh ? "已有账号，登录" : "Already have an account? Sign in"}</button>
        <button type="button" className="secondary-button" onClick={onLocalUse}>{zh ? "暂不注册，免费使用本地空间" : "Use local space free without registering"}</button>
      </div> : null}
    </div>
  </section>;
}

const pageStyle: CSSProperties = { maxWidth: 520, margin: "0 auto", padding: "12px 16px 56px" };
const headerStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 44 };
const languageStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 5, color: "#61735d", fontSize: 13 };
const introductionStyle: CSSProperties = { textAlign: "center", paddingTop: 28 };
const mottoStyle: CSSProperties = { fontWeight: 650, color: "#334b31" };
const actionsStyle: CSSProperties = { display: "grid", gap: 10, margin: "28px auto 0", maxWidth: 330 };
