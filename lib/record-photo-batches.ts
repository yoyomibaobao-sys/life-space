export const MAX_RECORD_PHOTOS_PER_ADD = 10;

export type TimedRecordPhoto<T> = {
  file: T;
  recordTimeISO: string;
  capturedAt: string | null;
};

export type RecordPhotoGroup<T> = {
  photos: TimedRecordPhoto<T>[];
  recordTimeISO: string;
};

export function limitRecordPhotoBatch<T>(
  items: T[],
  limit = MAX_RECORD_PHOTOS_PER_ADD,
) {
  const safeLimit = Math.max(1, Math.trunc(limit));

  return {
    accepted: items.slice(0, safeLimit),
    rejectedCount: Math.max(0, items.length - safeLimit),
  };
}

function timestamp(value: string) {
  const result = new Date(value).getTime();
  return Number.isFinite(result) ? result : 0;
}

function localDateKey(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function latestRecordTime<T>(photos: TimedRecordPhoto<T>[]) {
  return photos.reduce(
    (latest, photo) =>
      timestamp(photo.recordTimeISO) > timestamp(latest)
        ? photo.recordTimeISO
        : latest,
    photos[0]?.recordTimeISO || new Date().toISOString(),
  );
}

export function buildRecordPhotoGroups<T>(
  photos: TimedRecordPhoto<T>[],
  mergeIntoOneRecord: boolean,
): RecordPhotoGroup<T>[] {
  if (photos.length === 0) return [];

  if (mergeIntoOneRecord) {
    return [
      {
        photos,
        recordTimeISO: latestRecordTime(photos),
      },
    ];
  }

  const byDate = new Map<string, TimedRecordPhoto<T>[]>();

  for (const photo of photos) {
    const key = localDateKey(photo.recordTimeISO);
    const group = byDate.get(key) || [];
    group.push(photo);
    byDate.set(key, group);
  }

  return Array.from(byDate.values())
    .map((groupPhotos) => ({
      photos: groupPhotos,
      recordTimeISO: latestRecordTime(groupPhotos),
    }))
    .sort(
      (left, right) =>
        timestamp(left.recordTimeISO) - timestamp(right.recordTimeISO),
    );
}
