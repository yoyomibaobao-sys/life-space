from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"anchor not found: {label}")
    return text.replace(old, new, 1)


# Experience-card archive data includes the plant id so its system name can open the guide.
types_path = Path("lib/experience-card-types.ts")
types = types_path.read_text(encoding="utf-8")
types = replace_once(
    types,
    '''  category: string | null;\n  system_name: string | null;\n''',
    '''  category: string | null;\n  species_id: string | null;\n  system_name: string | null;\n''',
    "experience-card species id type",
)
types_path.write_text(types, encoding="utf-8")

cards_lib_path = Path("lib/experience-cards.ts")
cards_lib = cards_lib_path.read_text(encoding="utf-8")
cards_lib = replace_once(
    cards_lib,
    '''        "id, user_id, title, category, system_name, species_name_snapshot, is_public"\n''',
    '''        "id, user_id, title, category, species_id, system_name, species_name_snapshot, is_public"\n''',
    "experience-card archive select",
)
cards_lib_path.write_text(cards_lib, encoding="utf-8")

# Experience-card title line: project opens the project's record details; system name opens the guide.
detail_path = Path("app/experience-cards/[id]/page.tsx")
detail = detail_path.read_text(encoding="utf-8")
detail = replace_once(
    detail,
    '''  const coverSrc =\n    detail.cover?.display_url || detail.cover?.display_thumb_url || null;\n\n  return (\n''',
    '''  const coverSrc =\n    detail.cover?.display_url || detail.cover?.display_thumb_url || null;\n  const guideHref =\n    detail.archive.category === "plant" && detail.archive.species_id\n      ? `/plant/${detail.archive.species_id}?fromArchive=${encodeURIComponent(\n          detail.archive.id\n        )}`\n      : null;\n\n  return (\n''',
    "experience-card guide href",
)
detail = replace_once(
    detail,
    '''          <p style={projectStyle}>\n            {detail.archive.title} · {systemName}\n          </p>\n''',
    '''          <div style={projectStyle}>\n            <Link\n              href={`/archive/${detail.archive.id}`}\n              style={projectLinkStyle}\n              title="打开项目记录详情"\n            >\n              {detail.archive.title}\n            </Link>\n            <span style={projectDividerStyle}>·</span>\n            {guideHref ? (\n              <Link href={guideHref} style={guideLinkStyle} title="打开指引">\n                {systemName}\n              </Link>\n            ) : (\n              <span>{systemName}</span>\n            )}\n          </div>\n''',
    "experience-card project and guide links",
)
detail = replace_once(
    detail,
    '''const projectStyle: CSSProperties = {\n  margin: 0,\n  color: "#5f6f5c",\n  fontSize: 15,\n  lineHeight: 1.6,\n};\n''',
    '''const projectStyle: CSSProperties = {\n  margin: 0,\n  display: "flex",\n  alignItems: "center",\n  gap: 7,\n  flexWrap: "wrap",\n  color: "#5f6f5c",\n  fontSize: 15,\n  lineHeight: 1.6,\n};\n\nconst projectLinkStyle: CSSProperties = {\n  color: "#3f633d",\n  fontWeight: 800,\n  textDecoration: "none",\n};\n\nconst projectDividerStyle: CSSProperties = {\n  color: "#9aa493",\n};\n\nconst guideLinkStyle: CSSProperties = {\n  color: "#557653",\n  fontWeight: 800,\n  textDecoration: "underline",\n  textUnderlineOffset: 3,\n};\n''',
    "experience-card link styles",
)
detail_path.write_text(detail, encoding="utf-8")

