"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const copy = {
  zhCN: {
    brand: "有时·耕作",
    poem: "好雨知时节，当春乃发生",
    intro:
      "在这里，你可以记录所有正在被你持续照顾的植物，让生命有迹可循。",
    spirit: "留其间，守其度，顺其时，共养成。",
    register: "注册",
    login: "登录",
    discover: "先看看其他人",
    cards: [
      {
        title: "记录正在照顾的植物",
        description:
          "把每一盆植物、每一块地、每一个种植计划，慢慢整理成自己的空间。",
      },
      {
        title: "留下变化的过程",
        description:
          "发芽、长叶、修剪、开花、失败和重新开始，都可以被安静地保存。",
      },
      {
        title: "以个人空间为主",
        description:
          "你可以独自记录，也可以公开一部分过程，让别人看见你的照顾与等待。",
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
              fontSize: 14,
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