"use client";

import { Capacitor } from "@capacitor/core";
import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import UiIcon from "@/components/ui/UiIcon";
import BrandMark from "@/components/BrandMark";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useIsNativeApp } from "@/lib/capacitor/useIsNativeApp";
import { useLanguage } from "@/lib/i18n/useLanguage";

export default function Home() {
  const router = useRouter();
  const { t } = useLanguage();
  const isNativeApp = useIsNativeApp();
  const [checkingSession, setCheckingSession] = useState(true);
  const [currentUserId, setCurrentUserId] = useState("");

  useEffect(() => {
    let mounted = true;
    const nativeApp = Capacitor.isNativePlatform();

    async function checkSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) return;
      if (session?.user && nativeApp) {
        router.replace("/archive");
        return;
      }
      setCurrentUserId(session?.user?.id || "");
      setCheckingSession(false);
    }

    void checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user && Capacitor.isNativePlatform()) {
        router.replace("/archive");
        return;
      }

      setCurrentUserId(session?.user?.id || "");
      setCheckingSession(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [router]);

  if (checkingSession) {
    return <section style={loadingStyle}>{t.home.entering}</section>;
  }

  return (
    <main className="signed-out-home" style={pageStyle}>
      <style>{`
        @media (max-width: 760px) {
          .signed-out-home { min-height: auto !important; padding: 14px 12px 92px !important; align-items: flex-start !important; }
          .home-content { gap: 14px !important; }
          .home-hero { padding: 20px 18px 18px !important; text-align: left !important; border-radius: 22px !important; }
          .home-brand { justify-content: flex-start !important; gap: 6px 8px !important; font-size: 31px !important; letter-spacing: 0.6px !important; }
          .home-english-brand { flex-basis: 100%; font-size: 12px !important; letter-spacing: 0.9px !important; text-transform: uppercase; }
          .home-space-title { margin-top: 12px !important; font-size: 15px !important; letter-spacing: 0.8px !important; }
          .home-subtitle { margin: 7px 0 15px !important; font-size: 14px !important; line-height: 1.65 !important; }
          .home-poem { margin: 0 !important; padding-left: 13px !important; border-left: 3px solid #a8c49d; font-size: 16px !important; line-height: 1.65 !important; }
          .home-spirit { width: 100% !important; margin-top: 15px !important; padding: 11px 13px !important; border-radius: 14px !important; justify-content: flex-start !important; font-size: 14px !important; line-height: 1.55 !important; letter-spacing: 0.3px !important; }
          .home-actions { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
          .home-actions > a:first-child { grid-column: 1 / -1; }
          .home-actions[data-has-download="false"] > a:last-child { grid-column: 1 / -1; }
          .home-membership-link { margin-top: 11px !important; }
          .home-category-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
        }
        @media (max-height: 720px) and (min-width: 761px) {
          .signed-out-home { align-items: flex-start !important; padding-top: 18px !important; padding-bottom: 18px !important; }
          .home-hero { padding-top: 18px !important; padding-bottom: 16px !important; }
        }
      `}</style>

      <div className="home-content" style={contentStyle}>
        <section className="home-hero" style={heroStyle}>
          <div className="home-language" style={languageSwitcherStyle}>
            <LanguageSwitcher compact />
          </div>
          <h1 className="home-brand" style={brandStyle}>
            <BrandMark size={40} tone="quiet" />
            <span style={brandCopyStyle}>
              <span>{t.home.brand}</span>
              <span className="home-english-brand" style={englishBrandStyle}>
                {t.home.english_brand}
              </span>
            </span>
          </h1>

          <div className="home-space-title" style={spaceTitleStyle}>
            {t.home.space_title}
          </div>
          <p className="home-subtitle" style={subtitleStyle}>{t.home.subtitle}</p>
          <p className="home-poem" style={poemStyle}>{t.home.poem}</p>
          <div className="home-spirit" style={spiritStyle}>{t.home.spirit}</div>

          <div
            className="home-actions"
            data-has-download={isNativeApp === false ? "true" : "false"}
            style={actionsStyle}
          >
            <Link href={currentUserId ? "/archive" : "/register"} style={actionBaseStyle}>
              {currentUserId ? t.home.enter_my_space : t.register}
            </Link>
            {isNativeApp === false ? (
              <Link href="/api/download/android" style={actionBaseStyle}>
                {t.home.download_android}
              </Link>
            ) : null}
            <Link href="/discover" style={actionBaseStyle}>{t.home.browse_discover}</Link>
          </div>
          <Link className="home-membership-link" href="/membership" style={membershipLinkStyle}>
            <span style={membershipLinkCopyStyle}>
              <strong style={membershipLinkTitleStyle}>{t.home.membership_title}</strong>
              <span style={membershipLinkDescriptionStyle}>
                {t.home.membership_description}
              </span>
            </span>
            <span aria-hidden="true" style={membershipLinkArrowStyle}>
              <UiIcon name="arrow-right" size={16} strokeWidth={2} />
            </span>
          </Link>
        </section>

        <section className="home-category-grid" aria-label={t.home.category_aria} style={categoryGridStyle}>
          {t.home.cards.map((card) => (
            <article key={card.title} style={categoryCardStyle}>
              <strong style={categoryTitleStyle}>{card.title}</strong>
              <span style={categoryDescriptionStyle}>{card.description}</span>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}

const loadingStyle: CSSProperties = {
  minHeight: "70vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#777",
  fontSize: 14,
};

const pageStyle: CSSProperties = {
  minHeight: "calc(100vh - 70px)",
  padding: "28px 20px",
  boxSizing: "border-box",
  display: "flex",
  alignItems: "center",
  background: "linear-gradient(180deg, #f6f8f2 0%, #ffffff 68%, #f6f8f3 100%)",
};

const contentStyle: CSSProperties = {
  width: "100%",
  maxWidth: 1060,
  margin: "0 auto",
  display: "grid",
  gap: 18,
};

const heroStyle: CSSProperties = {
  position: "relative",
  maxWidth: 860,
  width: "100%",
  margin: "0 auto",
  padding: "28px 32px 24px",
  boxSizing: "border-box",
  textAlign: "center",
  border: "1px solid #e0e9da",
  borderRadius: 26,
  background:
    "radial-gradient(circle at 92% 8%, rgba(218, 234, 207, 0.72), transparent 34%), rgba(255, 255, 255, 0.9)",
  boxShadow: "0 12px 30px rgba(45, 72, 38, 0.07)",
};

const languageSwitcherStyle: CSSProperties = {
  position: "absolute",
  top: 14,
  right: 14,
};

const brandStyle: CSSProperties = {
  margin: 0,
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  gap: 9,
  flexWrap: "wrap",
  color: "#243024",
  fontSize: "clamp(26px, 3.8vw, 34px)",
  fontWeight: 650,
  letterSpacing: 1.2,
  lineHeight: 1.15,
};

const brandCopyStyle: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "center",
  gap: 9,
  flexWrap: "wrap",
};

const englishBrandStyle: CSSProperties = {
  color: "#587052",
  fontSize: "0.48em",
  fontWeight: 700,
  letterSpacing: 0.4,
};

const spaceTitleStyle: CSSProperties = {
  marginTop: 7,
  color: "#496347",
  fontSize: "clamp(15px, 2vw, 18px)",
  fontWeight: 800,
  letterSpacing: 2,
};

const subtitleStyle: CSSProperties = {
  margin: "8px auto 15px",
  color: "#71806d",
  fontSize: 14,
  lineHeight: 1.6,
};

const poemStyle: CSSProperties = {
  margin: "0 auto",
  maxWidth: 650,
  color: "#2f3b2f",
  fontSize: "clamp(16px, 2.2vw, 19px)",
  fontWeight: 550,
  lineHeight: 1.65,
  whiteSpace: "pre-line",
};

const spiritStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  marginTop: 14,
  padding: "8px 18px",
  borderRadius: 999,
  border: "1px solid #d9e5cf",
  background: "#f7faf3",
  color: "#2f4b2b",
  fontSize: "clamp(14px, 1.8vw, 16px)",
  fontWeight: 750,
  letterSpacing: 0.8,
};

const actionsStyle: CSSProperties = {
  maxWidth: 520,
  margin: "17px auto 0",
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 9,
};

const actionBaseStyle: CSSProperties = {
  minHeight: 44,
  padding: "11px 14px",
  boxSizing: "border-box",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 13,
  textDecoration: "none",
  fontSize: 14,
  fontWeight: 750,
  whiteSpace: "nowrap",
  background: "#fff",
  color: "#4f6550",
  border: "1px solid #dce5d9",
};

const membershipLinkStyle: CSSProperties = {
  width: "min(100%, 520px)",
  margin: "13px auto 0",
  padding: "11px 13px 11px 15px",
  boxSizing: "border-box",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 14,
  border: "1px solid #cadbc3",
  borderRadius: 12,
  background: "#f7faf4",
  color: "#4d6149",
  lineHeight: 1.45,
  textDecoration: "none",
  textAlign: "left",
  boxShadow: "0 2px 8px rgba(53, 83, 46, 0.07)",
};

const membershipLinkCopyStyle: CSSProperties = {
  minWidth: 0,
  display: "grid",
  gap: 2,
};

const membershipLinkTitleStyle: CSSProperties = {
  color: "#354f31",
  fontSize: 14,
  fontWeight: 800,
};

const membershipLinkDescriptionStyle: CSSProperties = {
  color: "#6d7c69",
  fontSize: 12,
};

const membershipLinkArrowStyle: CSSProperties = {
  flex: "0 0 auto",
  width: 28,
  height: 28,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 999,
  background: "#e5efdf",
  color: "#45643e",
  fontSize: 16,
  fontWeight: 800,
};

const categoryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 10,
};

const categoryCardStyle: CSSProperties = {
  minWidth: 0,
  padding: "12px 14px",
  display: "grid",
  gap: 4,
  border: "1px solid #e6ecdf",
  borderRadius: 15,
  background: "rgba(255,255,255,0.86)",
};

const categoryTitleStyle: CSSProperties = {
  color: "#263326",
  fontSize: 15,
};

const categoryDescriptionStyle: CSSProperties = {
  color: "#687468",
  fontSize: 12.5,
  lineHeight: 1.45,
};
