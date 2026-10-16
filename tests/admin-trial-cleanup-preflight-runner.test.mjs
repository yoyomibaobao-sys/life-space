import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { transformSync } from "esbuild";

const source = readFileSync(
  new URL("../lib/trial-cleanup-preflight.ts", import.meta.url), "utf8",
);
const transpiled = transformSync(source, { loader: "ts", format: "esm" }).code;
const { runTrialCleanupPreflightReview } = await import(
  "data:text/javascript;base64," + Buffer.from(transpiled).toString("base64"),
);
const id = "f89e4675-502f-4231-a23b-6f27b8ea5a39";
const step = (overrides = {}) => ({
  batch_id: id, checked: 1, ready: 1, skipped_paid: 0,
  deferred_payment: 0, canceled: 0, account_locks_busy: 0,
  remaining_unchecked: 1, execution_enabled: false,
  ...overrides,
});

test("review makes bounded calls with a stable account batch and sums progress", async () => {
  const requests = [];
  const responses = [
    step({ checked: 2, ready: 1, skipped_paid: 1, remaining_unchecked: 2 }),
    step({ checked: 2, ready: 0, deferred_payment: 1, canceled: 1, remaining_unchecked: 0 }),
  ];
  const summary = await runTrialCleanupPreflightReview(async (name, args) => {
    requests.push({ name, args });
    return { data: responses.shift(), error: null };
  }, id, { maxBatches: 15, perBatch: 30 });
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[0], {
    name: "preflight_trial_cloud_cleanup",
    args: { p_batch_id: id, p_limit: 30 },
  });
  assert.deepEqual({ checked: summary.checked, ready: summary.ready,
    skipped: summary.skippedPaid, deferred: summary.deferredPayment,
    canceled: summary.canceled, remaining: summary.remainingUnchecked },
  { checked: 4, ready: 1, skipped: 1, deferred: 1, canceled: 1, remaining: 0 });
  assert.equal(summary.reviewComplete, true);
  assert.equal(summary.executionEnabled, false);
});

test("account payment locks prevent a tight retry loop", async () => {
  let called = 0;
  const result = await runTrialCleanupPreflightReview(async () => {
    called += 1;
    return { data: step({ checked: 0, ready: 0, account_locks_busy: 4, remaining_unchecked: 4 }), error: null };
  }, id);
  assert.equal(called, 1);
  assert.equal(result.stoppedForContention, true);
  assert.equal(result.reviewComplete, false);
  assert.equal(result.locksBusy, 4);
});

test("account batches are bounded but never impose a total selected-account cap", async () => {
  let count = 0;
  const summary = await runTrialCleanupPreflightReview(async (_, args) => {
    assert.equal(args.p_limit, 50);
    count += 1;
    return { data: step({ remaining_unchecked: 100 }), error: null };
  }, id, { maxBatches: 5000, perBatch: 5000 });
  assert.equal(count, 20);
  assert.equal(summary.checked, 20);
  assert.equal(summary.reviewComplete, false);
  assert.equal(summary.remainingUnchecked, 100);
});

test("invalid IDs, errors and unexpected deletion-enabled responses fail closed", async () => {
  await assert.rejects(() => runTrialCleanupPreflightReview(async () => {
    throw new Error("unexpected");
  }, "invalid-id"), /invalid_trial_cleanup_batch_id/);

  await assert.rejects(() => runTrialCleanupPreflightReview(async () =>
    ({ data: null, error: new Error("connection") }), id),
  /trial_cleanup_preflight_rpc_failed/);

  for (const payload of [
    step({ execution_enabled: true }), step({ ready: 2 }),
    step({ checked: -1 }), step({ remaining_unchecked: "0" }),
    step({ batch_id: "f7c61232-e4a9-4b79-b6ee-861a1fd9c0d6" }),
  ]) {
    await assert.rejects(() => runTrialCleanupPreflightReview(async () =>
      ({ data: payload, error: null }), id), /trial_cleanup_preflight_invalid_response/);
  }
});

test("server-only wrapper requires opt-in and cannot be reached from generic maintenance route", () => {
  const wrapper = readFileSync(new URL("../lib/server/trial-cleanup-preflight.ts", import.meta.url), "utf8");
  assert.match(wrapper, /import "server-only"/);
  assert.match(wrapper, /TRIAL_ADMIN_PREFLIGHT_ENABLED !== "true"/);
  assert.match(wrapper, /runTrialCleanupPreflightReview/);
  assert.doesNotMatch(wrapper, /storage\.(from|remove)|delete_archive|delete_media|runStorageDeletionWorker/);
  const maintenance = readFileSync(new URL("../app/api/internal/storage-deletion-worker/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(maintenance, /runTrialCleanupPreflight|preflight_trial_cloud_cleanup/);
});
