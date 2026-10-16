import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrations = path.join(root, "supabase", "migrations");
const script = readFileSync(
  path.join(root, "scripts", "run-isolated-database-tests.sh"), "utf8",
);
const frozen = [
  "20261010120000_cloud_trial_early_end.sql",
  "20261011150000_maintenance_run_audit.sql",
  "20261011160000_maintenance_run_partial_counts.sql",
  "20261012230036_manual_trial_cloud_cleanup.sql",
  "20261013000650_trial_cleanup_preview.sql",
  "20261013005152_trial_cleanup_job_provenance.sql",
  "20261013120000_trial_cleanup_execution_fence.sql",
  "20261013143000_trial_cleanup_capture_reference_fence.sql",
  "20261013160000_trial_cleanup_path_hold.sql",
  "20261013170000_trial_cleanup_restore_conflict.sql",
  "20261013180000_trial_cleanup_restore_claim.sql",
];

test("isolated CI skips every frozen PR95 migration before SQL execution", () => {
  const start = script.indexOf("maintenance_test_ran=false");
  const end = script.indexOf("  esac", start);
  assert.ok(start >= 0 && end > start, "migration skip guard must exist");
  const guard = script.slice(start, end);
  for (const name of frozen) {
    assert.ok(readdirSync(migrations).includes(name), `missing frozen source: ${name}`);
    assert.ok(guard.includes(name), `CI would run frozen migration: ${name}`);
  }
  assert.match(guard, /Skipping frozen PR #95 migration/);
  assert.match(guard, /continue/);
  assert.ok(
    script.indexOf('run_sql_file "${migration_file}"', end) > end,
    "SQL execution must follow the frozen-migration skip guard",
  );
  assert.match(
    readFileSync(path.join(migrations, frozen[3]), "utf8"),
    /trial_manual_cleanup_migration_incomplete/,
    "the actual migration execution guard must remain unchanged",
  );
});
