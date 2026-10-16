export type GuardedMediaRow = {
  id: string;
  user_id: string;
  record_id: string | null;
  type: string | null;
  trashed_at: string | null;
};

export type GuardedRecordRow = {
  id: string;
  user_id: string;
  archive_id: string;
  visibility: string | null;
  trashed_at: string | null;
};

export type GuardedArchiveRow = {
  id: string;
  user_id: string;
  is_public: boolean | null;
  trashed_at: string | null;
};

/**
 * A service-role Storage download must never rely on the mere existence of
 * a media ID. Require a valid owner chain and fresh trial-access decision.
 */
export function mayServeRecordImage(input: {
  media: GuardedMediaRow;
  record: GuardedRecordRow;
  archive: GuardedArchiveRow;
  viewerId: string | null;
  trialOwnerCanRead: boolean;
}) {
  const { media, record, archive, viewerId, trialOwnerCanRead } = input;
  if (!trialOwnerCanRead || media.type !== "image") return false;
  if (media.trashed_at || record.trashed_at || archive.trashed_at) return false;
  if (!media.user_id || !media.record_id) return false;
  if (media.record_id !== record.id || record.archive_id !== archive.id) return false;
  if (media.user_id !== record.user_id || record.user_id !== archive.user_id) return false;
  return (viewerId !== null && viewerId === media.user_id)
    || (archive.is_public === true && record.visibility === "public");
}

/** Prevent a user-controlled media row pointing at another owner's object. */
export function isOwnerMediaPath(path: string, ownerId: string) {
  return Boolean(
    ownerId &&
    path &&
    path.split("/")[0] === ownerId &&
    !path.split("/").some((segment) => segment === "." || segment === "..")
  );
}
