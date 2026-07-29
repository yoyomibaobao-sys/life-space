export type SupabaseSchemaError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

function normalizedErrorText(error?: SupabaseSchemaError | null) {
  return [error?.message, error?.details, error?.hint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function isMissingDatabaseColumn(
  error: SupabaseSchemaError | null | undefined,
  tableName: string,
  columnName: string
) {
  const code = String(error?.code || "").toUpperCase();
  const text = normalizedErrorText(error);

  return (
    (code === "PGRST204" || code === "42703") &&
    text.includes(tableName.toLowerCase()) &&
    text.includes(columnName.toLowerCase())
  );
}

export function isMissingDatabaseFunction(
  error: SupabaseSchemaError | null | undefined,
  functionName: string
) {
  const code = String(error?.code || "").toUpperCase();
  const text = normalizedErrorText(error);

  return (
    (code === "PGRST202" || code === "42883") &&
    text.includes(functionName.toLowerCase())
  );
}

export function withoutCapturedAt<T extends { captured_at?: unknown }>(
  row: T
): Omit<T, "captured_at"> {
  const { captured_at, ...legacyRow } = row;
  void captured_at;
  return legacyRow;
}
