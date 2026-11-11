"use client";

import { useSyncExternalStore } from "react";
import {
  supabase, commitVerifiedAndroidStartupSession,
  clearAndroidStartupSessionOnExplicitLogout,
} from "@/lib/supabase";
import {
  clearLocalOwnerExplicitSignOut,
  loadRememberedLocalOwnerContext,
  markLocalOwnerExplicitlySignedOut,
  rememberLocalOwnerContext,
  wasLocalOwnerExplicitlySignedOut,
  readTrustedOfflineOwner,
  sealTrustedOfflineOwner,
  revokeTrustedOfflineOwner,
  type StoredLocalOwnerContext,
} from "@/lib/local-owner-context";
import { clearCloudOfflineCacheOnExplicitLogout } from "@/lib/cloud-offline-cache-session";
import { clearCloudTaxonomySnapshot } from "@/lib/cloud-taxonomy-snapshot";
import {
  getAndroidConnectivitySnapshot,
  subscribeAndroidConnectivity,
} from "@/lib/android-connectivity";

export type AndroidAuthStatus = "checking" | "signed-out" | "signed-in" | "offline-owner-read";
export type AndroidAuthVerification =
  | "initializing" | "verifying" | "service-unavailable"
  | "no-session" | "invalid-session" | "verified" | "offline-owner-read";

export type AndroidAuthSnapshot = {
  status: AndroidAuthStatus;
  /** No private Owner can be inferred from a cached session before getUser succeeds. */
  sessionUserId: string | null;
  email: string | null;
  rememberedOwner: StoredLocalOwnerContext | null;
  explicitSignedOut: boolean;
  verification: AndroidAuthVerification;
  /** Keystore local read grant; never an online session or Plus grant. */
  offlineReadOwner?: StoredLocalOwnerContext | null;
};

export function resolveAuthenticatedOwnerContext<
  T extends { userId?: string | null },
>(
  auth: Pick<AndroidAuthSnapshot, "status" | "sessionUserId">,
  ownerContext: T | null,
) {
  return auth.status === "signed-in" &&
    Boolean(auth.sessionUserId) &&
    ownerContext?.userId === auth.sessionUserId
    ? ownerContext
    : null;
}

/** A local read grant is deliberately separate from resolveAuthenticatedOwnerContext. */
export function resolveAndroidReadOwner(auth: AndroidAuthSnapshot): StoredLocalOwnerContext | null {
  if (auth.explicitSignedOut) return null;
  if (auth.status === "signed-in" && auth.sessionUserId) {
    return { userId: auth.sessionUserId, email: auth.email };
  }
  return auth.status === "offline-owner-read" && auth.verification === "offline-owner-read"
    ? auth.offlineReadOwner || null : null;
}

type AuthUser = { id: string; email?: string | null };
type AuthSession = { user?: AuthUser | null; access_token?: string } | null;
type AuthClient = {
  auth: {
    getSession: () => Promise<{
      data: { session: AuthSession };
      error: unknown;
    }>;
    getUser: () => Promise<{
      data: { user: AuthUser | null };
      error: unknown;
    }>;
    signOut: (options: { scope: "local" }) => Promise<unknown>;
    onAuthStateChange: (
      callback: (event: string, session: AuthSession) => void,
    ) => { data: { subscription: { unsubscribe: () => void } } };
  };
};

type AndroidAuthControllerOptions = {
  client: AuthClient;
  isServiceOnline: () => boolean;
  loadRememberedOwner: () => StoredLocalOwnerContext | null;
  isExplicitlySignedOut: () => boolean;
  rememberOwner: (owner: StoredLocalOwnerContext) => void;
  markExplicitlySignedOut: () => void;
  clearExplicitSignOut: () => void;
  offlineOwner?: {
    read: () => Promise<StoredLocalOwnerContext | null>;
    seal: (owner: StoredLocalOwnerContext, session: AuthSession) => Promise<StoredLocalOwnerContext | null>;
    revoke: () => Promise<void>;
  };
  clearCloudCache: (
    owner: StoredLocalOwnerContext | null,
    options: { preserveLocalOwner: boolean },
  ) => Promise<void>;
};

