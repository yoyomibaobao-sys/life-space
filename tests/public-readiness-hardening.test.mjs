import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("private review stays noindex until the launch flag is explicitly enabled", () => {
  const layout = read("app/layout.tsx");
  const robots = read("app/robots.ts");
  const sitemap = read("app/sitemap.ts");
  const env = read(".env.example");

  assert.match(layout, /SEARCH_INDEXING_ENABLED === "true"/);
  assert.match(layout, /index: searchIndexingEnabled/);
  assert.match(robots, /SEARCH_INDEXING_ENABLED !== "true"/);
  assert.match(robots, /disallow: "\/"/);
  assert.match(sitemap, /"\/legal\/privacy"/);
  assert.match(env, /SEARCH_INDEXING_ENABLED=false/);
  assert.match(env, /NEXT_PUBLIC_SITE_URL=https:\/\/life-space-gules\.vercel\.app/);
});

test("public responses include baseline browser security headers", () => {
  const config = read("next.config.ts");

  assert.match(config, /Content-Security-Policy/);
  assert.match(config, /frame-ancestors 'none'/);
  assert.match(config, /X-Content-Type-Options/);
  assert.match(config, /Strict-Transport-Security/);
  assert.match(config, /Permissions-Policy/);
  assert.match(config, /Referrer-Policy/);
  assert.match(config, /X-Robots-Tag/);
  assert.match(config, /noindex, nofollow, noarchive/);
  assert.match(config, /poweredByHeader: false/);
  assert.match(config, /https:\/\/challenges\.cloudflare\.com/);
  assert.match(config, /frame-src 'self'/);
});

test("signed-out visitors can switch language without creating an account", () => {
  const home = read("app/page.tsx");
  const footer = read("components/SiteFooter.tsx");

  assert.match(home, /<LanguageSwitcher compact \/>/);
  assert.match(footer, /<LanguageSwitcher compact \/>/);
});

test("registration requires stronger passwords and versioned separate consent", () => {
  const register = read("app/register/page.tsx");
  const reset = read("app/reset-password/page.tsx");
  const passwordInput = read("components/PasswordInput.tsx");
  const localConfig = read("supabase/config.toml");

  assert.match(register, /const LEGAL_VERSION = "2026-09-01"/);
  assert.match(register, /password\.length < 8/);
  assert.match(register, /acceptedTerms/);
  assert.match(register, /acceptedCrossBorder/);
  assert.match(register, /privacy_notice_accepted: true/);
  assert.match(register, /cross_border_consent: true/);
  assert.match(reset, /nextPassword\.length < 8/);
  assert.match(passwordInput, /minLength=\{minLength\}/);
  assert.match(localConfig, /minimum_password_length = 8/);
  assert.match(localConfig, /enable_confirmations = true/);
  assert.match(localConfig, /secure_password_change = true/);
  assert.match(localConfig, /max_frequency = "60s"/);
});

test("optional Turnstile protection covers public authentication email flows", () => {
  const captcha = read("components/AuthCaptcha.tsx");
  const register = read("app/register/page.tsx");
  const login = read("app/login/page.tsx");
  const checkEmail = read("app/check-email/page.tsx");
  const env = read(".env.example");

  assert.match(captcha, /NEXT_PUBLIC_TURNSTILE_SITE_KEY/);
  assert.match(captcha, /challenges\.cloudflare\.com\/turnstile/);
  assert.match(captcha, /"expired-callback"/);
  assert.match(register, /captchaToken: captchaToken \|\| undefined/);
  assert.match(login, /signInWithPassword\([\s\S]*captchaToken/);
  assert.match(login, /resetPasswordForEmail\([\s\S]*captchaToken/);
  assert.match(checkEmail, /resend\([\s\S]*captchaToken/);
  assert.match(env, /NEXT_PUBLIC_TURNSTILE_SITE_KEY=/);
  assert.doesNotMatch(env, /TURNSTILE_SECRET/);
});

test("the launch runbook keeps indexing and production changes behind final checks", () => {
  const checklist = read("docs/public-launch-checklist.md");

  assert.match(checklist, /SEARCH_INDEXING_ENABLED=false/);
  assert.match(checklist, /隔离数据库 CI 全部通过/);
  assert.match(checklist, /Secret Key 不发到聊天/);
  assert.match(checklist, /最后一步才把生产环境的 `SEARCH_INDEXING_ENABLED` 改为 `true`/);
});

test("legal copy identifies processors, region, and a fixed effective version", () => {
  const legal = read("lib/legal-content.ts");

  assert.match(legal, /2026\/09\/01/);
  assert.match(legal, /Vercel, Inc\./);
  assert.match(legal, /Supabase, Inc\./);
  assert.match(legal, /日本东京/);
  assert.match(legal, /consent separately from agreement to the service terms/);
});

test("database hardening denies anonymous mutations by default", () => {
  const migration = read(
    "supabase/migrations/20260901090000_harden_public_database_privileges.sql",
  );

  assert.match(migration, /revoke insert, update, delete on table/i);
  assert.match(migration, /grant insert on table public\.analytics_events to anon, authenticated/i);
  assert.match(migration, /analytics_events_public_payload_bounds/i);
  assert.match(migration, /octet_length\(metadata::text\) <= 4096/i);
  assert.match(migration, /created_at >= now\(\) - interval '5 minutes'/i);
  assert.match(migration, /and p\.prosecdef/i);
  assert.match(migration, /revoke execute on function %s from public, anon/i);
  assert.match(migration, /grant execute on function public\.can_access_record\(uuid\)/i);
  assert.doesNotMatch(migration, /grant execute on function public\.increment_archive_view_count\(uuid\)[\s\S]*?to anon/i);
  assert.match(migration, /p\.prorettype = 'pg_catalog\.trigger'::regtype/i);
  assert.match(migration, /set search_path = pg_catalog, public/i);
});

test("formal account allocation waits for confirmation and records consent", () => {
  const migration = read(
    "supabase/migrations/20260901091000_finalize_signup_after_email_confirmation.sql",
  );

  assert.match(migration, /create table if not exists public\.account_legal_consents/i);
  assert.match(migration, /cross_border_processing/i);
  assert.match(migration, /signup_legal_consents_required/i);
  assert.match(migration, /if new\.email_confirmed_at is not null then/i);
  assert.match(migration, /after update of email_confirmed_at on auth\.users/i);
  assert.match(migration, /old\.email_confirmed_at is null/i);
  assert.match(migration, /private\.initialize_new_account/i);
});

test("anonymous archive views cannot call the counter mutation", () => {
  const page = read("app/archive/[id]/page.tsx");

  assert.match(
    page,
    /if \(currentUserId && archiveData\.is_public && !isOwnerView\)/,
  );
});
