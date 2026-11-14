import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../app/admin/support/page.tsx", import.meta.url), "utf8");
const types = readFileSync(new URL("../lib/support-submissions.ts", import.meta.url), "utf8");

test("144 R04 action_taken uses only the actionable submission, never the historical representative", () => {
  assert.match(types, /representative_id: string;\s*actionable_submission_id: string \| null;/);
  assert.match(page, /await moderateRecord\("hide", group\.actionable_submission_id\)/);
  assert.doesNotMatch(page, /await moderateRecord\("hide", group\.representative_id\)/);
  assert.match(page, /p_submission_id: group\.representative_id, p_status: nextStatus/);
  assert.match(page, /disabled=\{saving \|\| !resolution \|\| \(resolution === "action_taken" && !canTakeReportAction\)\}/);
  const guard = page.indexOf('resolution === "action_taken" && !canTakeReportAction');
  const confirm = page.indexOf("window.confirm(copy.confirmGroup)");
  const send = page.indexOf('await moderateRecord("hide", group.actionable_submission_id)');
  assert.ok(guard > 0 && guard < confirm && confirm < send);
});

test("144 R04 moderation action guard fails closed for invalid target and unsafe UI states", () => {
  const match = page.match(/const canTakeReportAction\s*=\s*([\s\S]*?);/);
  assert.ok(match);
  const allowed = new Function("status", "group", "moderation", "moderationLoadFailed",
    "detailError", "loading", "details", "moderationReasonCode",
    `return (${match[1]});`);
  const valid = {
    status: "open", group: { target_type: "record", actionable_submission_id: "144" },
    moderation: { version: 0 }, moderationLoadFailed: false,
    detailError: false, loading: false, details: [{ id: "144" }],
    moderationReasonCode: "other_severe",
  };
  const result = (x) => allowed(x.status, x.group, x.moderation, x.moderationLoadFailed,
    x.detailError, x.loading, x.details, x.moderationReasonCode);
  assert.equal(result(valid), true);
  for (const invalid of [
    { group: { ...valid.group, actionable_submission_id: null } },
    { group: { ...valid.group, target_type: "archive" } },
    { status: "resolved" }, { moderation: null }, { moderationLoadFailed: true },
    { detailError: true }, { loading: true }, { details: [] },
    { moderationReasonCode: "" },
  ]) assert.equal(result({ ...valid, ...invalid }), false);
});