type Listener = () => void;

export function isConfirmedInvalidAndroidSession(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { status?: unknown; name?: unknown; code?: unknown };
  const status = Number(candidate.status);
  return (
    status === 401 ||
    status === 403 ||
    candidate.name === "AuthSessionMissingError" ||
    candidate.code === "session_not_found" ||
    candidate.code === "refresh_token_not_found"
  );
}

export function createAndroidAuthController(options: AndroidAuthControllerOptions) {
  let snapshot: AndroidAuthSnapshot = {
    status: "checking",
    sessionUserId: null,
    email: null,
    rememberedOwner: options.loadRememberedOwner(),
    explicitSignedOut: options.isExplicitlySignedOut(),
    verification: "initializing",
  };
  let initialized = false;
  let initialization: Promise<AndroidAuthSnapshot> | null = null;
  let revalidation: Promise<AndroidAuthSnapshot> | null = null;
  let revalidationEpoch = -1;
  let pendingSessionUserId: string | null = null;
  let authEpoch = 0;
  let loginInProgress = false;
  let authSubscription: { unsubscribe: () => void } | null = null;
  const listeners = new Set<Listener>();

  function publish(next: AndroidAuthSnapshot) {
    if (
      snapshot.status === next.status &&
      snapshot.sessionUserId === next.sessionUserId &&
      snapshot.email === next.email &&
      snapshot.rememberedOwner?.userId === next.rememberedOwner?.userId &&
      snapshot.rememberedOwner?.email === next.rememberedOwner?.email &&
      snapshot.explicitSignedOut === next.explicitSignedOut &&
      snapshot.verification === next.verification &&
      snapshot.offlineReadOwner?.userId === next.offlineReadOwner?.userId
    ) return;
    snapshot = next;
    for (const listener of listeners) listener();
  }

  function publishChecking(
    verification: "initializing" | "verifying" | "service-unavailable",
  ) {
    publish({
      status: "checking", sessionUserId: null, email: null,
      rememberedOwner: options.loadRememberedOwner(),
      explicitSignedOut: options.isExplicitlySignedOut(), verification,
    });
  }

  function publishSignedOut(
    verification: "no-session" | "invalid-session" = "no-session",
    explicitSignedOut = options.isExplicitlySignedOut(),
  ) {
    authEpoch += 1;
    pendingSessionUserId = null;
    publish({
      status: "signed-out", sessionUserId: null, email: null,
      rememberedOwner: options.loadRememberedOwner(),
      explicitSignedOut, verification,
    });
  }

  async function revokeOfflineOwner() {
    await options.offlineOwner?.revoke().catch(() => undefined);
  }

  async function restoreOfflineOwner(epoch = authEpoch) {
    if (options.isExplicitlySignedOut() || loginInProgress) return snapshot;
    const owner = await options.offlineOwner?.read().catch(() => null);
    if (epoch !== authEpoch || options.isExplicitlySignedOut() || loginInProgress) return snapshot;
    if (owner?.userId) {
      publish({
        status: "offline-owner-read", sessionUserId: null, email: null,
        rememberedOwner: options.loadRememberedOwner(), explicitSignedOut: false,
        verification: "offline-owner-read", offlineReadOwner: owner,
      });
    } else publishChecking("service-unavailable");
    return snapshot;
  }

  async function acceptVerifiedUser(user: AuthUser, epoch: number) {
    const stored = await options.client.auth.getSession();
    if (epoch !== authEpoch || options.isExplicitlySignedOut()) return;
    if (stored.error || stored.data.session?.user?.id !== user.id) {
      if (isConfirmedInvalidAndroidSession(stored.error)) await invalidateConfirmedSession();
      else if (stored.error) await restoreOfflineOwner(epoch);
      else publishChecking("service-unavailable");
      return;
    }
    // Server getUser has authenticated this Owner. Only now may a staged
    // interactive Android Session be persisted for the native seal operation.
    const safeToSeal = await commitVerifiedAndroidStartupSession(user.id);
    try {
      // If an interactive Session could not be committed, the native plugin
      // must not attempt to seal against an older WebView localStorage token.
      if (safeToSeal) await options.offlineOwner?.seal(
        { userId: user.id, email: user.email || null }, stored.data.session,
      );
    } catch (error) {
      if (epoch !== authEpoch || options.isExplicitlySignedOut()) return;
      if ((error as { code?: string })?.code === "OFFLINE_OWNER_AUTH_REJECTED") {
        await invalidateConfirmedSession(); return;
      }
      // Keystore failure never grants offline permission or converts a
      // legitimate online getUser success into a rejected service identity.
    }
    if (epoch === authEpoch && !options.isExplicitlySignedOut()) acceptUser(user);
  }

  function acceptUser(user: AuthUser) {
    authEpoch += 1;
    pendingSessionUserId = null;
    const owner = { userId: user.id, email: user.email || null };
    options.clearExplicitSignOut();
    options.rememberOwner(owner);
    publish({
      status: "signed-in", sessionUserId: user.id, email: user.email || null,
      rememberedOwner: owner, explicitSignedOut: false,
      verification: "verified",
    });
  }

  async function invalidateConfirmedSession() {
    // Lock private access, but preserve proof/generation and pending on an
    // implicit SDK refresh failure or server-rejected Session.
    publishSignedOut("invalid-session", false);
    return snapshot;
  }

  async function revalidate(): Promise<AndroidAuthSnapshot> {
    if (!initialized) return initialize();
    if (options.isExplicitlySignedOut() || loginInProgress ||
        snapshot.status === "signed-out") return snapshot;
    if (revalidation && revalidationEpoch === authEpoch) return revalidation;
    if (!options.isServiceOnline()) {
      return restoreOfflineOwner();
    }

    const epoch = authEpoch;
    revalidationEpoch = epoch;
    const request = (async () => {
      let expectedUserId = pendingSessionUserId ||
        (snapshot.status === "signed-in" ? snapshot.sessionUserId : null);

      if (!expectedUserId) {
        // getSession is only a local credential hint, never authentication.
        try {
          const stored = await options.client.auth.getSession();
          if (epoch !== authEpoch || options.isExplicitlySignedOut()) return snapshot;
          if (stored.error) {
            if (isConfirmedInvalidAndroidSession(stored.error)) {
              return invalidateConfirmedSession();
            }
            return restoreOfflineOwner(epoch);
          }
          expectedUserId = stored.data.session?.user?.id || null;
          if (!expectedUserId) {
            publishSignedOut("no-session", false);
            return snapshot;
          }
          pendingSessionUserId = expectedUserId;
        } catch {
          if (epoch === authEpoch) await restoreOfflineOwner(epoch);
          return snapshot;
        }
      }
      if (snapshot.status !== "signed-in") publishChecking("verifying");

      try {
        // Only the Supabase authenticated getUser response can unlock private
        // cached projects. A cached UID, JWT expiry, or QA Worker health 200 cannot.
        const { data, error } = await options.client.auth.getUser();
        if (epoch !== authEpoch || options.isExplicitlySignedOut()) return snapshot;
        if (data.user?.id === expectedUserId && !error) {
          await acceptVerifiedUser(data.user, epoch);
        } else if (isConfirmedInvalidAndroidSession(error)) {
          await invalidateConfirmedSession();
        } else if (data.user?.id && data.user.id !== expectedUserId) {
          // Identity switched during validation: never publish the old result.
          pendingSessionUserId = data.user.id;
          authEpoch += 1;
          // A mismatch is only evidence of an unsafe context, not an
          // authorization to destroy the previous local proof.
          publishChecking("verifying");
        } else {
          await restoreOfflineOwner(epoch);
        }
      } catch {
        if (epoch === authEpoch) await restoreOfflineOwner(epoch);
      }
      return snapshot;
    })().finally(() => { if (revalidation === request) revalidation = null; });
    revalidation = request;
    return request;
  }

  async function initialize() {
    if (initialized) return snapshot;
    if (initialization) return initialization;
    initialization = (async () => {
      if (options.isExplicitlySignedOut()) {
        // User logout was already handled at explicit user intent. Cold
        // initialization must not repeat its destructive native actions.
        publishSignedOut("no-session", true);
        initialized = true;
        return snapshot;
      }

      const epoch = authEpoch;
      if (!options.isServiceOnline()) {
        await restoreOfflineOwner(epoch);
        initialized = true;
        return snapshot;
      }
      try {
        const stored = await options.client.auth.getSession();
        if (epoch !== authEpoch || options.isExplicitlySignedOut()) {
          initialized = true;
          // INITIAL_SESSION can race getSession. Only a fresh getUser may
          // complete the new identity; don't leave valid sessions stranded.
          if (snapshot.status === "checking" && !loginInProgress &&
              !options.isExplicitlySignedOut() && options.isServiceOnline()) {
            await revalidate();
          }
          return snapshot;
        }
        if (stored.error) {
          if (isConfirmedInvalidAndroidSession(stored.error)) {
            initialized = true;
            return invalidateConfirmedSession();
          }
          await restoreOfflineOwner(epoch);
        } else {
          const user = stored.data.session?.user || null;
          if (!user?.id) {
            publishSignedOut("no-session", false);
          } else {
            pendingSessionUserId = user.id;
            publishChecking(options.isServiceOnline() ? "verifying" : "service-unavailable");
          }
        }
      } catch {
        if (epoch === authEpoch) await restoreOfflineOwner(epoch);
      }
      initialized = true;
      if (snapshot.status === "checking" && options.isServiceOnline()) {
        await revalidate();
      }
      return snapshot;
    })().finally(() => { initialization = null; });
    return initialization;
  }

  function startAuthEvents() {
    if (authSubscription) return;
    const { data: { subscription } } = options.client.auth.onAuthStateChange(
      (event, session) => {
        if (options.isExplicitlySignedOut()) return;
        const user = session?.user || null;
        if (user?.id && (
          event === "SIGNED_IN" || event === "TOKEN_REFRESHED" ||
          event === "INITIAL_SESSION" || event === "USER_UPDATED"
        )) {
          if (snapshot.status !== "signed-in" ||
              snapshot.sessionUserId !== user.id) {
            if (pendingSessionUserId !== user.id) {
              const previousOwner = snapshot.sessionUserId ||
                snapshot.offlineReadOwner?.userId || pendingSessionUserId;
              authEpoch += 1;
              // SDK events are untrusted until server getUser verifies the
              // Owner; never revoke a proof merely from INITIAL_SESSION or
              // a cached UID switch. Access stays in checking until verified.
              void previousOwner;
            }
            pendingSessionUserId = user.id;
            if (!loginInProgress) publishChecking(
              options.isServiceOnline() ? "verifying" : "service-unavailable",
            );
          }
          // Do not call the Supabase client synchronously inside its auth lock.
          if (!loginInProgress) {
            if (options.isServiceOnline()) {
              if (initialized) setTimeout(() => { void revalidate(); }, 0);
            } else setTimeout(() => { void restoreOfflineOwner(); }, 0);
          }
          return;
        }
        if (event !== "SIGNED_OUT") return;
        // A transient SDK refresh failure is not explicit logout. Invalidate
        // trusted UI while online, but preserve local files and retry safely.
        if (!options.isServiceOnline()) { void restoreOfflineOwner(); return; }
        if (snapshot.status === "signed-out") return;
        authEpoch += 1;
        pendingSessionUserId = null;
        publishChecking("service-unavailable");
        if (initialized && options.isServiceOnline()) {
          setTimeout(() => { void revalidate(); }, 0);
        }
      },
    );
    authSubscription = subscription;
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: Listener) {
      listeners.add(listener);
      startAuthEvents();
      void initialize();
      return () => listeners.delete(listener);
    },
    initialize,
    revalidate,
    beginLogin() {
      authEpoch += 1;
      pendingSessionUserId = null;
      loginInProgress = true;
      // A login request alone does not validate the new identity.
      publishChecking("verifying");
    },
    async completeLogin(user: AuthUser) {
      authEpoch += 1;
      loginInProgress = false;
      initialized = true;
      pendingSessionUserId = user.id;
      // A user-initiated login has received a server-issued Session. Allow
      // the *fresh* getUser validation even after a previous explicit logout;
      // do not grant Owner access until that validation succeeds.
      options.clearExplicitSignOut();
      publishChecking("verifying");
      await revalidate();
      if (snapshot.status !== "signed-in" || snapshot.sessionUserId !== user.id) {
        throw new Error("online_identity_not_verified");
      }
      return snapshot;
    },
    failLogin() {
      loginInProgress = false;
      publishSignedOut("no-session");
      // Failed login is not authority to revoke the old proof.
    },
    async explicitLogout() {
      const owner = snapshot.sessionUserId
        ? { userId: snapshot.sessionUserId, email: snapshot.email }
        : snapshot.offlineReadOwner || snapshot.rememberedOwner;
      loginInProgress = false;
      options.markExplicitlySignedOut();
      publishSignedOut("no-session", true);
      await revokeOfflineOwner();
      await clearAndroidStartupSessionOnExplicitLogout();
      await Promise.allSettled([
        options.clearCloudCache(owner, { preserveLocalOwner: true }),
        options.client.auth.signOut({ scope: "local" }),
      ]);
      publishSignedOut("no-session", true);
    },
    dispose() {
      authSubscription?.unsubscribe();
      authSubscription = null;
      listeners.clear();
    },
  };
}

