from pathlib import Path


home_path = Path("app/page.tsx")
home = home_path.read_text(encoding="utf-8")

old_copy = '''    brand: "有时·耕作",
    poem:
      "你所照料的、陪伴着的生命，\\n也滋养、成就着彼此。\\n\\n有时，记录这些过程，\\n让生命有迹可循。",
    spirit: "留其间，守其度，\\n顺其时，共养成。",
    subtitle: "一个围绕耕作展开的生活空间。",
'''
new_copy = '''    brand: "有时·耕作",
    englishBrand: "LifeSpace",
    spaceTitle: "自然生活空间",
    subtitle: "一个围绕耕作、生态与自然生活展开的空间。",
    poem:
      "记录四时变化，\\n留下发现、收获与成长，\\n让生命被看见，\\n让生活有迹可循。",
    spirit: "留其间，守其度，\\n顺其时，共生长。",
'''
if home.count(old_copy) != 1:
    raise SystemExit("homepage copy block did not match exactly once")
home = home.replace(old_copy, new_copy, 1)

hero_start = home.index("          <h1\n")
buttons_marker = '''          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: 12,
              flexWrap: "wrap",
              marginTop: 30,
            }}
          >
'''
hero_end = home.index(buttons_marker, hero_start)
new_hero = '''          <h1
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

'''
home = home[:hero_start] + new_hero + home[hero_end:]
home_path.write_text(home, encoding="utf-8")

navbar_path = Path("components/navbar.tsx")
navbar = navbar_path.read_text(encoding="utf-8")
old_desktop_order = '''          <NavItem href="/market" active={isActive("/market")}>
            集市
          </NavItem>

          <NavItem href="/plant" active={isActive("/plant")}>
            指引
          </NavItem>
'''
new_desktop_order = '''          <NavItem href="/plant" active={isActive("/plant")}>
            指引
          </NavItem>

          <NavItem href="/market" active={isActive("/market")}>
            集市
          </NavItem>
'''
if navbar.count(old_desktop_order) != 1:
    raise SystemExit("desktop market/guide navigation block did not match exactly once")
navbar_path.write_text(
    navbar.replace(old_desktop_order, new_desktop_order, 1),
    encoding="utf-8",
)

old_other = "其他耕作相关项目"
new_other = "其他自然生活相关项目"
replacement_count = 0
allowed_suffixes = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".md", ".json"}
for path in Path(".").rglob("*"):
    if not path.is_file() or ".git" in path.parts or path.suffix not in allowed_suffixes:
        continue
    text = path.read_text(encoding="utf-8")
    count = text.count(old_other)
    if not count:
        continue
    path.write_text(text.replace(old_other, new_other), encoding="utf-8")
    replacement_count += count
if replacement_count < 2:
    raise SystemExit(
        f"expected at least two other-category copy replacements, got {replacement_count}"
    )

test_path = Path("tests/homepage-guide-copy.test.mjs")
tests = test_path.read_text(encoding="utf-8")
first_start = tests.index(
    'test("the homepage uses the confirmed brand copy without a local-record entry"'
)
next_test = tests.index(
    '\ntest("plant navigation and visible plant links consistently use guidance wording"',
    first_start,
)
new_first_test = '''test("the homepage uses the confirmed natural-life-space copy without a local-record entry", async () => {
  const homepage = await source("app/page.tsx");

  for (const text of [
    "有时·耕作",
    "LifeSpace",
    "自然生活空间",
    "一个围绕耕作、生态与自然生活展开的空间",
    "记录四时变化",
    "留下发现、收获与成长",
    "让生命被看见",
    "让生活有迹可循",
    "留其间，守其度",
    "顺其时，共生长",
  ]) {
    assert.match(homepage, new RegExp(text));
  }

  assert.doesNotMatch(homepage, /你所照料的、陪伴着的生命/);
  assert.doesNotMatch(homepage, /顺其时，共养成/);
  assert.doesNotMatch(homepage, /一个围绕耕作展开的生活空间/);
  assert.doesNotMatch(homepage, /href="\\/local"/);
  assert.doesNotMatch(homepage, /本地记录/);
  assert.doesNotMatch(homepage, /trialNote|cloudNote/);
});
'''
tests = tests[:first_start] + new_first_test + tests[next_test:]

insert_marker = (
    'test("local recording is offered only after a network registration or login failure"'
)
insert_at = tests.index(insert_marker)
extra_tests = '''test("other project copy consistently refers to natural life", async () => {
  const [homepage, categories] = await Promise.all([
    source("app/page.tsx"),
    source("lib/archive-categories.ts"),
  ]);

  for (const file of [homepage, categories]) {
    assert.match(file, /其他自然生活相关项目/);
    assert.doesNotMatch(file, /其他耕作相关项目/);
  }
});

test("desktop navigation places guidance before marketplace without changing mobile order", async () => {
  const navbar = await source("components/navbar.tsx");
  const desktopStart = navbar.indexOf("<div style={getNavItemsWrapStyle(isCompact)}>");
  const mobileStart = navbar.indexOf("function MobileBottomNav");
  const desktopNav = navbar.slice(desktopStart, mobileStart);
  const mobileNav = navbar.slice(mobileStart);

  assert.ok(desktopStart >= 0 && mobileStart > desktopStart);
  assert.ok(desktopNav.indexOf('href="/plant"') < desktopNav.indexOf('href="/market"'));
  assert.ok(mobileNav.indexOf('label: "集市"') < mobileNav.indexOf('label: "指引"'));
});

'''
tests = tests[:insert_at] + extra_tests + tests[insert_at:]
test_path.write_text(tests, encoding="utf-8")
