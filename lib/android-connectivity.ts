"use client";

import { App } from "@capacitor/app";
import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { Network } from "@capacitor/network";
import { useSyncExternalStore } from "react";

type Listener = () => void;
export type AndroidTransportStatus = "disconnected" | "connected";
export type AndroidServiceStatus = "checking" | "reachable" | "unreachable";
export type AndroidConnectivityStatus = "checking" | "online" | "offline";

export type AndroidConnectivitySnapshot = {
  transportStatus: AndroidTransportStatus;
  serviceStatus: AndroidServiceStatus;
  status: AndroidConnectivityStatus;
  generation: number;
};

type ConnectivityControllerOptions = {
  probe: () => Promise<boolean>;
  initialTransport?: AndroidTransportStatus;
  debounceMs?: number;
};

const PRODUCTION_SUPABASE_REF = "eidltoikfpnrzxruvawf";
const ISOLATED_QA_SUPABASE_REF = "mablwxlipcgbmbnfdbkc";
export const PRODUCTION_HEALTH_URL = "https://life-space.uk/api/health";
export const ISOLATED_QA_HEALTH_URL =
  "https://lifespace-site-media-qa-20261028.lifespace-assets-isolated-lab.workers.dev/api/health";

// The Android native health request must follow its bundled Supabase environment.
// An unrecognized or absent project must NEVER fall back to production health.
export function resolveAndroidHealthUrl(supabaseUrl?: string | null): string | null {
  if (!supabaseUrl) return null;
  try {
    const parsed = new URL(supabaseUrl);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password ||
        parsed.port || parsed.pathname !== "/" || parsed.search || parsed.hash) return null;
    if (parsed.hostname === `${PRODUCTION_SUPABASE_REF}.supabase.co`) {
      return PRODUCTION_HEALTH_URL;
    }
    if (parsed.hostname === `${ISOLATED_QA_SUPABASE_REF}.supabase.co`) {
      return ISOLATED_QA_HEALTH_URL;
    }
  } catch {
    // Invalid or unknown source cannot prove service availability.
  }
  return null;
}

export const LIFESPACE_HEALTH_URL =
  resolveAndroidHealthUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);

export type AndroidWorkspaceRefreshState =
  "idle" | "connecting" | "offline" | "connection-checked" | "success" | "cloud-failure";

export function resolveAndroidWorkspaceNetworkState(
  snapshot: Pick<AndroidConnectivitySnapshot, "transportStatus" | "serviceStatus">,
  refresh: AndroidWorkspaceRefreshState,
  cloudError = "",
): AndroidWorkspaceRefreshState {
  if (snapshot.transportStatus === "disconnected") return "offline";
  // Health probing is not an offline verdict; a connected transport is checking.
  if (refresh === "connecting" || snapshot.serviceStatus === "checking") return "connecting";
  // Health 200 without verified session or private project GET means connection
  // only; never silently hide that warning or call it a personal list refresh.
  if (refresh === "connection-checked") return snapshot.serviceStatus === "reachable"
    ? "connection-checked" : "cloud-failure";
  if (refresh === "cloud-failure" || Boolean(cloudError) ||
      snapshot.serviceStatus === "unreachable") return "cloud-failure";
  if (refresh === "success") return "success";
  return "idle";
}

const HEALTH_TIMEOUT_MS = 2500;

function resolveBusinessStatus(
  transportStatus: AndroidTransportStatus,
  serviceStatus: AndroidServiceStatus,
): AndroidConnectivityStatus {
  if (transportStatus === "disconnected") return "offline";
  if (serviceStatus === "reachable") return "online";
  if (serviceStatus === "checking") return "checking";
  return "offline";
}

export function createAndroidConnectivityController({
  probe,
  initialTransport = "connected",
  debounceMs = 80,
}: ConnectivityControllerOptions) {
  let generation = 0;
  let snapshot: AndroidConnectivitySnapshot = {
    transportStatus: initialTransport,
    serviceStatus: initialTransport === "connected" ? "checking" : "unreachable",
    status: initialTransport === "connected" ? "checking" : "offline",
    generation,
  };
  let inFlight: Promise<boolean> | null = null;
  let inFlightGeneration: number | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let probeAfterFlight = false;
  const subscribers = new Set<Listener>();

  function publish(
    transportStatus: AndroidTransportStatus,
    serviceStatus: AndroidServiceStatus,
  ) {
    const status = resolveBusinessStatus(transportStatus, serviceStatus);
    if (
      snapshot.transportStatus === transportStatus &&
      snapshot.serviceStatus === serviceStatus &&
      snapshot.status === status &&
      snapshot.generation === generation
    ) return;
    snapshot = { transportStatus, serviceStatus, status, generation };
    for (const listener of subscribers) listener();
  }

  function setTransport(transportStatus: AndroidTransportStatus) {
    if (snapshot.transportStatus === transportStatus) return;
    generation += 1;
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    publish(
      transportStatus,
      transportStatus === "connected" ? "checking" : "unreachable",
    );
    if (transportStatus === "connected" && inFlight) probeAfterFlight = true;
  }

  async function probeNow() {
    if (snapshot.transportStatus === "disconnected") return false;
    if (inFlight) {
      if (inFlightGeneration !== generation) probeAfterFlight = true;
      return inFlight;
    }

    const probeGeneration = generation;
    inFlightGeneration = probeGeneration;
    publish("connected", "checking");
    inFlight = Promise.resolve()
      .then(probe)
      .catch(() => false)
      .then((reachable) => {
        if (
          probeGeneration === generation &&
          snapshot.transportStatus === "connected"
        ) {
          publish("connected", reachable ? "reachable" : "unreachable");
        }
        return reachable;
      })
      .finally(() => {
        inFlight = null;
        inFlightGeneration = null;
        if (probeAfterFlight && snapshot.transportStatus === "connected") {
          probeAfterFlight = false;
          scheduleProbe(0);
        }
      });
    return inFlight;
  }

  function scheduleProbe(delay = debounceMs) {
    if (snapshot.transportStatus === "disconnected") return;
    if (inFlight) {
      if (inFlightGeneration !== generation) probeAfterFlight = true;
      return;
    }
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void probeNow();
    }, Math.max(0, delay));
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: Listener) {
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    },
    setTransport,
    probeNow,
    scheduleProbe,
    dispose() {
      generation += 1;
      probeAfterFlight = false;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = null;
      subscribers.clear();
    },
  };
}

