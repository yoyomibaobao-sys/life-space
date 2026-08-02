import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = new URL("../", import.meta.url);
const sourceRoots = ["app", "components", "lib"];
const excludedInlineSvg = new Set(["components/ui/AppIcon.tsx"]);
const characterIcons = /[←→⋯🌸🌱🐟🛠🧩★☆]/u;

async function listSourceFiles(relativeDir) {
  const absoluteDir = new URL(`${relativeDir}/`, root);
  const entries = await readdir(absoluteDir);
  const files = [];

  for (const entry of entries) {
    const relativePath = path.posix.join(relativeDir, entry);
    const absolutePath = new URL(relativePath, root);
    const info = await stat(absolutePath);
    if (info.isDirectory()) files.push(...(await listSourceFiles(relativePath)));
    if (info.isFile() && /\.(ts|tsx)$/.test(entry)) files.push(relativePath);
  }

  return files;
}

test("interface icons use the centralized rounded-line SVG system", async () => {
  const files = (await Promise.all(sourceRoots.map(listSourceFiles))).flat();
  const violations = [];

  for (const file of files) {
    const content = await readFile(new URL(file, root), "utf8");
    if (characterIcons.test(content)) violations.push(`${file}: character icon`);
    if (!excludedInlineSvg.has(file) && /<svg\b/.test(content)) {
      violations.push(`${file}: inline svg`);
    }
  }

  assert.deepEqual(violations, []);
});

test("category, avatar, rating, and navigation icons use shared components", async () => {
  const [categories, avatar, rating, plant, navbar] = await Promise.all([
    readFile(new URL("lib/archive-categories.ts", root), "utf8"),
    readFile(new URL("components/social/UserAvatar.tsx", root), "utf8"),
    readFile(new URL("components/ui/RatingStars.tsx", root), "utf8"),
    readFile(new URL("app/plant/page.tsx", root), "utf8"),
    readFile(new URL("components/navbar.tsx", root), "utf8"),
  ]);

  assert.match(categories, /AppIconName/);
  assert.match(categories, /return "tools"|return "fish"|return "puzzle"|return "sprout"/);
  assert.match(avatar, /<AppIcon name="leaf"/);
  assert.match(rating, /<AppIcon[\s\S]*?name="star"/);
  assert.match(plant, /restoreOnReturn: true/);
  assert.doesNotMatch(plant, /rememberSearch\(keyword\);\s*persistSearchState/);
  assert.match(navbar, /<AppIcon name="bell"/);
  assert.match(navbar, /<AppIcon name="more-horizontal"/);
});

test("project cards keep compact record-first information without social counters", async () => {
  const [discover, archive, localView, followed] = await Promise.all([
    readFile(new URL("components/discover/DiscoverProjectCard.tsx", root), "utf8"),
    readFile(new URL("components/archive/ArchiveCard.tsx", root), "utf8"),
    readFile(new URL("components/archive-ui/localArchiveProjectView.ts", root), "utf8"),
    readFile(new URL("components/discover/FollowedProjectCard.tsx", root), "utf8"),
  ]);

  assert.match(discover, /latest_public_record_note/);
  assert.match(discover, /新增了照片/);
  assert.doesNotMatch(discover, /public_comment_count|view_count/);
  assert.match(archive, /新增了照片/);
  assert.match(archive, />无图</);
  assert.doesNotMatch(localView, /浏览 0|关注 0/);
  assert.doesNotMatch(followed, /public_comment_count|条评论/);
});