# The timeline itself no longer repeats a source-record link after every record.
timeline_path = Path("components/experience-card/ExperienceCardTimeline.tsx")
timeline = timeline_path.read_text(encoding="utf-8")
timeline = replace_once(timeline, 'import Link from "next/link";\n', "", "timeline Link import")
timeline = replace_once(
    timeline,
    '''\n              <Link\n                href={`/archive/${archive.id}?record=${record.id}`}\n                style={sourceLinkStyle}\n              >\n                查看原记录 →\n              </Link>\n''',
    "",
    "timeline source record link",
)
timeline = replace_once(
    timeline,
    '''\nconst sourceLinkStyle: CSSProperties = {\n  color: "#557653",\n  fontSize: 13,\n  textDecoration: "none",\n  fontWeight: 700,\n};\n''',
    "\n",
    "timeline source link style",
)
timeline_path.write_text(timeline, encoding="utf-8")

# Mobile personal-space first project row becomes a direct archive entry.
profile_path = Path("app/profile/page.tsx")
profile = profile_path.read_text(encoding="utf-8")
profile = replace_once(
    profile,
    '''  return (\n    <div style={mobileProjectStatsCardStyle}>\n      我的项目 {archiveCount} 个 · 公开 {publicArchiveCount} · 仅自己可见 {privateArchiveCount} · 已结束 {endedArchiveCount}\n    </div>\n  );\n}\n''',
    '''  return (\n    <Link href="/archive" style={mobileProjectStatsCardStyle}>\n      <span style={mobileProjectStatsTitleRowStyle}>\n        <strong>项目档案</strong>\n        <strong>{archiveCount} 个 →</strong>\n      </span>\n      <span style={mobileProjectStatsDetailStyle}>\n        公开 {publicArchiveCount} · 仅自己可见 {privateArchiveCount} · 已结束 {endedArchiveCount}\n      </span>\n    </Link>\n  );\n}\n''',
    "mobile project archive entry",
)
profile = replace_once(
    profile,
    '''const mobileProjectStatsCardStyle: CSSProperties = {\n  ...compactStatCardStyle,\n  minHeight: 0,\n  color: "#22301f",\n  fontSize: 13,\n  fontWeight: 800,\n  lineHeight: 1.45,\n};\n''',
    '''const mobileProjectStatsCardStyle: CSSProperties = {\n  ...compactStatCardStyle,\n  minHeight: 0,\n  display: "grid",\n  gap: 4,\n  color: "#22301f",\n  fontSize: 13,\n  fontWeight: 800,\n  lineHeight: 1.45,\n  textDecoration: "none",\n};\n\nconst mobileProjectStatsTitleRowStyle: CSSProperties = {\n  display: "flex",\n  alignItems: "center",\n  justifyContent: "space-between",\n  gap: 10,\n};\n\nconst mobileProjectStatsDetailStyle: CSSProperties = {\n  color: "#74806f",\n  fontSize: 12,\n  fontWeight: 600,\n};\n''',
    "mobile project archive styles",
)
profile_path.write_text(profile, encoding="utf-8")

# Desktop market page relies on the global login/register controls instead of repeating them.
market_path = Path("app/market/page.tsx")
market = market_path.read_text(encoding="utf-8")
market = replace_once(
    market,
    '''          <div style={isMobileViewport ? hiddenMobileHeaderActionStyle : headerActionStyle}>\n            {currentUserId ? (\n              <>\n                <Link href="/market/mine" style={mineButtonStyle}>\n                  我的发布\n                </Link>\n\n                {marketBlocked ? (\n                  <Link\n                    href="/membership"\n                    style={disabledPublishButtonStyle}\n                    title={getCreateMarketPostBlockedText(membership)}\n                  >\n                    发布受限\n                  </Link>\n                ) : (\n                  <Link href="/market/new" style={publishButtonStyle}>\n                    发布信息\n                  </Link>\n                )}\n              </>\n            ) : (\n              <>\n                <Link href="/login" style={mineButtonStyle}>\n                  登录后发布\n                </Link>\n\n                <Link href="/register" style={publishButtonStyle}>\n                  注册账号\n                </Link>\n              </>\n            )}\n          </div>\n''',
    '''          {currentUserId ? (\n            <div style={isMobileViewport ? hiddenMobileHeaderActionStyle : headerActionStyle}>\n              <Link href="/market/mine" style={mineButtonStyle}>\n                我的发布\n              </Link>\n\n              {marketBlocked ? (\n                <Link\n                  href="/membership"\n                  style={disabledPublishButtonStyle}\n                  title={getCreateMarketPostBlockedText(membership)}\n                >\n                  发布受限\n                </Link>\n              ) : (\n                <Link href="/market/new" style={publishButtonStyle}>\n                  发布信息\n                </Link>\n              )}\n            </div>\n          ) : null}\n''',
    "market repeated signed-out actions",
)
market_path.write_text(market, encoding="utf-8")

