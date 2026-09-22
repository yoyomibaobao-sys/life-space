import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = fs.readFileSync(
  path.join(process.cwd(), "app/network-test/page.tsx"),
  "utf8",
);

test("network test page compares same-origin access with Supabase Auth without collecting credentials", () => {
  assert.match(source, /\/login\?network_test=1/);
  assert.match(source, /\/auth\/v1\/settings/);
  assert.match(source, /NEXT_PUBLIC_SUPABASE_URL/);
  assert.match(source, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  assert.match(source, /AbortController/);
  assert.match(source, /TIMEOUT_MS = 8000/);
  assert.match(source, /LifeSpace 可达，但 Supabase Auth 不可达/);
  assert.match(source, /页面不会提交账号、密码，也不会修改任何数据/);
  assert.doesNotMatch(source, /type=["']password["']/);
  assert.doesNotMatch(source, /localStorage|sessionStorage/);
});
