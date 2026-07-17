import { supabase } from "@/lib/supabase";

export type CloudTrashKind = "archives" | "records" | "media";
export type CloudTrashItemType = "archive" | "record" | "media";

export type CloudTrashItem = {
  type: CloudTrashItemType;
  id: string;
  title: string;
  parentTitle: string | null;
  deletedAt: string;
  status: "active";
  recordCount: number;
  mediaCount: number;
};

type CloudTrashListResult = {
  ok: boolean;
  items: CloudTrashItem[];
};

async function getAuthHeaders(includeJson = false) {
  const sessionResult = await supabase.auth.getSession();
  const accessToken = sessionResult.data.session?.access_token;
  const headers = new Headers();

  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  if (includeJson) {
    headers.set("Content-Type", "application/json");
  }

  return headers;
}

export async function requestCloudTrash(kind: CloudTrashKind, id: string) {
  try {
    const response = await fetch(`/api/${kind}/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: await getAuthHeaders(),
      credentials: "same-origin",
    });

    if (!response.ok) return false;

    const result = (await response.json()) as {
      ok?: unknown;
      action?: unknown;
    } | null;
    return result?.ok === true && result.action === "trashed";
  } catch {
    return false;
  }
}

export async function fetchCloudTrash(signal?: AbortSignal) {
  try {
    const response = await fetch("/api/trash", {
      method: "GET",
      headers: await getAuthHeaders(),
      credentials: "same-origin",
      cache: "no-store",
      signal,
    });

    if (!response.ok) return { ok: false, items: [] } as CloudTrashListResult;

    const result = (await response.json()) as CloudTrashListResult | null;
    if (!result?.ok || !Array.isArray(result.items)) {
      return { ok: false, items: [] } as CloudTrashListResult;
    }

    return result;
  } catch {
    return { ok: false, items: [] } as CloudTrashListResult;
  }
}

export async function restoreCloudTrashItem(
  type: CloudTrashItemType,
  id: string,
) {
  try {
    const response = await fetch("/api/trash/restore", {
      method: "POST",
      headers: await getAuthHeaders(true),
      credentials: "same-origin",
      body: JSON.stringify({ type, id }),
    });

    if (!response.ok) return false;

    const result = (await response.json()) as {
      ok?: unknown;
      action?: unknown;
    } | null;
    return result?.ok === true && result.action === "restored";
  } catch {
    return false;
  }
}
