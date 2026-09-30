"use client";

import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { Network } from "@capacitor/network";
import { useSyncExternalStore } from "react";

type Listener = () => void;
let connected = typeof navigator === "undefined" ? true : navigator.onLine;
let started = false;
let epoch = 0;
let startGeneration = 0;
const listeners = new Set<Listener>();

function publish(next: boolean) {
  if (connected === next) return;
  connected = next;
  for (const listener of listeners) listener();
}

export function isAndroidOnline() {
  return !started && typeof navigator !== "undefined" && !Capacitor.isNativePlatform()
    ? navigator.onLine : connected;
}

export async function recheckAndroidConnectivity() {
  const check = ++epoch;
  try {
    const next = Capacitor.isNativePlatform()
      ? (await Network.getStatus()).connected
      : navigator.onLine;
    if (check === epoch) publish(next);
  } catch (error) {
    // A native plugin failure is not evidence that the device is offline.
    console.warn("connectivity status check", error);
  }
  return connected;
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
    void Network.addListener("networkStatusChange", (status) => {
      ++epoch;
      publish(status.connected);
    }).then((handle) => {
      if (!started || generation !== startGeneration) void handle.remove();
      else nativeHandles.push(handle);
    });
    void App.addListener("resume", recheck).then((handle) => {
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
  start();
  return () => {
    listeners.delete(listener);
    if (listeners.size) return;
    started = false;
    ++startGeneration;
    ++epoch;
    stopBrowserListeners?.();
    stopBrowserListeners = null;
    for (const handle of nativeHandles.splice(0)) void handle.remove();
  };
}

export function useAndroidConnectivity() {
  return useSyncExternalStore(subscribeAndroidConnectivity, isAndroidOnline, () => true);
}
