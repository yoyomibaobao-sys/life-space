"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const copy = {
  zhCN: {
    brand: "有时·耕作",
    poem: "人生的本质，是一个人的旅行，也是一场修行。",
    intro:
      "有时，记录你的照料、陪伴、滋养与成长，让生命有迹可循。",
    spirit: "种植、农法设施、虫鱼生态与自然生活的长期记录。",
    trialNote: "注册后开始免费试用；未注册可先浏览公开内容。",
    register: "开始记录",
    login: "登录",
    discover: "先浏览发现",
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
        正在进入你的空间...
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
            maxWidth: 720,
            margin: "0 auto",
            textAlign: "center",
            padding: "48px 20px 36px",
          }}
        >
          <div
            style={{
              fontSize: 16,
              color: "#6f7f5f",
              letterSpacing: 2,
              marginBottom: 20,
            }}
          >
            {t.brand}
          </div>

          <h1
            style={{
              fontSize: 34,
              lineHeight: 1.35,
              margin: "0 0 22px",
              fontWeight: 600,
              color: "#1f2a1f",
            }}
          >
            {t.poem}
          </h1>

          <p
            style={{
              maxWidth: 620,
              margin: "0 auto",
              color: "#3f4a3f",
              fontSize: 18,
              lineHeight: 1.9,
            }}
          >
            {t.intro}
          </p>

          <p
            style={{
              marginTop: 18,
              color: "#75816f",
              fontSize: 16,
              lineHeight: 1.8,
            }}
          >
            {t.spirit}
          </p>

          <p
            style={{
              marginTop: 8,
              color: "#8a9584",
              fontSize: 13,
              lineHeight: 1.7,
            }}
          >
            {t.trialNote}
          </p>

          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: 14,
              flexWrap: "wrap",
              marginTop: 34,
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
          </div>
        </section>

        <section
          aria-label="产品说明"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 18,
            marginTop: 24,
          }}
        >
          {t.cards.map((card) => (
            <article
              key={card.title}
              style={{
                background: "rgba(255, 255, 255, 0.86)",
                border: "1px solid #e6ecdf",
                borderRadius: 18,
                padding: 22,
                boxShadow: "0 10px 30px rgba(44, 74, 38, 0.06)",
              }}
            >
              <h2
                style={{
                  margin: "0 0 10px",
                  fontSize: 18,
                  color: "#263326",
                }}
              >
                {card.title}
              </h2>

              <p
                style={{
                  margin: 0,
                  color: "#687468",
                  fontSize: 15,
                  lineHeight: 1.8,
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