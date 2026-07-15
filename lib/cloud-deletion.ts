import { supabase } from "@/lib/supabase";

type CloudDeletionKind = "records" | "media";

export async function requestCloudDeletion(
  kind: CloudDeletionKind,
  id: string
) {
  const sessionResult = await supabase.auth.getSession();
  const accessToken = sessionResult.data.session?.access_token;
  const headers = new Headers();

  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  try {
    const response = await fetch(`/api/${kind}/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers,
      credentials: "same-origin",
    });

    if (!response.ok) return false;

    const result = (await response.json()) as { ok?: unknown } | null;
    return result?.ok === true;
  } catch {
    return false;
  }
}
