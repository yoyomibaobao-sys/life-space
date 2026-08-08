import { attachMediaDisplayUrls } from "@/lib/media-urls";
import { supabase } from "@/lib/supabase";
import { formatCardDate, getInclusiveDaySpan } from "@/lib/date-time";
import type {
  ExperienceCardArchive,
  ExperienceCardAuthor,
  ExperienceCardDetail,
  ExperienceCardMedia,
  ExperienceCardInteractionSummary,
  ExperienceCardListItem,
  ExperienceCardRow,
  ExperienceCardSaveInput,
  ExperienceCardSourceRecord,
} from "@/lib/experience-card-types";

type ExperienceCardListArchiveRow = {
  id: string;
  title: string | null;
  category: string | null;
  system_name: string | null;
  species_name_snapshot: string | null;
  cover_image_url: string | null;
  cover_image_path: string | null;
  cover_thumb_url: string | null;
  cover_thumb_path: string | null;
};

type ExperienceCardListProfileRow = {
  id: string;
  username: string | null;
  avatar_url: string | null;
  country_code: string | null;
  country_name: string | null;
  region_name: string | null;
  city_name: string | null;
};

type ExperienceCardListRelationRow = {
  card_id: string;
  record_id: string;
};

type ExperienceCardRecordTimeRow = {
  id: string;
  record_time: string | null;
};

const CARD_RECORD_SELECT = [
  "id",
  "archive_id",
  "user_id",
  "note",
  "record_time",
  "created_at",
  "visibility",
  "status_tag",
  "record_tags(tag, tag_type, source, is_active)",
].join(", ");

const CARD_MEDIA_SELECT = [
  "id",
  "record_id",
  "user_id",
  "type",
  "url",
  "storage_path",
  "thumb_url",
  "thumb_path",
  "sort_order",
  "created_at",
  "captured_at",
  "mime_type",
  "width",
  "height",
].join(", ");

function firstBoolean(data: unknown) {
  if (Array.isArray(data)) return Boolean(data[0]);
  return Boolean(data);
}

export function formatExperienceCardDate(value?: string | null) {
  return formatCardDate(value);
}

function joinExperienceCardRegion(profile?: ExperienceCardListProfileRow) {
  return [profile?.country_name, profile?.region_name, profile?.city_name]
    .filter(Boolean)
    .join(" · ");
}

