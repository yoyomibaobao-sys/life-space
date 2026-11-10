import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const root = path.resolve(import.meta.dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const migration = read("supabase/migrations/20261110032043_r07_remove_membership_market_auto_end.sql");
const rollback = read("supabase/rollbacks/20261110032043_r07_restore_membership_market_auto_end.sql");
const manifest = JSON.parse(read("tests/fixtures/b-r07-market-function-fingerprints.json"));
const md5 = (value) => createHash("md5").update(value).digest("hex");
const targetSql = "update public.market_posts mp set status='ended',ended_at=v_m2_now,updated_at=v_m2_now";

function definitions(source) {
  const pattern = /CREATE OR REPLACE FUNCTION public\.([a-z_][a-z0-9_]*)\([\s\S]*?AS \$function\$([\s\S]*?)\$function\$;/gi;
  const all = new Map();
  for (const match of source.matchAll(pattern)) {
    assert.equal(all.has(match[1]), false, "Duplicate function: " + match[1]);
    all.set(match[1], { sql: match[0], body: match[2] });
  }
  return all;
}
function removeOnlyApprovedStatements(body) {
  const lines = body.split("\n");
  const updated = [];
  let count = 0;
  for (let i = 0; i < lines.length; i += 1) {
    if (!lines[i].includes(targetSql)) {
      updated.push(lines[i]);
      continue;
    }
    let j = i;
    while (j < lines.length && !lines[j].trim().endsWith(";") && j < i + 12) j++;
    assert.ok(j < lines.length && j < i + 12, "Unterminated target UPDATE");
    const snippet = lines.slice(i, j + 1).join("\n");
    for (const s of ["mp.status='active'", "mp.membership_service_ends_at", "mp.published_at"]) {
      assert.ok(snippet.includes(s), "Unexpected SQL targeted for removal: " + s);
    }
    if (updated.at(-1)?.trim() === "-- Close only server-recorded paid publications, never later Free publications.") {
      updated.pop();
    }
    count++;
    i = j;
  }
  return { result: updated.join("\n"), count };
}
function stripLiveGuards(sql) {
  const guards = [...sql.matchAll(/DO \$r07_guard\$[\s\S]*?END \$r07_guard\$;/g)];
  assert.equal(guards.length, 2, "Expected guarded pre/post SQL transaction");
  return sql.replace(/DO \$r07_guard\$[\s\S]*?END \$r07_guard\$;/g, "");
}
async function verifyPgBodies(db, key) {
  const { rows } = await db.query(
    "select p.proname,md5(p.prosrc) as md5,p.prosecdef from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='public' and p.proname=any($1::text[])",
    [manifest.map((x) => x.canonical.match(/^public\.([^(]+)/)[1])]
  );
  assert.equal(rows.length, 17);
  const actual = new Map(rows.map((x) => [x.proname, x]));
  for (const x of manifest) {
    const name = x.canonical.match(/^public\.([^(]+)/)[1];
    assert.equal(actual.get(name)?.md5, x[key], name + " " + key);
    assert.equal(actual.get(name)?.prosecdef, true, name + " SECURITY DEFINER");
  }
}

test("R07 exactly 17 existing functions, 21 expiry-driven Market UPDATEs removed, no other body edits", () => {
  const pre = definitions(rollback);
  const post = definitions(migration);
  assert.equal(manifest.length, 17);
  assert.equal(pre.size, 17);
  assert.equal(post.size, 17);
  let total = 0;
  for (const x of manifest) {
    const name = x.canonical.match(/^public\.([^(]+)/)[1];
    const before = pre.get(name)?.body;
    const after = post.get(name)?.body;
    assert.ok(before && after, "Missing function: " + name);
    assert.equal(md5(before), x.before_md5);
    assert.equal(md5(after), x.after_md5);
    const patched = removeOnlyApprovedStatements(before);
    assert.equal(patched.count, x.removed_update_count);
    assert.equal(patched.result, after, "Unapproved body change for " + name);
    assert.equal(after.includes(targetSql), false);
    total += patched.count;
  }
  assert.equal(total, 21);
});

test("R07 applies without DDL privilege widening and is guarded against mixed/drifted QA", () => {
  assert.match(migration, /v_original_count=17 AND v_patched_count=0/);
  assert.match(migration, /v_original_count=0 AND v_patched_count=17/);
  assert.match(migration, /v_acl IS DISTINCT FROM v.expected_acl/);
  assert.match(migration, /v_secdef IS DISTINCT FROM true/);
  assert.match(migration, /v_owner IS DISTINCT FROM 'postgres'/);
  assert.match(migration, /DO \$r07_guard\$/);
  assert.match(migration, /SET LOCAL lock_timeout = '5s'/);
  assert.match(migration, /migration runner owns the transaction/);
  assert.doesNotMatch(migration, /^COMMIT;\s*$/m, "Migration runner owns transaction");
  assert.match(rollback, /COMMIT;\s*$/);
  assert.doesNotMatch(migration, /^\s*(?:ALTER TABLE|DROP FUNCTION|GRANT|REVOKE|CREATE POLICY|DROP POLICY|CREATE TRIGGER|DROP TRIGGER)\b/gim);
});

test("R07 isolated SQL creates 17 exact postimages and exact rollback restores all original MD5s", async () => {
  const db = new PGlite();
  try {
    await db.exec("create schema if not exists private;create schema if not exists auth;SET check_function_bodies = off;");
    const originals = [...definitions(rollback).values()].map((x) => x.sql).join("\n\n");
    await db.exec(originals);
    await verifyPgBodies(db, "before_md5");
    await db.exec(stripLiveGuards(migration));
    await verifyPgBodies(db, "after_md5");
    await db.exec(stripLiveGuards(migration));
    await verifyPgBodies(db, "after_md5");
    await db.exec(stripLiveGuards(rollback));
    await verifyPgBodies(db, "before_md5");
  } finally {
    await db.close();
  }
});
