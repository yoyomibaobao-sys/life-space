import { supabase } from "@/lib/supabase";

export type CloudTrashKind = "archives" | "records" | "media";
export type CloudTrashItemType = "archive" | "record" | "media";
export type CloudTrashItemStatus = "active" | "purging" | "failed";

export type CloudTrashItem = {
  trashEntryId: string;
  type: CloudTrashItemType;
  id: string;
  title: string;
  parentTitle: string | null;
  deletedAt: string;
  status: CloudTrashItemStatus;
  recordCount: number;
  mediaCount: number;
  canRetry: boolean;
};

type CloudTrashListResult = {
  ok: boolean;
  items: CloudTrashItem[];
};

export type CloudTrashMutationResult = {
  ok: boolean;
  status: number;
  error: string | null;
};

export type EmptyCloudTrashResult = CloudTrashMutationResult & {
  action: "empty" | "emptying" | null;
  accepted: number;
  alreadyProcessing: number;
  failed: number;
  morePending: boolean;
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

async function requestTrashEntryMutation(
  path: "/api/trash/purge" | "/api/trash/retry",
  trashEntryId: string,
): Promise<CloudTrashMutationResult> {
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: await getAuthHeaders(true),
      credentials: "same-origin",
      body: JSON.stringify({ trashEntryId }),
    });
    const result = (await response.json().catch(() => null)) as {
      ok?: unknown;
      error?: unknown;
    } | null;

    return {
      ok: response.ok && result?.ok === true,
      status: response.status,
      error: typeof result?.error === "string" ? result.error : null,
    };
  } catch {
    return { ok: false, status: 0, error: "network_error" };
  }
}

export function purgeCloudTrashItem(trashEntryId: string) {
  return requestTrashEntryMutation("/api/trash/purge", trashEntryId);
}

export function retryCloudTrashItem(trashEntryId: string) {
  return requestTrashEntryMutation("/api/trash/retry", trashEntryId);
}

export async function emptyCloudTrash(): Promise<EmptyCloudTrashResult> {
  try {
    const response = await fetch("/api/trash/empty", {
      method: "POST",
      headers: await getAuthHeaders(true),
      credentials: "same-origin",
      body: JSON.stringify({}),
    });
    const result = (await response.json().catch(() => null)) as {
      ok?: unknown;
      action?: unknown;
      accepted?: unknown;
      alreadyProcessing?: unknown;
      failed?: unknown;
      morePending?: unknown;
      error?: unknown;
    } | null;

    return {
      ok: response.ok && result?.ok === true,
      status: response.status,
      action:
        result?.action === "empty" || result?.action === "emptying"
          ? result.action
          : null,
      accepted: Math.max(0, Number(result?.accepted) || 0),
      alreadyProcessing: Math.max(0, Number(result?.alreadyProcessing) || 0),
      failed: Math.max(0, Number(result?.failed) || 0),
      morePending: result?.morePending === true,
      error: typeof result?.error === "string" ? result.error : null,
    };
  } catch {
    return {
      ok: false,
      status: 0,
      action: null,
      accepted: 0,
      alreadyProcessing: 0,
      failed: 0,
      morePending: false,
      error: "network_error",
    };
  }
}