export async function hydrateExperienceCardListItems(
  rows: ExperienceCardRow[]
): Promise<ExperienceCardListItem[]> {
  if (rows.length === 0) return [];

  const archiveIds = Array.from(new Set(rows.map((row) => row.archive_id)));
  const authorIds = Array.from(new Set(rows.map((row) => row.user_id)));
  const cardIds = rows.map((row) => row.id);

  const [archiveResult, profileResult, relationResult, interactionResult] = await Promise.all([
    supabase
      .from("archives")
      .select(
        "id, title, category, system_name, species_name_snapshot, cover_image_url, cover_image_path, cover_thumb_url, cover_thumb_path"
      )
      .in("id", archiveIds),
    supabase
      .from("public_profiles")
      .select(
        "id, username, avatar_url, country_code, country_name, region_name, city_name"
      )
      .in("id", authorIds),
    supabase
      .from("experience_card_records")
      .select("card_id, record_id")
      .in("card_id", cardIds),
    supabase.rpc("get_experience_card_interaction_summaries", {
      p_card_ids: cardIds,
    }),
  ]);

  const archives = (archiveResult.data || []) as ExperienceCardListArchiveRow[];
  const profiles = (profileResult.data || []) as ExperienceCardListProfileRow[];
  const relations = (relationResult.data || []) as ExperienceCardListRelationRow[];
  const interactionRows = (interactionResult.data || []) as ExperienceCardInteractionSummary[];
  const archiveById = new Map(archives.map((archive) => [archive.id, archive]));
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const recordIds = Array.from(new Set(relations.map((row) => row.record_id)));
  const mediaByRecord = new Map<string, ExperienceCardMedia[]>();
  const recordTimeById = new Map<string, string>();

  if (recordIds.length > 0) {
    const [{ data: recordTimeData }, { data: mediaData }] = await Promise.all([
      supabase
        .from("records")
        .select("id, record_time")
        .in("id", recordIds),
      supabase
        .from("media")
        .select(CARD_MEDIA_SELECT)
        .in("record_id", recordIds)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
    ]);
    ((recordTimeData || []) as ExperienceCardRecordTimeRow[]).forEach((record) => {
      if (record.record_time) recordTimeById.set(record.id, record.record_time);
    });
    const mediaRows = await attachMediaDisplayUrls(
      supabase,
      (mediaData || []) as unknown as ExperienceCardMedia[]
    );

    mediaRows.forEach((media) => {
      const list = mediaByRecord.get(media.record_id) || [];
      list.push(media);
      mediaByRecord.set(media.record_id, list);
    });
  }

  const archiveCoverRows = await attachMediaDisplayUrls(
    supabase,
    archives.map((archive) => ({
      id: archive.id,
      url: archive.cover_image_url,
      storage_path: archive.cover_image_path,
      thumb_url: archive.cover_thumb_url,
      thumb_path: archive.cover_thumb_path,
    }))
  );
  const archiveCoverById = new Map(
    archiveCoverRows.map((archive) => [
      archive.id,
      archive.display_thumb_url || archive.display_url || null,
    ])
  );
  const recordIdsByCard = new Map<string, string[]>();
  relations.forEach((relation) => {
    const list = recordIdsByCard.get(relation.card_id) || [];
    list.push(relation.record_id);
    recordIdsByCard.set(relation.card_id, list);
  });
  const interactionByCard = new Map(
    interactionRows.map((summary) => [summary.card_id, summary])
  );

  return rows.map((row) => {
    const archive = archiveById.get(row.archive_id);
    const profile = profileById.get(row.user_id);
    const relatedRecordIds = recordIdsByCard.get(row.id) || [];
    const relatedMedia = relatedRecordIds.flatMap(
      (recordId) => mediaByRecord.get(recordId) || []
    );
    const preferredCover = row.cover_media_id
      ? relatedMedia.find((media) => media.id === row.cover_media_id)
      : null;
    const firstSourceCover = relatedRecordIds
      .map((recordId) => mediaByRecord.get(recordId)?.[0])
      .find(Boolean);
    const cover = preferredCover || firstSourceCover;
    const sortedRecordTimes = relatedRecordIds
      .map((recordId) => recordTimeById.get(recordId))
      .filter((value): value is string => Boolean(value))
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    const periodStart = sortedRecordTimes[0] || null;
    const periodEnd = sortedRecordTimes[sortedRecordTimes.length - 1] || null;
    const interaction = interactionByCard.get(row.id);

    return {
      ...row,
      archiveTitle: archive?.title?.trim() || "来源暂不可用",
      sourceAvailable: Boolean(archive),
      archiveCategory: archive?.category || null,
      systemName:
        archive?.system_name?.trim() ||
        archive?.species_name_snapshot?.trim() ||
        null,
      coverUrl:
        cover?.display_thumb_url ||
        cover?.display_url ||
        archiveCoverById.get(row.archive_id) ||
        null,
      authorName: profile?.username?.trim() || "用户",
      authorAvatarUrl: profile?.avatar_url || null,
      authorRegion: joinExperienceCardRegion(profile),
      authorCountryCode: profile?.country_code || null,
      authorCountryName: profile?.country_name || null,
      authorRegionName: profile?.region_name || null,
      authorCityName: profile?.city_name || null,
      durationDays: getInclusiveDaySpan(periodStart, periodEnd),
      periodStart,
      periodEnd,
      commentCount: Number(interaction?.comment_count || 0),
      bookmarkCount: Number(interaction?.bookmark_count || 0),
      helpfulCount: Number(interaction?.helpful_count || 0),
      bookmarkedByMe: Boolean(interaction?.bookmarked_by_me),
      helpfulByMe: Boolean(interaction?.helpful_by_me),
    };
  });
}

export function getExperienceCardStageLabel(index: number, count: number) {
  if (index === 0) return "起点";
  if (index === count - 1) return "结果";
  return "过程";
}

export function getExperienceCardErrorText(error: unknown) {
  const message =
    typeof error === "object" && error && "message" in error
      ? String(error.message || "")
      : String(error || "");

  if (message.includes("experience_card_cloud_access_required")) {
    return "需要开通云会员才能创建、修改或发布经验卡。";
  }
  if (message.includes("experience_card_record_count_invalid")) {
    return "请至少选择3条记录。";
  }
  if (message.includes("experience_card_records_must_share_archive")) {
    return "所选记录必须来自同一个项目，且不能处于回收站中。";
  }
  if (message.includes("experience_card_cover_invalid")) {
    return "封面必须来自当前所选记录的照片。";
  }
  if (message.includes("experience_card_source_changed")) {
    return "来源记录已经变化，请重新检查并保存草稿。";
  }
  if (
    message.includes("experience_card_not_found_or_forbidden") ||
    message.includes("experience_card_archive_not_found")
  ) {
    return "经验卡或来源项目不存在，或者你没有操作权限。";
  }
  if (message.includes("experience_card_title_invalid")) {
    return "标题需为1～120个字符。";
  }

  return "操作失败，请稍后重试。";
}

