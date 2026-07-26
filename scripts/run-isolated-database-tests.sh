#!/usr/bin/env bash

set -Eeuo pipefail

readonly project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly project_id="life-space"
readonly maintenance_migration="20260718140000_harden_storage_upload_capacity_refunds.sql"
readonly maintenance_test="supabase/tests/storage_upload_maintenance_window_dynamic.sql"

cd "${project_root}"

for required_command in supabase psql; do
  if ! command -v "${required_command}" >/dev/null 2>&1; then
    echo "Missing required command: ${required_command}" >&2
    exit 1
  fi
done

for required_path in \
  "supabase/config.toml" \
  "supabase/schema.sql" \
  "supabase/migrations" \
  "supabase/tests" \
  "${maintenance_test}"; do
  if [[ ! -e "${required_path}" ]]; then
    echo "Missing required path: ${required_path}" >&2
    exit 1
  fi
done

if supabase status >/dev/null 2>&1; then
  echo "Refusing to replace an already-running local Supabase project." >&2
  exit 1
fi

started_database=false

cleanup() {
  if [[ "${started_database}" == "true" ]]; then
    supabase stop --no-backup --project-id "${project_id}" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT

# The repository uses schema.sql as its historical baseline. Disable the CLI's
# automatic migration and seed pass so the test can restore that baseline first,
# then apply every committed migration in deterministic timestamp order.
SUPABASE_DB_MIGRATIONS_ENABLED=false \
SUPABASE_DB_SEED_ENABLED=false \
  supabase db start
started_database=true

# These are fixed local-only credentials created by the Supabase CLI. The script
# never links a hosted project and never reads repository or organization secrets.
export PGHOST="127.0.0.1"
export PGPORT="54322"
export PGDATABASE="postgres"
export PGUSER="postgres"
export PGPASSWORD="postgres"

readonly -a psql_args=(
  --no-psqlrc
  --quiet
  --set=ON_ERROR_STOP=on
  --set=VERBOSITY=verbose
)

run_sql_file() {
  local sql_file="$1"

  echo "Running ${sql_file}"
  psql "${psql_args[@]}" --file="${sql_file}"
}

run_sql_file "supabase/schema.sql"

maintenance_test_ran=false
while IFS= read -r migration_file; do
  run_sql_file "${migration_file}"

  if [[ "$(basename "${migration_file}")" == "${maintenance_migration}" ]]; then
    run_sql_file "${maintenance_test}"
    maintenance_test_ran=true
  fi
done < <(
  find "supabase/migrations" -maxdepth 1 -type f -name '*.sql' -print |
    LC_ALL=C sort
)

if [[ "${maintenance_test_ran}" != "true" ]]; then
  echo "Did not find the migration required for the maintenance-window test." >&2
  exit 1
fi

while IFS= read -r test_file; do
  if [[ "${test_file}" == "${maintenance_test}" ]]; then
    continue
  fi

  run_sql_file "${test_file}"
done < <(
  find "supabase/tests" -maxdepth 1 -type f -name '*.sql' -print |
    LC_ALL=C sort
)

echo "All isolated database migrations and SQL behavior tests passed."
