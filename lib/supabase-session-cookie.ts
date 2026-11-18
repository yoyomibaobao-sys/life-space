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
    getSession(): Promise<{ data: { session: SupabaseCookieSession | null } }>;
  };
}

type CookieSyncActions = {
  sync: (session: SupabaseCookieSession | null | undefined) => Promise<boolean>;
  clear: () => Promise<boolean>;
};

/** Install once beside the web Supabase singleton; never used by native Android. */
export function installSupabaseSessionCookieSync(
  client: AuthStateListenerClient,
  actions: CookieSyncActions = {
    sync: syncSupabaseSessionCookie,
    clear: clearSupabaseSessionCookie,
  },
) {
  if (typeof window === "undefined") return () => undefined;

  let authEventObserved = false;
  const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
    authEventObserved = true;
    if (event === "SIGNED_OUT" || (event === "INITIAL_SESSION" && !session)) {
      void actions.clear();
      return;
    }
    if (session) void actions.sync(session);
  });

  // INITIAL_SESSION normally covers this case. Explicitly read the persisted
  // session as a fallback so an already-open desktop session still receives
  // its SSR cookie mirror if the initial auth event is missed or delayed.
  // Any auth event takes precedence, preventing a late stale read from
  // restoring cookies after sign-out or a newer session transition.
  void client.auth.getSession().then(({ data }) => {
    if (authEventObserved) return;
    if (data.session) void actions.sync(data.session);
    else void actions.clear();
  }).catch(() => undefined);

  return () => subscription.unsubscribe();
}
