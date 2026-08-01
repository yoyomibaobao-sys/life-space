"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const copy = {
  brand: "有时·耕作",
  englishBrand: "LifeSpace",
  spaceTitle: "自然生活空间",
  subtitle: "一个围绕耕作、生态与自然生活展开的空间。",
  poem: "记录四时变化，留下发现、收获与成长。\n让生命被看见，让生活有迹可循。",
  spirit: "留其间，守其度，顺其时，共生长。",
  cards: [
    ["种植", "花草、蔬菜、果树与庭院植物"],
    ["农法设施", "堆肥、灌溉、水培与工具系统"],
    ["虫鱼生态", "鱼缸、昆虫、小动物与小生态"],
    ["其他", "其他自然生活相关项目"],
  ],
};

export default function Home() {
  const router = useRouter();
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function checkSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) return;
      if (session?.user) {
        router.replace("/archive");
        return;
      }
      setCheckingSession(false);
    }

    void checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) router.replace("/archive");
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [router]);

  if (checkingSession) {
    return <section style={loadingStyle}>正在进入...</section>;
  }

  return (
    <main className="signed-out-home" style={pageStyle}>
      <style>{`
        @media (max-width: 760px) {
          .signed-out-home { min-height: auto !important; padding: 18px 14px 92px !important; align-items: flex-start !important; }
          .home-content { gap: 14px !important; }
          .home-hero { padding: 20px 14px !important; }
          .home-actions { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
          .home-category-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
        }
        @media (max-height: 720px) and (min-width: 761px) {
          .signed-out-home { align-items: flex-start !important; padding-top: 18px !important; padding-bottom: 18px !important; }
          .home-hero { padding-top: 18px !important; padding-bottom: 16px !important; }
        }
      `}</style>

      <div className="home-content" style={contentStyle}>
        <section className="home-hero" style={heroStyle}>
          <h1 style={brandStyle}>
            <span>{copy.brand}</span>
            <span style={englishBrandStyle}>{copy.englishBrand}</span>
          </h1>

          <div style={spaceTitleStyle}>{copy.spaceTitle}</div>
          <p style={subtitleStyle}>{copy.subtitle}</p>
          <p style={poemStyle}>{copy.poem}</p>
          <div style={spiritStyle}>{copy.spirit}</div>

          <div className="home-actions" style={actionsStyle}>
            <Link href="/register" style={primaryActionStyle}>注册</Link>
            <Link href="/login" style={secondaryActionStyle}>登录</Link>
            <Link href="/discover" style={softActionStyle}>浏览发现</Link>
            <Link href="/api/download/android" style={softActionStyle}>下载 Android</Link>
          </div>
        </section>

        <section className="home-category-grid" aria-label="自然生活记录范围" style={categoryGridStyle}>
          {copy.cards.map(([title, description]) => (
            <article key={title} style={categoryCardStyle}>
              <strong style={categoryTitleStyle}>{title}</strong>
              <span style={categoryDescriptionStyle}>{description}</span>
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
  maxWidth: 860,
  width: "100%",
  margin: "0 auto",
  padding: "28px 24px 22px",
  boxSizing: "border-box",
  textAlign: "center",
  border: "1px solid #e2eadc",
  borderRadius: 24,
  background: "rgba(255,255,255,0.82)",
  boxShadow: "0 14px 36px rgba(54, 81, 45, 0.07)",
};

const brandStyle: CSSProperties = {
  margin: "0 0 5px",
  display: "flex",
  justifyContent: "center",
  alignItems: "baseline",
  gap: 9,
  flexWrap: "wrap",
  color: "#243024",
  fontSize: "clamp(28px, 4.4vw, 38px)",
  fontWeight: 650,
  letterSpacing: 1.2,
  lineHeight: 1.15,
};

const englishBrandStyle: CSSProperties = {
  color: "#587052",
  fontSize: "0.48em",
  fontWeight: 700,
  letterSpacing: 0.4,
};

const spaceTitleStyle: CSSProperties = {
  color: "#496347",
  fontSize: "clamp(16px, 2.2vw, 19px)",
  fontWeight: 800,
  letterSpacing: 2,
};

const subtitleStyle: CSSProperties = {
  margin: "8px auto 12px",
  color: "#71806d",
  fontSize: 14,
  lineHeight: 1.6,
};

const poemStyle: CSSProperties = {
  margin: "0 auto",
  color: "#2f3b2f",
  fontSize: "clamp(17px, 2.5vw, 21px)",
  fontWeight: 550,
  lineHeight: 1.65,
  whiteSpace: "pre-line",
};

const spiritStyle: CSSProperties = {
  display: "inline-flex",
  marginTop: 14,
  padding: "8px 18px",
  borderRadius: 999,
  border: "1px solid #d9e5cf",
  background: "#f7faf3",
  color: "#2f4b2b",
  fontSize: "clamp(15px, 2vw, 18px)",
  fontWeight: 750,
  letterSpacing: 0.8,
};

const actionsStyle: CSSProperties = {
  maxWidth: 680,
  margin: "18px auto 0",
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 9,
};

const actionBaseStyle: CSSProperties = {
  minHeight: 42,
  padding: "10px 13px",
  boxSizing: "border-box",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 999,
  textDecoration: "none",
  fontSize: 14,
  fontWeight: 750,
  whiteSpace: "nowrap",
};

const primaryActionStyle: CSSProperties = {
  ...actionBaseStyle,
  background: "#3f7d3d",
  color: "#fff",
  border: "1px solid #3f7d3d",
};

const secondaryActionStyle: CSSProperties = {
  ...actionBaseStyle,
  background: "#fff",
  color: "#2f5f2d",
  border: "1px solid #cfdcc8",
};

const softActionStyle: CSSProperties = {
  ...actionBaseStyle,
  background: "#eef5e8",
  color: "#496b3f",
  border: "1px solid #d9e6d0",
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