export async function saveExperienceCard(input: ExperienceCardSaveInput) {
  const { data, error } = await supabase.rpc("save_experience_card", {
    p_card_id: input.cardId || null,
    p_archive_id: input.archiveId,
    p_title: input.title.trim(),
    p_record_ids: input.recordIds,
    p_cover_media_id: input.coverMediaId || null,
  });

  if (error) throw error;
  if (typeof data !== "string" || !data) {
    throw new Error("experience_card_save_failed");
  }
  return data;
}

export async function publishExperienceCard(cardId: string) {
  const { data, error } = await supabase.rpc("publish_experience_card", {
    p_card_id: cardId,
  });
  if (error) throw error;
  return firstBoolean(data);
}

export async function unpublishExperienceCard(cardId: string) {
  const { data, error } = await supabase.rpc("unpublish_experience_card", {
    p_card_id: cardId,
  });
  if (error) throw error;
  return firstBoolean(data);
}

export async function deleteExperienceCard(cardId: string) {
  const { data, error } = await supabase.rpc("delete_experience_card", {
    p_card_id: cardId,
  });
  if (error) throw error;
  return firstBoolean(data);
}

export async function loadExperienceCard(
  cardId: string
): Promise<ExperienceCardDetail | null> {
  const { data: cardData, error: cardError } = await supabase
    .from("experience_cards")
    .select("*")
    .eq("id", cardId)
    .maybeSingle();

  if (cardError || !cardData) return null;
  const card = cardData as ExperienceCardRow;

  const [
    relationResult,
    archiveResult,
    authorResult,
    publicResult,
  ] = await Promise.all([
    supabase
      .from("experience_card_records")
      .select("record_id")
      .eq("card_id", card.id),
    supabase
      .from("archives")
      .select(
        "id, user_id, title, category, species_id, system_name, species_name_snapshot, is_public"
      )
      .eq("id", card.archive_id)
      .maybeSingle(),
    supabase
      .from("public_profiles")
      .select("id, username, avatar_url, account_number")
      .eq("id", card.user_id)
      .maybeSingle(),
    supabase.rpc("is_experience_card_public", { p_card_id: card.id }),
  ]);

  if (!archiveResult.data) return null;

  const recordIds = (relationResult.data || [])
    .map((row) => row.record_id)
    .filter((id): id is string => typeof id === "string" && Boolean(id));

  let records: ExperienceCardSourceRecord[] = [];
  if (recordIds.length > 0) {
    const { data: recordData } = await supabase
      .from("records")
      .select(CARD_RECORD_SELECT)
      .in("id", recordIds)
      .eq("archive_id", card.archive_id)
      .order("record_time", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });

    const rows = (recordData || []) as unknown as Omit<
      ExperienceCardSourceRecord,
      "media"
    >[];
    const visibleRecordIds = rows.map((row) => row.id);
    const mediaByRecord = new Map<string, ExperienceCardMedia[]>();

    if (visibleRecordIds.length > 0) {
      const { data: mediaData } = await supabase
        .from("media")
        .select(CARD_MEDIA_SELECT)
        .in("record_id", visibleRecordIds)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });

      const mediaRows = await attachMediaDisplayUrls(
        supabase,
        (mediaData || []) as unknown as ExperienceCardMedia[]
      );

      mediaRows.forEach((item) => {
        const list = mediaByRecord.get(item.record_id) || [];
        list.push(item);
        mediaByRecord.set(item.record_id, list);
      });
    }

    records = rows.map((row) => ({
      ...row,
      media: mediaByRecord.get(row.id) || [],
    }));
  }

  const allMedia = records.flatMap((record) => record.media);
  const cover =
    allMedia.find((item) => item.id === card.cover_media_id) ||
    allMedia[0] ||
    null;

  return {
    card,
    archive: archiveResult.data as ExperienceCardArchive,
    author: (authorResult.data || null) as ExperienceCardAuthor | null,
    records,
    cover,
    isPubliclyAvailable:
      !publicResult.error && firstBoolean(publicResult.data),
    sourceIsComplete:
      recordIds.length === Number(card.source_record_count) &&
      records.length === Number(card.source_record_count),
  };
}
