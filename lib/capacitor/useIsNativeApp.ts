"use client";

import { Capacitor } from "@capacitor/core";
import { useSyncExternalStore } from "react";

function subscribeToNativePlatform() {
  return () => undefined;
}

function getNativePlatformSnapshot(): boolean | null {
  return Capacitor.isNativePlatform();
}

function getServerSnapshot(): boolean | null {
  return null;
}

export function useIsNativeApp() {
  return useSyncExternalStore(
    subscribeToNativePlatform,
    getNativePlatformSnapshot,
    getServerSnapshot,
  );
}
