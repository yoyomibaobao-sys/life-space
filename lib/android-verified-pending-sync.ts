import { isAndroidOnline } from "@/lib/android-connectivity";
import {
  getLocalArchiveDetail,
  isPendingCloudCreateArchive,
  listLocalArchiveSummaries,
  listVisibleCloudOfflineArchiveSummaries,
  listPendingCloudSyncSummaries,
  preparePendingCloudSyncQueue,
  type LocalArchiveOwnerContext,
} from "@/lib/local-offline-db";
import {
  isStableCloudOperationId,
  syncPendingCloudArchive,
  type PendingCloudSyncProgress,
  type PendingCloudSyncResult,
} from "@/lib/pending-cloud-sync";
import { supabase } from "@/lib/supabase";

// Android W5 entry points only. Website callers retain the original shared
// implementation. The full queue NEVER invokes the shared unscoped preparer.
let fullQueueActive = false;
const activeArchives = new Set<string>();

function failure(message: string): PendingCloudSyncResult {
  return {
    success: false, cloudArchiveId: null, archiveUpdated: false,
    recordCount: 0, imageCount: 0, failedCount: 1, error: message,
  };
}

async function confirmVerifiedOwner(context: LocalArchiveOwnerContext) {
  const owner = context.userId?.trim();
  if (!owner || !isAndroidOnline()) {
    throw Error("当前身份或网络尚未确认，待上传资料保持不变。");
  }
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session ||
      sessionData.session.user?.id !== owner) {
    throw Error("当前Session与待上传Owner不一致，停止上传。");
  }
  const { data: verified, error: ownerError } = await supabase.auth.getUser();
  if (ownerError || verified.user?.id !== owner) {
    throw Error("当前登录Owner未经服务端验证，待上传资料保持不变。");
  }
  return owner;
}

function verifyQueuedOperation(
  item: { sync: { status: string; client_operation_id?: string | null } }
) {
  if (["pending-cloud-sync", "failed", "uploading"].includes(item.sync.status) &&
      !isStableCloudOperationId(item.sync.client_operation_id)) {
    throw Error("待上传对象缺少合法操作ID，已保留本机资料。");
  }
}

async function confirmTarget(
  localArchiveId: string,
  context: LocalArchiveOwnerContext,
  owner: string,
  targetRecordId?: string
) {
  const detail = await getLocalArchiveDetail(localArchiveId, context, true);
  if (!detail || detail.archive.id !== localArchiveId ||
      detail.archive.local_owner_user_id !== owner) {
    throw Error("待上传项目归属不匹配，原件及队列保持不变。");
  }
  verifyQueuedOperation(detail.archive);
  if (targetRecordId &&
      detail.records.filter((r) => r.id === targetRecordId).length !== 1) {
    throw Error("待上传记录不属于目标项目，原件保持不变。");
  }
  for (const record of detail.records) {
    if (record.archive_id !== localArchiveId ||
        ("local_owner_user_id" in record &&
          record.local_owner_user_id !== owner)) {
      throw Error("待上传记录Owner或项目归属不一致，已停止上传。");
    }
    verifyQueuedOperation(record);
    for (const image of record.images) {
      if (image.archive_id !== localArchiveId || image.record_id !== record.id ||
          ("local_owner_user_id" in image &&
            image.local_owner_user_id !== owner)) {
        throw Error("待上传图片Owner或记录关联异常，已停止上传。");
      }
      verifyQueuedOperation(image);
    }
  }
  return detail;
}

function hasUnconfirmedAttempt(detail: Awaited<ReturnType<typeof confirmTarget>>) {
  const unsafe = (value: { sync: { status: string; attempt_count?: number } }) =>
    value.sync.status === "uploading" ||
    ((value.sync.attempt_count || 0) > 0 && value.sync.status !== "synced");
  return unsafe(detail.archive) || detail.records.some((record) =>
    unsafe(record) || record.images.some(unsafe)
  );
}

type One = {
  localArchiveId: string;
  ownerContext: LocalArchiveOwnerContext;
  targetRecordId?: string;
  onProgress?: (progress: PendingCloudSyncProgress) => void;
};

