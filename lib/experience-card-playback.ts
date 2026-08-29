export const EXPERIENCE_CARD_INTRO_SECONDS = 4.8;
export const EXPERIENCE_CARD_OUTRO_SECONDS = 5.5;
const TEXT_CHUNK_LENGTH = 60;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeRecordText(value?: string | null) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function findPreferredBreak(chars: string[], start: number, end: number) {
  const minimum = Math.max(start + Math.floor((end - start) * 0.58), start + 1);
  const preferred = new Set(["。", "！", "？", "；", "，", "、", ".", "!", "?", ";", ",", "\n"]);

  for (let index = end - 1; index >= minimum; index -= 1) {
    if (preferred.has(chars[index])) return index + 1;
  }

  return end;
}

export function splitExperienceCardVideoText(value?: string | null) {
  const normalized = normalizeRecordText(value);
  if (!normalized) return [];

  const chars = Array.from(normalized);
  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < chars.length) {
    const proposedEnd = Math.min(chars.length, cursor + TEXT_CHUNK_LENGTH);
    const end = proposedEnd === chars.length
      ? proposedEnd
      : findPreferredBreak(chars, cursor, proposedEnd);
    const chunk = chars.slice(cursor, end).join("").trim();
    if (chunk) chunks.push(chunk);
    cursor = end;
  }
  return chunks;
}

export function getExperienceCardSceneTextDuration(text: string) {
  return clamp(3.2 + Array.from(text).length / 9, 4.8, 12);
}

export function estimateExperienceCardPlaybackSeconds(
  records: Array<{ note?: string | null; imageCount: number }>,
) {
  const recordSeconds = records.reduce((total, record) => {
    const chunks = splitExperienceCardVideoText(record.note);
    const sceneCount = Math.max(Math.max(0, record.imageCount), chunks.length, 1);
    return total + Array.from({ length: sceneCount }).reduce<number>((sceneTotal, _value, index) => {
      const text = chunks.length ? chunks[Math.min(index, chunks.length - 1)] : "";
      return sceneTotal + (text ? getExperienceCardSceneTextDuration(text) : 3.8);
    }, 0);
  }, 0);

  return EXPERIENCE_CARD_INTRO_SECONDS + recordSeconds + EXPERIENCE_CARD_OUTRO_SECONDS;
}

export function formatCompactPlaybackDuration(seconds?: number | null) {
  const rounded = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.floor(rounded / 60);
  const remaining = rounded % 60;
  return `${minutes}:${String(remaining).padStart(2, "0")}`;
}
