import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { displayedArchiveRecordCount } from "../lib/archive-record-count.ts";

test("a visitor sees the public record count while the owner keeps the stored total", () => {
  assert.equal(displayedArchiveRecordCount({
    viewer: "visitor",
    storedCount: 3,
    visibleCount: 2,
  }), 2);
  assert.equal(displayedArchiveRecordCount({
    viewer: "owner",
    storedCount: 3,
    visibleCount: 3,
  }), 3);
  assert.equal(displayedArchiveRecordCount({
    viewer: "owner",
    storedCount: 3,
    visibleCount: 2,
  }), 3);
});

test("public project headers use the visible record count", () => {
  const viewer = fs.readFileSync("components/archive-ui/ReadonlyPublicProjectDetail.tsx", "utf8");
  const archivePage = fs.readFileSync("app/archive/[id]/page.tsx", "utf8");
  assert.match(viewer, /viewer: "visitor"/);
  assert.match(viewer, /visibleCount: records\.length/);
  assert.doesNotMatch(viewer, /archive\.record_count \|\| records\.length/);
  assert.match(archivePage, /viewer: isOwner \? "owner" : "visitor"/);
  assert.doesNotMatch(archivePage, /recordCount=\{activeArchive\.record_count \|\| records\.length/);
});