async function runOne(params: One, alreadyOwnsFullQueue: boolean) {
  const key = params.localArchiveId;
  if ((!alreadyOwnsFullQueue && fullQueueActive) || activeArchives.has(key)) {
    return failure("已有相同项目或全部待上传任务在执行，禁止重复提交。");
  }
  activeArchives.add(key);
  try {
    const owner = await confirmVerifiedOwner(params.ownerContext);
    await confirmTarget(key, params.ownerContext, owner, params.targetRecordId);
    // Shared single-object executor independently rechecks getUser,
    // operation state and Owner before its scoped queue preparation/write.
    return await syncPendingCloudArchive(params);
  } finally {
    activeArchives.delete(key);
  }
}

export function syncAndroidPendingCloudArchive(params: One) {
  return runOne(params, false);
}

export async function syncAndroidAllPendingCloudArchives(params: {
  ownerContext: LocalArchiveOwnerContext;
  onProgress?: (localArchiveId: string, progress: PendingCloudSyncProgress) => void;
}): Promise<PendingCloudSyncResult[]> {
  if (fullQueueActive || activeArchives.size) {
    throw Error("已有上传任务在执行，禁止同时启动全部队列。");
  }
  fullQueueActive = true;
  try {
    const owner = await confirmVerifiedOwner(params.ownerContext);
    // A fresh list is read-only. Unqueued local-only records are also
    // considered so the established manual full-upload behavior survives.
    const [pending, local, cloudCache] = await Promise.all([
      listPendingCloudSyncSummaries(params.ownerContext),
      listLocalArchiveSummaries(),
      listVisibleCloudOfflineArchiveSummaries(params.ownerContext),
    ]);
    const ids = new Set([
      ...pending.map((item) => item.local_archive_id),
      ...local.filter((item) =>
        item.local_owner_user_id === owner &&
        !(item.local_role === "local-project" && item.source_cloud_saved_at) &&
        (Boolean(item.source_cloud_archive_id) || isPendingCloudCreateArchive(item)))
        .map((item) => item.id),
      // Existing cloud caches may hold fresh local-only records/images which
      // the old full queue legitimately promoted after authentication.
      ...cloudCache.filter((item) =>
        item.local_owner_user_id === owner && Boolean(item.source_cloud_archive_id))
        .map((item) => item.id),
    ]);
    const results: PendingCloudSyncResult[] = [];
    // Preflight all candidates before ANY queue mutation. A foreign or
    // malformed linked row never partially uploads earlier projects.
    for (const localArchiveId of ids) {
      await confirmTarget(localArchiveId, params.ownerContext, owner);
    }
    for (const localArchiveId of ids) {
      // No queue preparation until both Session and the authenticated
      // server Owner have been checked for THIS item.
      await confirmVerifiedOwner(params.ownerContext);
      const detail = await confirmTarget(
        localArchiveId, params.ownerContext, owner
      );
      const containsUnqueued = detail.records.some((record) =>
        (record.sync.status === "local-only" && !record.sync.cloud_record_id) ||
        record.images.some((image) =>
          image.sync.status === "local-only" && !image.sync.cloud_media_id
        )
      );
      const hasQueued = [detail.archive, ...detail.records,
        ...detail.records.flatMap((record) => record.images)].some((item) =>
        ["pending-cloud-sync", "failed", "uploading"].includes(item.sync.status)
      );
      if (!containsUnqueued && !hasQueued) continue;
      // Scoped preparation cannot touch sibling projects or foreign Owner
      // rows. It is skipped for already queued/UNKNOWN-only projects.
      if (containsUnqueued && !hasUnconfirmedAttempt(detail)) {
        await preparePendingCloudSyncQueue(params.ownerContext, {
          targetArchiveId: localArchiveId,
        });
      }
      await confirmTarget(localArchiveId, params.ownerContext, owner);
      results.push(await runOne({
        localArchiveId, ownerContext: params.ownerContext,
        onProgress: (progress) => params.onProgress?.(localArchiveId, progress),
      }, true));
    }
    return results;
  } finally {
    fullQueueActive = false;
  }
}