# Replace the signed-out home with a compact viewport-oriented presentation.
home_path = Path("app/page.tsx")
home_path.write_text(r'''"use client";

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
''', encoding="utf-8")

# Update existing experience-card regression expectations.
test_path = Path("tests/experience-cards.test.mjs")
tests = test_path.read_text(encoding="utf-8")
tests = replace_once(
    tests,
    '''  assert.match(timeline, /查看原记录/);\n  assert.match(timeline, /getExperienceCardStageLabel/);\n''',
    '''  assert.doesNotMatch(timeline, /查看原记录/);\n  assert.match(timeline, /getExperienceCardStageLabel/);\n  assert.match(detail, /href=\{`\\/archive\\/\$\{detail\\.archive\\.id\}`\}/);\n  assert.match(detail, /href=\{guideHref\}/);\n''',
    "experience-card source-link test",
)
test_path.write_text(tests, encoding="utf-8")

# Add focused regression coverage for the remaining layout/navigation changes.
ui_test_path = Path("tests/navigation-and-signed-out-layout.test.mjs")
ui_test_path.write_text(r'''import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("mobile personal space project summary opens the project archive", async () => {
  const profile = await source("app/profile/page.tsx");

  assert.match(profile, /<Link href="\/archive" style=\{mobileProjectStatsCardStyle\}>/);
  assert.match(profile, /<strong>项目档案<\/strong>/);
  assert.match(profile, /公开 \{publicArchiveCount\}/);
});

test("signed-out market does not repeat login and registration actions inside the page", async () => {
  const market = await source("app/market/page.tsx");

  assert.doesNotMatch(market, /登录后发布/);
  assert.doesNotMatch(market, /注册账号/);
  assert.match(market, /\{currentUserId \? \(/);
  assert.match(market, /我的发布/);
});

test("signed-out home uses a compact viewport-oriented layout", async () => {
  const home = await source("app/page.tsx");

  assert.match(home, /minHeight: "calc\(100vh - 70px\)"/);
  assert.match(home, /gridTemplateColumns: "repeat\(4, minmax\(0, 1fr\)\)"/);
  assert.match(home, /@media \(max-height: 720px\)/);
  assert.match(home, /记录四时变化，留下发现、收获与成长/);
  assert.match(home, /其他自然生活相关项目/);
});
''', encoding="utf-8")

agents_path = Path("AGENTS.md")
agents = agents_path.read_text(encoding="utf-8")
rule_block = '''\n## 2026-08-01 体验与导航补充\n\n* 经验卡标题下的“项目名 · 系统名”分别承担导航：项目名打开来源项目记录详情；有系统指引时，系统名打开对应指引。记录时间线下方不再重复显示“查看原记录”。\n* 手机个人空间的首个“项目档案”摘要行应整体可点击，进入我的项目页。\n* 网页未登录时，集市页不重复显示全局导航中已有的登录和注册按钮；未登录首页优先在常见桌面视口内完整展示核心介绍和入口。\n'''
if "## 2026-08-01 体验与导航补充" not in agents:
    agents += rule_block
agents_path.write_text(agents, encoding="utf-8")
