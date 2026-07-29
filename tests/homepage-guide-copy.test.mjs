import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("the homepage uses the confirmed brand copy without a local-record entry", async () => {
  const homepage = await source("app/page.tsx");

  for (const text of [
    "你所照料的、陪伴着的生命",
    "也滋养、成就着彼此",
    "有时，记录这些过程",
    "让生命有迹可循",
    "留其间，守其度",
    "顺其时，共养成",
    "一个围绕耕作展开的生活空间",
  ]) {
    assert.match(homepage, new RegExp(text));
  }

  assert.doesNotMatch(homepage, /href="\/local"/);
  assert.doesNotMatch(homepage, /本地记录/);
  assert.doesNotMatch(homepage, /trialNote|cloudNote/);
});

test("plant navigation and visible plant links consistently use guidance wording", async () => {
  const paths = [
    "components/navbar.tsx",
    "app/plant/page.tsx",
    "app/plant/[id]/page.tsx",
    "app/archive/plans/page.tsx",
    "app/archive/interests/page.tsx",
    "components/archive-ui/ArchiveNewProjectFormShell.tsx",
    "app/local/archive/new/page.tsx",
  ];
  const files = await Promise.all(paths.map(source));

  for (const file of files) {
    assert.doesNotMatch(file, /索引/);
  }

  assert.match(files[0], />\s*指引\s*</);
  assert.match(files[1], /植物指引/);
});

test("local recording is offered only after a network registration or login failure", async () => {
  const [registration, login] = await Promise.all([
    source("app/register/page.tsx"),
    source("app/login/page.tsx"),
  ]);

  assert.match(
    registration,
    /当前网络不稳定，暂时无法注册。你可以先本地记录，稍后再登录绑定账号。/,
  );
  assert.match(
    login,
    /当前网络不稳定，暂时无法登录。你可以先本地记录，稍后再登录绑定账号。/,
  );

  for (const page of [registration, login]) {
    assert.match(page, /setShowLocalFallback\(true\)/);
    assert.match(page, /showLocalFallback \? \(/);
    assert.match(page, /先本地记录/);
    assert.doesNotMatch(page, /先本地使用/);
  }
});
