import {
  finalizeLocalOriginMigration,
  mergeLocalOriginBaseSnapshot,
  mergeLocalOriginImage,
  type LocalOriginBaseSnapshot,
  type LocalImage,
} from "@/lib/local-offline-db";
import {
  loadRememberedLocalOwnerContext,
  rememberLocalOwnerContext,
} from "@/lib/local-owner-context";

export const LEGACY_LOCAL_ORIGIN =
  "https://life-space-canary.yoyomibaobao.workers.dev";
export const LEGACY_LOCAL_BRIDGE_PATH =
  "/__lifespace_local_bridge_v1__.html";
export const LOCAL_ORIGIN_MIGRATION_STORAGE_KEY =
  "lifespace:local-origin-migration:v1";
export const LOCAL_ORIGIN_MIGRATED_EVENT =
  "lifespace-local-origin-migrated";

const CHANNEL = "lifespace-local-origin-migration-v1";
const MIGRATION_TIMEOUT_MS = 90_000;

type MigrationResult = {
  status: "migrated" | "already-migrated" | "not-android";
  archiveCount: number;
  recordCount: number;
  imageCount: number;
};

type BridgeMessage = {
  channel?: string;
  nonce?: string;
  type?: string;
  seq?: number;
  snapshot?: LocalOriginBaseSnapshot;
  image?: LocalImage;
  archiveCount?: number;
  recordCount?: number;
  imageCount?: number;
  message?: string;
};

function isAndroidShell() {
  return /LifeSpaceAndroid\//.test(window.navigator.userAgent);
}

function readCompletedMigration(): MigrationResult | null {
  try {
    const value = JSON.parse(
      window.localStorage.getItem(LOCAL_ORIGIN_MIGRATION_STORAGE_KEY) || "null",
    ) as Partial<MigrationResult> | null;
    if (value?.status !== "migrated") return null;
    return {
      status: "already-migrated",
      archiveCount: Number(value.archiveCount) || 0,
      recordCount: Number(value.recordCount) || 0,
      imageCount: Number(value.imageCount) || 0,
    };
  } catch {
    return null;
  }
}

function rememberSingleLegacyOwner(snapshot: LocalOriginBaseSnapshot) {
  if (loadRememberedLocalOwnerContext()) return;

  const owners = new Map<string, string | null>();
  for (const archive of snapshot.archives) {
    const userId = String(archive.local_owner_user_id || "").trim();
    if (!userId) continue;
    owners.set(userId, archive.local_owner_email || null);
  }

  if (owners.size !== 1) return;
  const [[userId, email]] = owners;
  rememberLocalOwnerContext({ userId, email });
}

export async function migrateLegacyLocalOrigin(): Promise<MigrationResult> {
  if (typeof window === "undefined" || !isAndroidShell()) {
    return {
      status: "not-android",
      archiveCount: 0,
      recordCount: 0,
      imageCount: 0,
    };
  }

  const completed = readCompletedMigration();
  if (completed) return completed;

  const nonce =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const iframe = document.createElement("iframe");
  iframe.hidden = true;
  iframe.setAttribute("aria-hidden", "true");
  iframe.src = `${LEGACY_LOCAL_ORIGIN}${LEGACY_LOCAL_BRIDGE_PATH}`;
  document.body.appendChild(iframe);

  return new Promise<MigrationResult>((resolve, reject) => {
    let settled = false;
    let baseSnapshot: LocalOriginBaseSnapshot | null = null;

    const finish = (error?: Error, result?: MigrationResult) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      window.removeEventListener("message", onMessage);
      iframe.remove();
      if (error) reject(error);
      else resolve(result!);
    };

    const post = (message: BridgeMessage) => {
      iframe.contentWindow?.postMessage(
        { ...message, channel: CHANNEL, nonce },
        LEGACY_LOCAL_ORIGIN,
      );
    };

    const onMessage = async (event: MessageEvent<BridgeMessage>) => {
      if (
        event.origin !== LEGACY_LOCAL_ORIGIN ||
        event.source !== iframe.contentWindow ||
        event.data?.channel !== CHANNEL ||
        event.data?.nonce !== nonce
      ) {
        return;
      }

      try {
        if (event.data.type === "base") {
          baseSnapshot = event.data.snapshot || {
            archives: [],
            records: [],
            taxonomy: [],
          };
          await mergeLocalOriginBaseSnapshot(baseSnapshot);
          rememberSingleLegacyOwner(baseSnapshot);
          post({ type: "base-ack" });
          return;
        }

        if (event.data.type === "image" && event.data.image) {
          await mergeLocalOriginImage(event.data.image);
          post({ type: "image-ack", seq: event.data.seq });
          return;
        }

        if (event.data.type === "complete") {
          await finalizeLocalOriginMigration();
          const result: MigrationResult = {
            status: "migrated",
            archiveCount:
              Number(event.data.archiveCount) || baseSnapshot?.archives.length || 0,
            recordCount:
              Number(event.data.recordCount) || baseSnapshot?.records.length || 0,
            imageCount: Number(event.data.imageCount) || 0,
          };
          window.localStorage.setItem(
            LOCAL_ORIGIN_MIGRATION_STORAGE_KEY,
            JSON.stringify({ ...result, completedAt: new Date().toISOString() }),
          );
          window.dispatchEvent(
            new CustomEvent(LOCAL_ORIGIN_MIGRATED_EVENT, { detail: result }),
          );
          finish(undefined, result);
          return;
        }

        if (event.data.type === "error") {
          finish(
            new Error(event.data.message || "旧版本地数据迁移失败，请稍后重试。"),
          );
        }
      } catch (error) {
        finish(
          error instanceof Error
            ? error
            : new Error("旧版本地数据迁移失败，请稍后重试。"),
        );
      }
    };

    const timeoutId = window.setTimeout(() => {
      finish(new Error("旧版本地数据迁移超时，请重新打开 App 后重试。"));
    }, MIGRATION_TIMEOUT_MS);

    window.addEventListener("message", onMessage);
    iframe.addEventListener("load", () => {
      post({ type: "export-request" });
    });
  });
}
