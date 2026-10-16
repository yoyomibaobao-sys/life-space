import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const shell = readFileSync("mobile-offline-src/main.tsx", "utf8");
const panel = readFileSync("components/archive-ui/ArchiveTaxonomyPanel.tsx", "utf8");
const settings = readFileSync("components/profile/ProjectCategorySettingsView.tsx", "utf8");

test("Android local group settings await the SAF write before finishing", () => {
  const begin = shell.indexOf("function OfflineProjectCategorySettings(");
  const end = shell.indexOf("function ArchiveList(", begin);
  assert.ok(begin >= 0);
  const section = end > begin ? shell.slice(begin, end) : shell.slice(begin, begin + 12000);
  assert.match(section, /else await saveLocalArchiveCategoryDepths\(localDepths, ownerUserId\)/);
  assert.doesNotMatch(section, /mutateTaxonomy\(|cachedEntries=|onCreate=|onRename=|onDelete=/);
});

test("Android taxonomy create reports failure rather than silently closing the modal", () => {
  const begin = shell.indexOf("async function mutateWorkspaceTaxonomy(");
  const end = shell.indexOf("const cloudSourceCount", begin);
  assert.ok(begin >= 0 && end > begin);
  const operation = shell.slice(begin, end);
  assert.match(operation, /return true;\s*} catch \(error\) \{\s*showToast\([\s\S]*?return false;/);
  assert.match(panel, /if \(await onCreateSubcategory\?\.\(actionTarget.category, nextName\) === false\) return;/);
  assert.match(panel, /if \(await onCreateGroup\?\.\(nextName\) === false\) return;/);
  assert.match(panel, /if \(await onCreateGroup\?\.\(nextName\) === false\) return;\s*}\s*setActionTarget\(null\);/);
});

test("settings page only edits group depth; workspace retains failed rename and delete drafts", () => {
  assert.match(settings, /onToggleDepth\(category, depth\)/);
  assert.doesNotMatch(settings, /<form|<ConfirmDialog|onCreate|onRename|onDelete|data-taxonomy-level/);
  assert.match(panel, /if \(await handler\(actionTarget.chip, nextName\) !== false\) setActionTarget\(null\)/);
  assert.match(panel, /if \(await handler\(actionTarget.chip\) !== false\) setActionTarget\(null\)/);
});