const androidAuthController = createAndroidAuthController({
  client: supabase as unknown as AuthClient,
  isServiceOnline: () => getAndroidConnectivitySnapshot().status === "online",
  loadRememberedOwner: loadRememberedLocalOwnerContext,
  isExplicitlySignedOut: wasLocalOwnerExplicitlySignedOut,
  rememberOwner: rememberLocalOwnerContext,
  markExplicitlySignedOut: markLocalOwnerExplicitlySignedOut,
  clearExplicitSignOut: clearLocalOwnerExplicitSignOut,
  offlineOwner: {
    read: readTrustedOfflineOwner,
    seal: sealTrustedOfflineOwner,
    revoke: revokeTrustedOfflineOwner,
  },
  clearCloudCache: async (owner, options) => {
    await clearCloudOfflineCacheOnExplicitLogout(owner, options);
    if (typeof localStorage !== "undefined") clearCloudTaxonomySnapshot(owner?.userId || null);
  },
});

let connectivitySubscribed = false;
function ensureConnectivityRevalidation() {
  if (connectivitySubscribed) return;
  connectivitySubscribed = true;
  let wasOnline = getAndroidConnectivitySnapshot().status === "online";
  subscribeAndroidConnectivity(() => {
    const online = getAndroidConnectivitySnapshot().status === "online";
    if (online !== wasOnline) void androidAuthController.revalidate();
    wasOnline = online;
  });
}

export function subscribeAndroidAuthState(listener: Listener) {
  ensureConnectivityRevalidation();
  return androidAuthController.subscribe(listener);
}

export function getAndroidAuthSnapshot() {
  return androidAuthController.getSnapshot();
}

export function useAndroidAuthState() {
  return useSyncExternalStore(
    subscribeAndroidAuthState,
    getAndroidAuthSnapshot,
    (): AndroidAuthSnapshot => ({
      status: "checking",
      sessionUserId: null,
      email: null,
      rememberedOwner: null,
      explicitSignedOut: false,
      verification: "initializing",
    }),
  );
}

export function revalidateAndroidAuthSession() {
  return androidAuthController.revalidate();
}

export function beginAndroidAuthLogin() {
  androidAuthController.beginLogin();
}

export function completeAndroidAuthLogin(user: AuthUser) {
  return androidAuthController.completeLogin(user);
}

export function failAndroidAuthLogin() {
  androidAuthController.failLogin();
}

export function explicitAndroidLogout() {
  return androidAuthController.explicitLogout();
}
