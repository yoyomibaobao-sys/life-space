"use client";

import { useSyncExternalStore } from "react";
import { supabase } from "@/lib/supabase";
import {
  clearLocalOwnerExplicitSignOut,
  loadRememberedLocalOwnerContext,
  markLocalOwnerExplicitlySignedOut,
  rememberLocalOwnerContext,
  wasLocalOwnerExplicitlySignedOut,
  type StoredLocalOwnerContext,
} from "@/lib/local-owner-context";
import { clearCloudOfflineCacheOnExplicitLogout } from "@/lib/cloud-offline-cache-session";
import {
  getAndroidConnectivitySnapshot,
  subscribeAndroidConnectivity,
} from "@/lib/android-connectivity";

export type AndroidAuthStatus = "checking" | "signed-out" | "signed-in";

export type AndroidAuthSnapshot = {
  status: AndroidAuthStatus;
  sessionUserId: string | null;
  email: string | null;
  rememberedOwner: StoredLocalOwnerContext | null;
  explicitSignedOut: boolean;
};

type AuthUser = { id: string; email?: string | null };
type AuthSession = { user?: AuthUser | null } | null;
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
  };
  let initialized = false;
  let initialization: Promise<AndroidAuthSnapshot> | null = null;
  let revalidation: Promise<AndroidAuthSnapshot> | null = null;
  let authSubscription: { unsubscribe: () => void } | null = null;
  const listeners = new Set<Listener>();

  function publish(next: AndroidAuthSnapshot) {
    if (
      snapshot.status === next.status &&
      snapshot.sessionUserId === next.sessionUserId &&
      snapshot.email === next.email &&
      snapshot.rememberedOwner?.userId === next.rememberedOwner?.userId &&
      snapshot.rememberedOwner?.email === next.rememberedOwner?.email &&
      snapshot.explicitSignedOut === next.explicitSignedOut
    ) return;
    snapshot = next;
    for (const listener of listeners) listener();
  }

  function publishSignedOut(explicitSignedOut = options.isExplicitlySignedOut()) {
    publish({
      status: "signed-out",
      sessionUserId: null,
      email: null,
      rememberedOwner: options.loadRememberedOwner(),
      explicitSignedOut,
    });
  }

  function acceptUser(user: AuthUser) {
    const owner = { userId: user.id, email: user.email || null };
    options.clearExplicitSignOut();
    options.rememberOwner(owner);
    publish({
      status: "signed-in",
      sessionUserId: user.id,
      email: user.email || null,
      rememberedOwner: owner,
      explicitSignedOut: false,
    });
  }

  async function invalidateConfirmedSession() {
    options.markExplicitlySignedOut();
    publishSignedOut(true);
    await options.client.auth.signOut({ scope: "local" }).catch(() => undefined);
    return snapshot;
  }

  async function revalidate() {
    if (
      snapshot.status !== "signed-in" ||
      !snapshot.sessionUserId ||
      !options.isServiceOnline()
    ) return snapshot;
    if (revalidation) return revalidation;

    const expectedUserId = snapshot.sessionUserId;
    revalidation = options.client.auth.getUser()
      .then(async ({ data, error }) => {
        if (data.user?.id === expectedUserId) {
          acceptUser(data.user);
        } else if (
          isConfirmedInvalidAndroidSession(error) ||
          data.user && data.user.id !== expectedUserId
        ) {
          await invalidateConfirmedSession();
        }
        return snapshot;
      })
      .catch(() => snapshot)
      .finally(() => {
        revalidation = null;
      });
    return revalidation;
  }

  async function initialize() {
    if (initialized) return snapshot;
    if (initialization) return initialization;
    initialization = (async () => {
      const explicitSignedOut = options.isExplicitlySignedOut();
      if (explicitSignedOut) {
        publishSignedOut(true);
        await options.client.auth.signOut({ scope: "local" }).catch(() => undefined);
        initialized = true;
        return snapshot;
      }

      const stored = await options.client.auth.getSession();
      if (stored.error) {
        publishSignedOut(false);
        initialized = true;
        return snapshot;
      }
      const user = stored.data.session?.user || null;
      if (!user?.id) {
        publishSignedOut(false);
        initialized = true;
        return snapshot;
      }

      // A persisted, previously validated session remains authenticated while
      // LifeSpace is unreachable. Network recovery revalidates it in place.
      acceptUser(user);
      initialized = true;
      if (options.isServiceOnline()) await revalidate();
      return snapshot;
    })().finally(() => {
      initialization = null;
    });
    return initialization;
  }

  function startAuthEvents() {
    if (authSubscription) return;
    const {
      data: { subscription },
    } = options.client.auth.onAuthStateChange((event, session) => {
      const user = session?.user || null;
      if (user?.id && (
        event === "SIGNED_IN" ||
        !options.isExplicitlySignedOut() && (
          event === "TOKEN_REFRESHED" ||
          event === "INITIAL_SESSION" ||
          event === "USER_UPDATED"
        )
      )) {
        acceptUser(user);
        return;
      }
      if (event !== "SIGNED_OUT") return;
      if (options.isExplicitlySignedOut() || options.isServiceOnline()) {
        publishSignedOut(options.isExplicitlySignedOut());
      }
      // An offline refresh failure is not evidence that the account signed out.
    });
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
      publish({
        ...snapshot,
        status: "checking",
        sessionUserId: null,
        email: null,
      });
    },
    completeLogin(user: AuthUser) {
      acceptUser(user);
    },
    failLogin() {
      publishSignedOut(options.isExplicitlySignedOut());
    },
    async explicitLogout() {
      const owner = snapshot.sessionUserId
        ? { userId: snapshot.sessionUserId, email: snapshot.email }
        : snapshot.rememberedOwner;
      options.markExplicitlySignedOut();
      publishSignedOut(true);
      await Promise.allSettled([
        options.clearCloudCache(owner, { preserveLocalOwner: true }),
        options.client.auth.signOut({ scope: "local" }),
      ]);
      publishSignedOut(true);
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
  clearCloudCache: clearCloudOfflineCacheOnExplicitLogout,
});

let connectivitySubscribed = false;
function ensureConnectivityRevalidation() {
  if (connectivitySubscribed) return;
  connectivitySubscribed = true;
  let wasOnline = getAndroidConnectivitySnapshot().status === "online";
  subscribeAndroidConnectivity(() => {
    const online = getAndroidConnectivitySnapshot().status === "online";
    if (online && !wasOnline) void androidAuthController.revalidate();
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
    }),
  );
}

export function beginAndroidAuthLogin() {
  androidAuthController.beginLogin();
}

export function completeAndroidAuthLogin(user: AuthUser) {
  androidAuthController.completeLogin(user);
}

export function failAndroidAuthLogin() {
  androidAuthController.failLogin();
}

export function explicitAndroidLogout() {
  return androidAuthController.explicitLogout();
}
