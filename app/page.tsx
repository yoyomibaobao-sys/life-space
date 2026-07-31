"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const copy = {
  zhCN: {
    brand: "有时·耕作",
    englishBrand: "LifeSpace",
    spaceTitle: "自然生活空间",
    subtitle: "一个围绕耕作、生态与自然生活展开的空间。",
    poem:
      "记录四时变化，\n留下发现、收获与成长，\n让生命被看见，\n让生活有迹可循。",
    spirit: "留其间，守其度，\n顺其时，共生长。",
    register: "注册",
    login: "登录",
    discover: "浏览发现",
    apk: "下载 Android APK",
    cards: [
      {
        title: "种植",
        description:
          "为花草、蔬菜、果树、多肉、香草、盆栽和地栽建立长期档案。",
      },
      {
        title: "农法设施",
        description:
          "记录堆肥、架子、灌溉、水培、过滤、温室和工具系统的搭建与调整。",
      },
      {
        title: "虫鱼生态",
        description:
          "观察鱼缸、虾缸、蚯蚓、黑水虻、小动物和小生态的变化。",
      },
      {
        title: "其他",
        description: "记录其他自然生活相关项目。",
      },
    ],
  },
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

    checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        router.replace("/archive");
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [router]);

  if (checkingSession) {
    return (
      <section
        style={{
          minHeight: "70vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#777",
          fontSize: 14,
        }}
      >
        正在进入...
      </section>
    );
  }

  const t = copy.zhCN;

  return (
    <main
      style={{
        minHeight: "calc(100vh - 70px)",
        padding: "64px 20px",
        boxSizing: "border-box",
        background:
          "linear-gradient(180deg, #f6f8f2 0%, #ffffff 42%, #f5f5f5 100%)",
      }}
    >
      <div
        style={{
          maxWidth: 960,
          margin: "0 auto",
        }}
      >
        <section
          style={{
            maxWidth: 760,
            margin: "0 auto",
            textAlign: "center",
            padding: "44px 20px 34px",
          }}
        >
          <h1
            style={{
              margin: "0 0 12px",
              color: "#243024",
              display: "flex",
              alignItems: "baseline",
              justifyContent: "center",
              gap: 10,
              flexWrap: "wrap",
              fontSize: "clamp(28px, 5vw, 38px)",
              fontWeight: 600,
              letterSpacing: 1.6,
              lineHeight: 1.2,
            }}
          >
            <span>{t.brand}</span>
            <span
              style={{
                color: "#587052",
                fontSize: "0.5em",
                fontWeight: 600,
                letterSpacing: 0.5,
              }}
            >
              {t.englishBrand}
            </span>
          </h1>

          <p
            style={{
              margin: "0 auto 14px",
              color: "#496347",
              fontSize: "clamp(16px, 2.6vw, 19px)",
              fontWeight: 700,
              letterSpacing: 2,
              lineHeight: 1.5,
            }}
          >
            {t.spaceTitle}
          </p>

          <p
            style={{
              maxWidth: 680,
              margin: "0 auto 24px",
              color: "#71806d",
              fontSize: 14.5,
              lineHeight: 1.7,
            }}
          >
            {t.subtitle}
          </p>

          <p
            style={{
              maxWidth: 680,
              margin: "0 auto 16px",
              color: "#2f3b2f",
              fontSize: "clamp(18px, 3vw, 23px)",
              fontWeight: 500,
              lineHeight: 1.8,
              whiteSpace: "pre-line",
            }}
          >
            {t.poem}
          </p>

          <div
            style={{
              display: "inline-block",
              margin: "24px auto 0",
              padding: "13px 24px",
              borderRadius: 18,
              border: "1px solid #d9e5cf",
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.95), rgba(246,250,240,0.92))",
              boxShadow: "0 10px 28px rgba(71, 102, 55, 0.08)",
            }}
          >
            <p
              style={{
                margin: 0,
                color: "#2f4b2b",
                fontSize: "clamp(18px, 3.4vw, 22px)",
                fontWeight: 600,
                lineHeight: 1.6,
                letterSpacing: 1.3,
                whiteSpace: "pre-line",
              }}
            >
              {t.spirit}
            </p>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: 12,
              flexWrap: "wrap",
              marginTop: 30,
            }}
          >
            <Link
              href="/register"
              style={{
                minWidth: 120,
                padding: "12px 22px",
                borderRadius: 999,
                background: "#3f7d3d",
                color: "#fff",
                textDecoration: "none",
                fontSize: 16,
                fontWeight: 500,
                boxSizing: "border-box",
              }}
            >
              {t.register}
            </Link>

            <Link
              href="/login"
              style={{
                minWidth: 120,
                padding: "12px 22px",
                borderRadius: 999,
                background: "#fff",
                color: "#2f5f2d",
                textDecoration: "none",
                fontSize: 16,
                fontWeight: 500,
                border: "1px solid #cfdcc8",
                boxSizing: "border-box",
              }}
            >
              {t.login}
            </Link>

            <Link
              href="/discover"
              style={{
                minWidth: 200,
                padding: "12px 22px",
                borderRadius: 999,
                background: "#eef5e8",
                color: "#496b3f",
                textDecoration: "none",
                fontSize: 16,
                fontWeight: 500,
                border: "1px solid #d9e6d0",
                boxSizing: "border-box",
              }}
            >
              {t.discover}
            </Link>

            <Link
              href="/api/download/android"
              style={{
                minWidth: 180,
                padding: "12px 22px",
                borderRadius: 999,
                background: "#f8fbf5",
                color: "#496b3f",
                textDecoration: "none",
                fontSize: 16,
                fontWeight: 500,
                border: "1px solid #d9e6d0",
                boxSizing: "border-box",
              }}
            >
              {t.apk}
            </Link>
          </div>
        </section>

        <section
          aria-label="产品说明"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 16,
            marginTop: 18,
          }}
        >
          {t.cards.map((card) => (
            <article
              key={card.title}
              style={{
                background: "rgba(255, 255, 255, 0.86)",
                border: "1px solid #e6ecdf",
                borderRadius: 18,
                padding: "18px 18px 20px",
                boxShadow: "0 8px 24px rgba(44, 74, 38, 0.05)",
              }}
            >
              <h2
                style={{
                  margin: "0 0 8px",
                  fontSize: 17,
                  fontWeight: 600,
                  color: "#263326",
                }}
              >
                {card.title}
              </h2>

              <p
                style={{
                  margin: 0,
                  color: "#687468",
                  fontSize: 14.5,
                  lineHeight: 1.75,
                }}
              >
                {card.description}
              </p>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