export async function probeLifeSpaceService(options: {
  isNative?: boolean;
  nativeRequest?: typeof CapacitorHttp.request;
  fetchImpl?: typeof fetch;
  /** Explicit endpoint for isolated contract testing only; production uses bundled environment. */
  healthUrl?: string;
} = {}) {
  const isNative = options.isNative ?? Capacitor.isNativePlatform();
  try {
    if (isNative) {
      const healthUrl = options.healthUrl || LIFESPACE_HEALTH_URL;
      if (!healthUrl) return false; // fail closed, never probe production for unknown QA
      const response = await (options.nativeRequest || CapacitorHttp.request)({
        url: healthUrl,
        method: "GET",
        headers: { Accept: "application/json", "Cache-Control": "no-cache" },
        disableRedirects: true,
        responseType: "json",
        connectTimeout: HEALTH_TIMEOUT_MS,
        readTimeout: HEALTH_TIMEOUT_MS,
      });
      const responseUrl = response.url
        ? new URL(response.url, healthUrl)
        : new URL(healthUrl);
      const data = typeof response.data === "string"
        ? JSON.parse(response.data)
        : response.data;
      return (
        response.status === 200 &&
        responseUrl.href === healthUrl &&
        Boolean(data && typeof data === "object" && (data as { ok?: unknown }).ok === true)
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
    try {
      const response = await (options.fetchImpl || fetch)("/api/health", {
        method: "GET",
        cache: "no-store",
        credentials: "omit",
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      if (!response.ok) return false;
      const data = await response.json() as { ok?: unknown };
      return data.ok === true;
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return false;
  }
}

const initialTransport: AndroidTransportStatus =
  typeof navigator === "undefined" || navigator.onLine
    ? "connected"
    : "disconnected";
const controller = createAndroidConnectivityController({
  initialTransport,
  probe: () => probeLifeSpaceService(),
});
let started = false;
let startGeneration = 0;
const listeners = new Set<Listener>();

export function isAndroidOnline() {
  return controller.getSnapshot().status === "online";
}

export function getAndroidConnectivitySnapshot() {
  return controller.getSnapshot();
}

export async function recheckAndroidConnectivity() {
  try {
    const transportConnected = Capacitor.isNativePlatform()
      ? (await Network.getStatus()).connected
      : navigator.onLine;
    controller.setTransport(transportConnected ? "connected" : "disconnected");
    if (!transportConnected) return false;
    return await controller.probeNow();
  } catch (error) {
    console.warn("connectivity status check", error);
    return isAndroidOnline();
  }
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  const generation = ++startGeneration;
  const recheck = () => { void recheckAndroidConnectivity(); };
  const onVisibility = () => { if (document.visibilityState === "visible") recheck(); };
  window.addEventListener("online", recheck);
  window.addEventListener("offline", recheck);
  window.addEventListener("focus", recheck);
  document.addEventListener("visibilitychange", onVisibility);
  void recheckAndroidConnectivity();

  if (Capacitor.isNativePlatform()) {
    void Network.addListener("networkStatusChange", (status: { connected: boolean }) => {
      controller.setTransport(status.connected ? "connected" : "disconnected");
      if (status.connected) controller.scheduleProbe(0);
    }).then((handle: { remove: () => Promise<void> }) => {
      if (!started || generation !== startGeneration) void handle.remove();
      else nativeHandles.push(handle);
    });
    void App.addListener("resume", recheck).then((handle: { remove: () => Promise<void> }) => {
      if (!started || generation !== startGeneration) void handle.remove();
      else nativeHandles.push(handle);
    });
  }
  stopBrowserListeners = () => {
    window.removeEventListener("online", recheck);
    window.removeEventListener("offline", recheck);
    window.removeEventListener("focus", recheck);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}

const nativeHandles: Array<{ remove: () => Promise<void> }> = [];
let stopBrowserListeners: (() => void) | null = null;

export function subscribeAndroidConnectivity(listener: Listener) {
  listeners.add(listener);
  const unsubscribeController = controller.subscribe(listener);
  start();
  return () => {
    listeners.delete(listener);
    unsubscribeController();
    if (listeners.size) return;
    started = false;
    ++startGeneration;
    stopBrowserListeners?.();
    stopBrowserListeners = null;
    for (const handle of nativeHandles.splice(0)) void handle.remove();
  };
}

export function useAndroidConnectivityStatus() {
  return useSyncExternalStore(
    subscribeAndroidConnectivity,
    getAndroidConnectivitySnapshot,
    (): AndroidConnectivitySnapshot => ({
      transportStatus: "connected",
      serviceStatus: "reachable",
      status: "online",
      generation: 0,
    }),
  );
}

export function useAndroidConnectivity() {
  return useAndroidConnectivityStatus().status === "online";
}
