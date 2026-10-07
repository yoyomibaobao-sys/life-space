import type { LocalArchive } from "@/lib/local-offline-db";
import { assertSafLocalCloudTransfer, requireSafUuid } from "@/lib/local-saf-contract";
import { commitSafContent, readSafCommitted, type SafStorage } from "@/lib/local-saf-core";

export type PreparedLocalCloudTransfer = NonNullable<LocalArchive["local_cloud_transfer"]>;
export type RemoteTransferArchive = {
  id: string; user_id: string; local_transfer_token: string | null;
};
export type TransferArchiveGateway<Payload> = {
  findById(id: string): Promise<RemoteTransferArchive | null>;
  insert(payload: Payload & RemoteTransferArchive): Promise<void>;
};

/** No remote request is allowed until the immutable marker can be read back. */
export async function prepareSafLocalCloudTransfer(
  storage: SafStorage, archiveId: string, authenticatedUserId: string,
): Promise<PreparedLocalCloudTransfer> {
  requireSafUuid(authenticatedUserId, "authenticated user");
  const current = await readSafCommitted(storage);
  if (!current) throw Error("No committed LifeSpace local space; transfer stopped.");
  const entry = current.source.entries.find((candidate) => candidate.id === archiveId);
  if (!entry || entry.kind !== "local-project" || entry.partition !== "local") {
    throw Error("An independent local project in the connected LifeSpace directory is required.");
  }
  const existing = entry.archive.local_cloud_transfer;
  if (existing) {
    assertSafLocalCloudTransfer(entry.archive, entry.kind);
    if (existing.targetUserId !== authenticatedUserId) {
      throw Error("This transfer belongs to another cloud account; sign in to that account to continue.");
    }
    if (existing.stage === "complete") throw Error("This local project has already been transferred.");
    return existing;
  }
  const prepared: PreparedLocalCloudTransfer = {
    targetCloudArchiveId: crypto.randomUUID(), localTransferToken: crypto.randomUUID(),
    targetUserId: authenticatedUserId, stage: "prepared",
  };
  assertSafLocalCloudTransfer({ ...entry.archive, local_cloud_transfer: prepared }, entry.kind);
  await commitSafContent(storage, {
    ...current.source,
    entries: current.source.entries.map((candidate) => candidate.id === archiveId
      ? { ...candidate, archive: { ...candidate.archive, local_cloud_transfer: prepared } }
      : candidate),
  }, current.commit.revision);
  const durable = await readSafCommitted(storage);
  const saved = durable?.source.entries.find((candidate) => candidate.id === archiveId)
    ?.archive.local_cloud_transfer;
  if (!saved || saved.targetCloudArchiveId !== prepared.targetCloudArchiveId ||
      saved.localTransferToken !== prepared.localTransferToken ||
      saved.targetUserId !== prepared.targetUserId) {
    throw Error("Cloud transfer preparation was not durably committed.");
  }
  return saved;
}

/** A completed entry is retained as a tombstone until safe media GC is designed. */
export async function advanceSafLocalCloudTransfer(
  storage: SafStorage, archiveId: string, transfer: PreparedLocalCloudTransfer,
  stage: "cloud-created" | "complete",
) {
  const current = await readSafCommitted(storage);
  const entry = current?.source.entries.find((candidate) => candidate.id === archiveId);
  if (!current || !entry || entry.kind !== "local-project" || entry.partition !== "local") {
    throw Error("Committed local transfer project is missing.");
  }
  const saved = entry.archive.local_cloud_transfer;
  if (!saved || saved.targetCloudArchiveId !== transfer.targetCloudArchiveId ||
      saved.localTransferToken !== transfer.localTransferToken ||
      saved.targetUserId !== transfer.targetUserId) {
    throw Error("Committed local transfer identity changed; transfer stopped.");
  }
  if (saved.stage === stage) return;
  if (saved.stage === "complete" || (saved.stage !== "prepared" && stage === "cloud-created")) {
    throw Error("Invalid local transfer stage transition.");
  }
  await commitSafContent(storage, {
    ...current.source,
    entries: current.source.entries.map((candidate) => candidate.id === archiveId
      ? { ...candidate, archive: { ...candidate.archive,
          local_cloud_transfer: { ...saved, stage } } }
      : candidate),
  }, current.commit.revision);
  const durable = await readSafCommitted(storage);
  if (durable?.source.entries.find((candidate) => candidate.id === archiveId)
    ?.archive.local_cloud_transfer?.stage !== stage) {
    throw Error("Local transfer stage did not reach a durable commit.");
  }
}

function verifyRemote(row: RemoteTransferArchive, transfer: PreparedLocalCloudTransfer) {
  if (row.id !== transfer.targetCloudArchiveId ||
      row.user_id !== transfer.targetUserId ||
      row.local_transfer_token !== transfer.localTransferToken) {
    throw Error("Cloud project ID, owner or transfer token conflict; transfer stopped.");
  }
  return row.id;
}

/** A lost response may be retried, but a remote row is reused only after all three fields match. */
export async function ensurePreparedCloudArchive<Payload extends object>(
  gateway: TransferArchiveGateway<Payload>, transfer: PreparedLocalCloudTransfer,
  authenticatedUserId: string, payload: Payload,
) {
  assertSafLocalCloudTransfer({
    local_role: "local-project", local_cloud_transfer: transfer,
  } as LocalArchive, "local-project");
  if (authenticatedUserId !== transfer.targetUserId) {
    throw Error("Cloud account changed during local transfer; sign in to the original account.");
  }
  if (transfer.stage === "complete") throw Error("Cloud transfer has already completed.");
  const existing = await gateway.findById(transfer.targetCloudArchiveId);
  if (existing) return { id: verifyRemote(existing, transfer), wasExisting: true };
  try {
    await gateway.insert({ ...payload, id: transfer.targetCloudArchiveId,
      user_id: transfer.targetUserId, local_transfer_token: transfer.localTransferToken });
  } catch (error) {
    const afterError = await gateway.findById(transfer.targetCloudArchiveId);
    if (afterError) return { id: verifyRemote(afterError, transfer), wasExisting: true };
    throw error;
  }
  const created = await gateway.findById(transfer.targetCloudArchiveId);
  if (!created) throw Error("Cloud project creation could not be verified; transfer stopped.");
  return { id: verifyRemote(created, transfer), wasExisting: false };
}
