"use client";

import { clearCloudOfflineCachesForOwner } from "@/lib/local-offline-db";
import {
  clearRememberedLocalOwnerContext,
  loadRememberedLocalOwnerContext,
} from "@/lib/local-owner-context";

export async function clearCloudOfflineCacheOnExplicitLogout(owner?: {
  userId?: string | null;
  email?: string | null;
} | null) {
  const remembered = loadRememberedLocalOwnerContext();
  const userId = String(owner?.userId || remembered?.userId || "").trim();
  if (userId) {
    await clearCloudOfflineCachesForOwner({
      userId,
      email: owner?.email || remembered?.email || null,
    });
  }
  clearRememberedLocalOwnerContext();
}
