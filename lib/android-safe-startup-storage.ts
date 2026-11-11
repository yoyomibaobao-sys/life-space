import { Capacitor, registerPlugin } from "@capacitor/core";
import {
  offlineSessionContinuity, wasLocalOwnerExplicitlySignedOut,
} from "@/lib/local-owner-context";

type Inspection = {
  status?: string;
  persistentStateUnchanged?: boolean;
  ownerMatchesExpected?: boolean;
  sessionMatchesExpected?: boolean;
};

type ReadOnlyKeystore = {
  inspectOfflineOwnerProofReadOnly(input: {
    environment: string;
    ownerId: string;
    sessionId: string;
  }): Promise<Inspection>;
};

const inspector = registerPlugin<ReadOnlyKeystore>("OfflineOwnerKeystore");

export function isNativeAndroidAuthStartup() {
  return typeof window !== "undefined" &&
    Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

/**
 * Android-only Supabase storage. Before the real native read-only proof
 * matches the cached Owner/Session, the SDK MUST NOT receive its persisted
 * refresh token. An unverified cached session remains untouched on disk.
 *
 * New interactive logins are staged only in memory until a server getUser()
 * confirms the same Owner. No website client uses this storage adapter.
 */
export function createAndroidSafeStartupStorage(environment: string) {
  const origin = environment.replace(/\/$/, "");
  const project = new URL(origin).hostname.split(".")[0];
  const authKey = `sb-${project}-auth-token`;
  let trustedCachedSession = false;
  let preflight: Promise<void> | null = null;
  let stagedSession: string | null = null;

  async function inspectOnce() {
    if (preflight) return preflight;
    preflight = (async () => {
      try {
        // An explicit logout persisted by the previous build is not consent
        // to refresh that old account during a subsequent cold start.
        if (wasLocalOwnerExplicitlySignedOut()) return;
        const raw = window.localStorage.getItem(authKey);
        if (!raw || !Capacitor.isPluginAvailable("OfflineOwnerKeystore")) return;
        const hints = offlineSessionContinuity(JSON.parse(raw), origin);
        if (!hints) return;
        const result = await inspector.inspectOfflineOwnerProofReadOnly({
          environment: origin, ownerId: hints.ownerId, sessionId: hints.sessionId,
        });
        trustedCachedSession = result.status === "valid" &&
          result.persistentStateUnchanged === true &&
          result.ownerMatchesExpected === true &&
          result.sessionMatchesExpected === true;
      } catch {
        // Fail closed. Do not remove or overwrite the existing Session/proof.
        trustedCachedSession = false;
      }
    })();
    return preflight;
  }

  return {
    async getItem(key: string) {
      if (key !== authKey) return window.localStorage.getItem(key);
      await inspectOnce();
      return trustedCachedSession
        ? window.localStorage.getItem(key) : stagedSession;
    },
    async setItem(key: string, value: string) {
      if (key !== authKey) { window.localStorage.setItem(key, value); return; }
      await inspectOnce();
      if (trustedCachedSession) window.localStorage.setItem(key, value);
      else stagedSession = value;
    },
    async removeItem(key: string) {
      if (key !== authKey) { window.localStorage.removeItem(key); return; }
      await inspectOnce();
      if (trustedCachedSession) window.localStorage.removeItem(key);
      stagedSession = null;
    },
    async commitVerifiedSession(ownerId: string) {
      await inspectOnce();
      if (trustedCachedSession) return true;
      if (!stagedSession) return false;
      try {
        const payload = JSON.parse(stagedSession) as { user?: { id?: string } };
        if (payload?.user?.id !== ownerId) return false;
        window.localStorage.setItem(authKey, stagedSession);
        stagedSession = null;
        trustedCachedSession = true;
        return true;
      } catch {
        return false;
      }
    },
    async clearOnExplicitLogout() {
      // Only an explicit user action may discard an unverified cached Session.
      await inspectOnce();
      window.localStorage.removeItem(authKey);
      stagedSession = null;
      trustedCachedSession = false;
    },
  };
}
