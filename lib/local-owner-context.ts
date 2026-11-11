import { Capacitor, registerPlugin } from "@capacitor/core";

export type StoredLocalOwnerContext = {
  userId: string;
  email?: string | null;
};

export const LOCAL_OWNER_CONTEXT_STORAGE_KEY =
  "lifespace:last-local-owner-context:v1";

const EXPLICIT_LOCAL_SIGN_OUT_KEY = "lifespace:local-owner-signed-out:v1";

export function wasLocalOwnerExplicitlySignedOut() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(EXPLICIT_LOCAL_SIGN_OUT_KEY) === "1";
}

export function markLocalOwnerExplicitlySignedOut() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(EXPLICIT_LOCAL_SIGN_OUT_KEY, "1");
}

export function clearLocalOwnerExplicitSignOut() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(EXPLICIT_LOCAL_SIGN_OUT_KEY);
}

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
  clearLocalOwnerExplicitSignOut();
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
  markLocalOwnerExplicitlySignedOut();
}

/** Device-bound proof only. This metadata never authenticates a cloud request. */
type OfflineOwnerKeystore = {
  sealAfterVerifiedOnlineAuth(input: {
    environment: string; ownerId: string; sessionId: string;
    publishableKey: string;
  }): Promise<{ userId?: string }>;
  readAndVerifyOfflineOwner(input: {
    environment: string; ownerId: string; sessionId: string;
  }): Promise<{ userId?: string }>;
  inspectOfflineOwnerProofReadOnly(input: {
    environment: string; ownerId: string; sessionId: string;
  }): Promise<{
    status?: string; persistentStateUnchanged?: boolean;
    ownerMatchesExpected?: boolean; sessionMatchesExpected?: boolean;
  }>;
  revokeOfflineOwner(): Promise<void>;
};
const offlineOwnerKeystore = registerPlugin<OfflineOwnerKeystore>("OfflineOwnerKeystore");
const QA_AUTH_ORIGIN = "https://mablwxlipcgbmbnfdbkc.supabase.co";
const PROD_AUTH_ORIGIN = "https://eidltoikfpnrzxruvawf.supabase.co";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let offlineProofEpoch = 0;
let offlineRevocation: Promise<void> = Promise.resolve();

function nativeOfflineOwnerAvailable() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android" &&
    Capacitor.isPluginAvailable("OfflineOwnerKeystore");
}

function offlineAuthEnvironment() {
  const origin = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  return origin === QA_AUTH_ORIGIN || origin === PROD_AUTH_ORIGIN ? origin : null;
}

/** The SDK's cached JWT supplies continuity hints, not trusted identity or expiry.
 * Only the Keystore proof / native authenticated GET can grant offline reading.
 */
export function offlineSessionContinuity(value: unknown, environment: string) {
  try {
    const session = value as { access_token?: string; user?: { id?: string } };
    const token = session?.access_token || "";
    const parts = token.split(".");
    if (parts.length !== 3 || token.length > 16384) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    const ownerId = session?.user?.id || "";
    if (!UUID.test(ownerId) || !UUID.test(payload.session_id || "") ||
        payload.sub !== ownerId || payload.iss !== environment + "/auth/v1" ||
        payload.role !== "authenticated") return null;
    return { ownerId, sessionId: String(payload.session_id) };
  } catch { return null; }
}

function cachedOfflineSession(environment: string) {
  if (typeof window === "undefined") return null;
  try {
    const ref = new URL(environment).hostname.split(".")[0];
    return offlineSessionContinuity(JSON.parse(
      window.localStorage.getItem(`sb-${ref}-auth-token`) || "null",
    ), environment);
  } catch { return null; }
}

export async function revokeTrustedOfflineOwner() {
  offlineProofEpoch += 1;
  if (!nativeOfflineOwnerAvailable()) return;
  // Serialize revocations before another seal/read. Native generation fencing
  // also rejects requests that had already started before this revocation.
  offlineRevocation = offlineRevocation.catch(() => undefined)
    .then(() => offlineOwnerKeystore.revokeOfflineOwner());
  await offlineRevocation;
}

export async function readTrustedOfflineOwner(): Promise<StoredLocalOwnerContext | null> {
  if (!nativeOfflineOwnerAvailable() || wasLocalOwnerExplicitlySignedOut()) return null;
  const epoch = offlineProofEpoch, environment = offlineAuthEnvironment();
  const continuity = environment ? cachedOfflineSession(environment) : null;
  // Missing/expired SDK hints must never destroy an existing device proof.
  if (!environment || !continuity) return null;
  try {
    await offlineRevocation;
    const result = await offlineOwnerKeystore.inspectOfflineOwnerProofReadOnly({
      environment, ownerId: continuity.ownerId, sessionId: continuity.sessionId,
    });
    // Recheck current SDK hints after the asynchronous bridge response.
    const current = cachedOfflineSession(environment);
    return epoch === offlineProofEpoch && !wasLocalOwnerExplicitlySignedOut() &&
      current?.ownerId === continuity.ownerId && current.sessionId === continuity.sessionId &&
      result.status === "valid" && result.persistentStateUnchanged === true &&
      result.ownerMatchesExpected === true && result.sessionMatchesExpected === true
      ? { userId: continuity.ownerId, email: null } : null;
  } catch { return null; }
}

export async function sealTrustedOfflineOwner(
  owner: StoredLocalOwnerContext,
  session: { access_token?: string; user?: { id?: string } | null } | null,
): Promise<StoredLocalOwnerContext | null> {
  if (!nativeOfflineOwnerAvailable()) return null;
  const epoch = offlineProofEpoch, environment = offlineAuthEnvironment();
  const continuity = environment ? offlineSessionContinuity(session, environment) : null;
  if (!environment || !continuity || continuity.ownerId !== owner.userId) return null;
  await offlineRevocation;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  // A misconfigured server/secret key must never enter a logged bridge call.
  let publicKey = /^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey);
  if (!publicKey) {
    try {
      const payload = JSON.parse(atob(publishableKey.split(".")[1]
        .replace(/-/g, "+").replace(/_/g, "/")));
      publicKey = payload.role === "anon";
    } catch { publicKey = false; }
  }
  if (!publicKey) return null;
  const result = await offlineOwnerKeystore.sealAfterVerifiedOnlineAuth({
    environment, ownerId: continuity.ownerId, sessionId: continuity.sessionId, publishableKey,
  });
  const current = cachedOfflineSession(environment);
  return epoch === offlineProofEpoch &&
    current?.ownerId === continuity.ownerId && current.sessionId === continuity.sessionId &&
    result.userId === owner.userId ? owner : null;
}
