import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const route = fs.readFileSync("app/local/archive/new/page.tsx", "utf8");

test("legacy local-create URLs redirect to cloud creation and preserve query context", () => {
  assert.match(route, /router\.replace\("\/archive\/new" \+ window\.location\.search\)/);
  assert.doesNotMatch(route, /createLocalArchive|createLocalRecord|ArchiveNewProjectFormShell/);
});
