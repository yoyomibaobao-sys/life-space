"use client";

import { App } from "@capacitor/app";
import { Capacitor, CapacitorHttp, registerPlugin } from "@capacitor/core";
import {
  ANDROID_RELEASE_APK_URL,
  ANDROID_RELEASE_MANIFEST_PATH,
  isAndroidReleaseManifest,
  type AndroidReleaseManifest,
} from "./android-release";

export type NativeAppVersion = { versionName: string; versionCode: number };
export type NativeInstallResult = { status: "permission_required" | "installer_opened" };
type NativeAppUpdatePlugin = {
  getCurrentVersion(): Promise<NativeAppVersion>;
  installUpdate(options: {
    downloadUrl: string;
    versionCode: number;
    sizeBytes: number;
    sha256: string;
  }): Promise<NativeInstallResult>;
};

const NativeAppUpdate = registerPlugin<NativeAppUpdatePlugin>("NativeAppUpdate");
const MANIFEST_URL = `https://life-space.uk${ANDROID_RELEASE_MANIFEST_PATH}`;
const REQUEST_TIMEOUT_MS = 12_000;
const CHECK_INTERVAL_MS = 60 * 60_000;
const RETRY_INTERVAL_MS = 60_000;
const REMINDER_KEY = "lifespace.android-update.dismissed";
const SNOOZE_MS = 24 * 60 * 60_000;

export type AndroidUpdateSnapshot = {
  status: "idle" | "checking" | "available" | "latest" | "failed" | "android_only" | "unsupported";
  currentVersion: NativeAppVersion | null;
  release: AndroidReleaseManifest | null;
  remind: boolean;
};

const initialSnapshot: AndroidUpdateSnapshot = {
  status: "idle", currentVersion: null, release: null, remind: false,
};
let snapshot = initialSnapshot;
let inFlight: Promise<AndroidUpdateSnapshot> | null = null;
let lastAttempt = 0;
const listeners = new Set<() => void>();

export const getAndroidUpdateSnapshot = () => snapshot;
export const getAndroidUpdateServerSnapshot = () => initialSnapshot;
export function subscribeAndroidUpdates(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function publish(next: AndroidUpdateSnapshot) {
  snapshot = next;
  listeners.forEach((listener) => listener());
  return next;
}
export function isNativeAndroid() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}
export function supportsAndroidInstall() {
  return isNativeAndroid() && Capacitor.isPluginAvailable("NativeAppUpdate");
}

/** Public metadata only. The APK always stays in the native verified installer. */
export async function fetchAndroidRelease(): Promise<AndroidReleaseManifest> {
  const url = `${MANIFEST_URL}?check=${Date.now()}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      credentials: "omit",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Update metadata HTTP ${response.status}`);
    const value: unknown = await response.json();
    if (!isAndroidReleaseManifest(value)) throw new Error("Invalid update metadata");
    return value;
  } catch (error) {
    if (!isNativeAndroid() || !Capacitor.isPluginAvailable("CapacitorHttp")) throw error;
  } finally {
    clearTimeout(timeout);
  }

  // Already bundled in rc4. Recover from a WebView request failure without
  // requiring the user to install another APK to repair update checking.
  const response = await CapacitorHttp.get({
    url,
    headers: { Accept: "application/json", "Cache-Control": "no-cache" },
    connectTimeout: REQUEST_TIMEOUT_MS,
    readTimeout: REQUEST_TIMEOUT_MS,
    disableRedirects: true,
    responseType: "json",
  });
  if (response.status !== 200) throw new Error(`Update metadata HTTP ${response.status}`);
  const value: unknown = typeof response.data === "string"
    ? JSON.parse(response.data) : response.data;
  if (!isAndroidReleaseManifest(value)) throw new Error("Invalid update metadata");
  return value;
}

async function readInstalledVersion(): Promise<NativeAppVersion> {
  try {
    const info = await App.getInfo();
    const versionCode = Number(info.build);
    if (!Number.isSafeInteger(versionCode) || versionCode <= 0 || !info.version) {
      throw new Error("Invalid installed version");
    }
    return { versionName: info.version, versionCode };
  } catch (error) {
    if (!supportsAndroidInstall()) throw error;
    return NativeAppUpdate.getCurrentVersion();
  }
}

export function checkAndroidUpdate(force = false): Promise<AndroidUpdateSnapshot> {
  if (inFlight) return inFlight;
  if (!isNativeAndroid()) {
    return Promise.resolve(publish({ ...initialSnapshot, status: "android_only" }));
  }
  const interval = snapshot.status === "failed" ? RETRY_INTERVAL_MS : CHECK_INTERVAL_MS;
  if (!force && lastAttempt && Date.now() - lastAttempt < interval) {
    return Promise.resolve(snapshot);
  }
  lastAttempt = Date.now();
  publish({ ...snapshot, status: "checking" });
  inFlight = (async () => {
    try {
      if (!supportsAndroidInstall()) {
        const currentVersion = await readInstalledVersion().catch(() => null);
        return publish({ status: "unsupported", currentVersion, release: null, remind: shouldRemindAndroidUpdate("legacy") });
      }
      const currentVersion = await readInstalledVersion();
      publish({ ...snapshot, currentVersion });
      const release = await fetchAndroidRelease();
      return publish({
        currentVersion,
        release,
        status: release.version_code > currentVersion.versionCode ? "available" : "latest",
        remind: shouldRemindAndroidUpdate(release.version_code),
      });
    } catch {
      return publish({ ...snapshot, status: "failed" });
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

export async function installAndroidUpdate(release: AndroidReleaseManifest): Promise<NativeInstallResult> {
  if (!supportsAndroidInstall() || !isAndroidReleaseManifest(release)) {
    throw new Error("Verified native updates are unavailable");
  }
  return NativeAppUpdate.installUpdate({
    downloadUrl: ANDROID_RELEASE_APK_URL,
    versionCode: release.version_code,
    sizeBytes: release.size_bytes,
    sha256: release.sha256,
  });
}

export function androidInstallFailure(error: unknown): "permission" | "installer" | "download" {
  const message = error instanceof Error ? error.message
    : String((error as { message?: unknown } | null)?.message || "");
  if (message.includes("install permission")) return "permission";
  if (message.includes("package installer")) return "installer";
  return "download";
}

type ReminderVersion = number | "legacy";
const reminderIdentity = (version: ReminderVersion) => version === "legacy" ? version : `release-${version}`;
export function shouldRemindAndroidUpdate(version: ReminderVersion, now = Date.now()) {
  try {
    const saved = localStorage.getItem(REMINDER_KEY);
    if (!saved) return true;
    const [identity, rawTimestamp] = saved.split("|");
    const timestamp = Number(rawTimestamp);
    return identity !== reminderIdentity(version) || !Number.isFinite(timestamp) ||
      timestamp > now || now - timestamp >= SNOOZE_MS;
  } catch { return true; }
}
export function snoozeAndroidUpdate(version: ReminderVersion) {
  try {
    localStorage.setItem(REMINDER_KEY, `${reminderIdentity(version)}|${Date.now()}`);
  } catch { /* A storage restriction must not interrupt the user's work. */ }
  publish({ ...snapshot, remind: false });
}
