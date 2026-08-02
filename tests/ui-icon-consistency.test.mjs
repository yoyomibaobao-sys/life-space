import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repositoryRoot = process.cwd();
const uiRoots = ["app", "components"];
const canonicalIconFile = path.join("components", "ui", "UiIcon.tsx");

function collectTsxFiles(relativeDirectory) {
  const absoluteDirectory = path.join(repositoryRoot, relativeDirectory);
  const files = [];

  for (const entry of readdirSync(absoluteDirectory, { withFileTypes: true })) {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTsxFiles(relativePath));
    } else if (entry.isFile() && entry.name.endsWith(".tsx")) {
      files.push(relativePath);
    }
  }

  return files;
}

test("interactive UI uses the shared SVG icon language", () => {
  const files = uiRoots.flatMap(collectTsxFiles);
  const forbiddenGlyphs = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}←→＋×‹›]/u;
  const glyphViolations = [];
  const rawSvgViolations = [];

  for (const file of files) {
    const source = readFileSync(path.join(repositoryRoot, file), "utf8");
    if (forbiddenGlyphs.test(source)) glyphViolations.push(file);
    if (file !== canonicalIconFile && source.includes("<svg")) {
      rawSvgViolations.push(file);
    }
  }

  assert.deepEqual(
    glyphViolations,
    [],
    `replace platform-dependent glyphs with UiIcon in: ${glyphViolations.join(", ")}`,
  );
  assert.deepEqual(
    rawSvgViolations,
    [],
    `add reusable SVG artwork to UiIcon instead of embedding it in: ${rawSvgViolations.join(", ")}`,
  );
});

test("archive categories expose shared icon names instead of emoji", () => {
  const source = readFileSync(
    path.join(repositoryRoot, "lib", "archive-categories.ts"),
    "utf8",
  );

  assert.match(source, /value === "system"\) return "wrench"/);
  assert.match(source, /value === "insect_fish"\) return "fish"/);
  assert.match(source, /value === "other"\) return "shapes"/);
  assert.match(source, /return "sprout"/);
});
