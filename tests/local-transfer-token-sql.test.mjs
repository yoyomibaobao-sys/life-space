import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync("supabase/migrations/20261006113000_local_archive_transfer_token.sql", "utf8");
const userA = "a28ce2ab-1300-4f1d-94f0-2d032b0a0901";
const userB = "b28ce2ab-1300-4f1d-94f0-2d032b0a0902";
const token = "d28ce2ab-1300-4f1d-94f0-2d032b0a0903";
const id = "e28ce2ab-1300-4f1d-94f0-2d032b0a0904";

test("archive transfer migration is additive, nullable and enforces per-user token uniqueness", async () => {
  const db = new PGlite();
  try {
    await db.exec("create table public.archives (id uuid primary key, user_id uuid, title text not null)");
    await db.query("insert into public.archives (id,user_id,title) values ($1,$2,$3)",
      ["f28ce2ab-1300-4f1d-94f0-2d032b0a0905", userA, "preexisting ordinary project"]);
    await db.exec(migration);
    const column = await db.query(`select a.attnotnull, pg_get_expr(d.adbin,d.adrelid) as default_value
      from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
      where a.attrelid='public.archives'::regclass and a.attname='local_transfer_token'`);
    assert.deepEqual(column.rows, [{ attnotnull: false, default_value: null }]);
    const index = await db.query(`select indexdef from pg_indexes
      where tablename='archives' and indexname='archives_user_local_transfer_token_unique'`);
    assert.match(index.rows[0].indexdef,
      /UNIQUE INDEX.+\(user_id, local_transfer_token\) WHERE \(local_transfer_token IS NOT NULL\)/);
    const old = await db.query("select local_transfer_token from public.archives where title=$1",
      ["preexisting ordinary project"]);
    assert.equal(old.rows[0].local_transfer_token, null);
    await db.query("insert into public.archives (id,user_id,title,local_transfer_token) values ($1,$2,$3,$4)",
      [id, userA, "prepared transfer", token]);
    await assert.rejects(db.query(
      "insert into public.archives (id,user_id,title,local_transfer_token) values ($1,$2,$3,$4)",
      ["f28ce2ab-1300-4f1d-94f0-2d032b0a0906", userA, "duplicate token", token]),
    /duplicate key|unique constraint/i);
    await assert.rejects(db.query(
      "insert into public.archives (id,user_id,title,local_transfer_token) values ($1,$2,$3,$4)",
      [id, userB, "duplicate ID", "f28ce2ab-1300-4f1d-94f0-2d032b0a0907"]),
    /duplicate key|unique constraint/i);
    await db.query("insert into public.archives (id,user_id,title,local_transfer_token) values ($1,$2,$3,$4)",
      ["f28ce2ab-1300-4f1d-94f0-2d032b0a0908", userB, "other account", token]);
    await db.query("insert into public.archives (id,user_id,title) values ($1,$2,$3),($4,$2,$5)",
      ["f28ce2ab-1300-4f1d-94f0-2d032b0a0909", userA, "ordinary one",
        "f28ce2ab-1300-4f1d-94f0-2d032b0a0910", "ordinary two"]);
    const ordinary = await db.query("select count(*)::int as n from public.archives where user_id=$1 and local_transfer_token is null", [userA]);
    assert.equal(ordinary.rows[0].n, 3);
    // Review the inverse DDL inside a rollback, without erasing committed test rows.
    await db.exec("begin; drop index public.archives_user_local_transfer_token_unique; alter table public.archives drop column local_transfer_token; rollback;");
    const afterRollback = await db.query("select count(*)::int as n from public.archives where user_id=$1 and local_transfer_token=$2", [userA, token]);
    assert.equal(afterRollback.rows[0].n, 1);
  } finally { await db.close(); }
});
