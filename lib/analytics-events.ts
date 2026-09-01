"use client";

import { supabase } from "@/lib/supabase";

export type AnalyticsEventName =
  | "page_view"
  | "apk_download"
  | "app_first_open"
  | "app_open"
  | "register"
  | "cloud_space_opened"
  | "local_project_created"
  | "local_record_created"
  | "local_data_bound_to_account"
  | "local_data_synced_to_cloud";

type PendingAnalyticsEvent = {
  event_name: AnalyticsEventName;
  anonymous_id: string;
  platform: string;
  app_version: string | null;
  user_agent: string | null;
  referrer: string | null;
  metadata: Record<string, unknown>;
  dedupe_key?: string;
};

const ANONYMOUS_ID_KEY = "lifespace_anonymous_id";
const PENDING_EVENTS_KEY = "lifespace_pending_analytics_events";
const FIRST_OPEN_RECORDED_KEY = "lifespace_app_first_open_recorded";
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || null;
const MAX_USER_AGENT_LENGTH = 1024;
const MAX_REFERRER_LENGTH = 2048;

function canUseBrowserStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function createAnonymousId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `anon_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function getAnalyticsAnonymousId() {
  if (!canUseBrowserStorage()) return createAnonymousId();

  const existing = window.localStorage.getItem(ANONYMOUS_ID_KEY);
  if (existing) return existing;

  const nextId = createAnonymousId();
  window.localStorage.setItem(ANONYMOUS_ID_KEY, nextId);
  return nextId;
}

function getPlatform() {
  if (typeof navigator === "undefined") return "web";
  return /android/i.test(navigator.userAgent) ? "android" : "web";
}

function sanitizeReferrer(value?: string | null) {
  if (!value) return null;

  try {
    const parsed = new URL(value);
    return `${parsed.origin}${parsed.pathname}`.slice(0, MAX_REFERRER_LENGTH);
  } catch {
    return null;
  }
}

function readPendingEvents(): PendingAnalyticsEvent[] {
  if (!canUseBrowserStorage()) return [];

  try {
    const raw = window.localStorage.getItem(PENDING_EVENTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePendingEvents(events: PendingAnalyticsEvent[]) {
  if (!canUseBrowserStorage()) return;
  window.localStorage.setItem(PENDING_EVENTS_KEY, JSON.stringify(events.slice(-20)));
}

function queuePendingEvent(event: PendingAnalyticsEvent) {
  const existing = readPendingEvents();
  const deduped = event.dedupe_key
    ? existing.filter((item) => item.dedupe_key !== event.dedupe_key)
    : existing;
  writePendingEvents([...deduped, event]);
}

async function insertAnalyticsEvent(event: PendingAnalyticsEvent) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("analytics_events").insert({
    event_name: event.event_name,
    anonymous_id: event.anonymous_id,
    user_id: user?.id || null,
    platform: event.platform,
    app_version: event.app_version,
    user_agent: event.user_agent,
    referrer: event.referrer,
    metadata: event.metadata,
  });

  return !error;
}

export async function flushPendingAnalyticsEvents() {
  const pending = readPendingEvents();
  if (pending.length === 0) return;

  const remaining: PendingAnalyticsEvent[] = [];

  for (const event of pending) {
    try {
      const ok = await insertAnalyticsEvent(event);
      if (!ok) {
        remaining.push(event);
      } else if (event.dedupe_key === "app_first_open") {
        window.localStorage.setItem(FIRST_OPEN_RECORDED_KEY, "1");
      }
    } catch {
      remaining.push(event);
    }
  }

  writePendingEvents(remaining);
}

export async function trackAnalyticsEvent(
  eventName: AnalyticsEventName,
  metadata: Record<string, unknown> = {},
  options: { dedupeKey?: string; queueOnFailure?: boolean } = {}
) {
  if (!canUseBrowserStorage()) return false;

  const event: PendingAnalyticsEvent = {
    event_name: eventName,
    anonymous_id: getAnalyticsAnonymousId(),
    platform: getPlatform(),
    app_version: APP_VERSION,
    user_agent: navigator.userAgent
      ? navigator.userAgent.slice(0, MAX_USER_AGENT_LENGTH)
      : null,
    referrer: eventName === "page_view" ? null : sanitizeReferrer(document.referrer),
    metadata,
    dedupe_key: options.dedupeKey,
  };

  try {
    const ok = await insertAnalyticsEvent(event);
    if (ok) return true;
  } catch {
    // Network or auth errors should not block normal use.
  }

  if (options.queueOnFailure) {
    queuePendingEvent(event);
  }

  return false;
}

export async function trackFirstOpenOnce(metadata: Record<string, unknown> = {}) {
  if (!canUseBrowserStorage()) return;
  if (window.localStorage.getItem(FIRST_OPEN_RECORDED_KEY) === "1") return;

  await flushPendingAnalyticsEvents();

  if (window.localStorage.getItem(FIRST_OPEN_RECORDED_KEY) === "1") return;

  const ok = await trackAnalyticsEvent("app_first_open", metadata, {
    dedupeKey: "app_first_open",
    queueOnFailure: true,
  });

  if (ok) {
    window.localStorage.setItem(FIRST_OPEN_RECORDED_KEY, "1");
  }
}
