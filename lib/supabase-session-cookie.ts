export type SupabaseCookieSession = {
  access_token?: string | null;
  refresh_token?: string | null;
};

type CookieSyncResponse = { ok: boolean };
type CookieSyncFetch = (
  input: string,
  init: RequestInit,
) => Promise<CookieSyncResponse>;

/**
 * Mirrors the already-authenticated browser session into the same-origin
 * Supabase SSR cookie jar used by the Cloudflare R2 image gateway.
 *
 * The browser client remains localStorage-backed (including Android's
 * protected startup storage); only the server-readable cookie copy is added.
 */
export function createSupabaseSessionCookieSync(fetcher: CookieSyncFetch) {
  let queue: Promise<boolean> = Promise.resolve(true);
  let revision = 0;

  function enqueue(method: "POST" | "DELETE", session?: SupabaseCookieSession) {
    const currentRevision = ++revision;
    const operation = queue.catch(() => false).then(async () => {
      // Collapse stale queued writes so the last auth state always wins.
      if (currentRevision !== revision) return false;

      const init: RequestInit = {
        method,
        credentials: "same-origin",
        cache: "no-store",
      };
      if (method === "POST" && session) {
        init.headers = { "Content-Type": "application/json" };
        init.body = JSON.stringify({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        });
      }

      try {
        const response = await fetcher("/api/auth/session", init);
        return response.ok;
      } catch {
        // Auth must remain usable if the optional server-cookie mirror is offline.
        return false;
      }
    });

    queue = operation.catch(() => false);
    return operation;
  }

  return {
    sync(session: SupabaseCookieSession | null | undefined) {
      if (!session?.access_token || !session.refresh_token) {
        return Promise.resolve(false);
      }
      return enqueue("POST", session);
    },
    clear() {
      return enqueue("DELETE");
    },
  };
}

const browserCookieSync = createSupabaseSessionCookieSync((input, init) =>
  fetch(input, init),
);

export function syncSupabaseSessionCookie(session: SupabaseCookieSession | null | undefined) {
  if (typeof window === "undefined") return Promise.resolve(false);
  return browserCookieSync.sync(session);
}

export function clearSupabaseSessionCookie() {
  if (typeof window === "undefined") return Promise.resolve(false);
  return browserCookieSync.clear();
}

type AuthStateListenerClient = {
  auth: {
    onAuthStateChange(
      callback: (event: string, session: SupabaseCookieSession | null) => void,
    ): { data: { subscription: { unsubscribe: () => void } } };
  };
};

/** Install once beside the web Supabase singleton; never used by native Android. */
export function installSupabaseSessionCookieSync(client: AuthStateListenerClient) {
  if (typeof window === "undefined") return () => undefined;

  const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT" || (event === "INITIAL_SESSION" && !session)) {
      void clearSupabaseSessionCookie();
      return;
    }
    if (session) void syncSupabaseSessionCookie(session);
  });

  return () => subscription.unsubscribe();
}
