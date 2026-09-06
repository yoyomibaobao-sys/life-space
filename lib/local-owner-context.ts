export type StoredLocalOwnerContext = {
  userId: string;
  email?: string | null;
};

export const LOCAL_OWNER_CONTEXT_STORAGE_KEY =
  "lifespace:last-local-owner-context:v1";

function normalizeOwnerContext(
  value?: Partial<StoredLocalOwnerContext> | null,
): StoredLocalOwnerContext | null {
  const userId = String(value?.userId || "").trim();
  if (!userId) return null;

  const email = String(value?.email || "").trim();
  return {
    userId,
    email: email || null,
  };
}

export function rememberLocalOwnerContext(
  value?: Partial<StoredLocalOwnerContext> | null,
) {
  if (typeof window === "undefined") return;
  const normalized = normalizeOwnerContext(value);
  if (!normalized) return;

  window.localStorage.setItem(
    LOCAL_OWNER_CONTEXT_STORAGE_KEY,
    JSON.stringify(normalized),
  );
}

export function loadRememberedLocalOwnerContext(): StoredLocalOwnerContext | null {
  if (typeof window === "undefined") return null;

  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(LOCAL_OWNER_CONTEXT_STORAGE_KEY) || "null",
    ) as Partial<StoredLocalOwnerContext> | null;
    return normalizeOwnerContext(parsed);
  } catch {
    return null;
  }
}

export function clearRememberedLocalOwnerContext() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(LOCAL_OWNER_CONTEXT_STORAGE_KEY);
}
