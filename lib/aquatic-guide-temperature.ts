import type { PublicGuideEntry } from "./public-guide-library";

type TemperatureReference = {
  min: number;
  max: number;
  species: string;
  source?: { title: string; url: string };
};

export function getAquaticTemperatureReference(
  entry: Pick<PublicGuideEntry, "content"> & Partial<PublicGuideEntry>,
): TemperatureReference | null {
  const content = entry.content;
  const filters = content && typeof content === "object" && "filters" in content ? content.filters : null;
  if (filters && typeof filters === "object" && ("temperature_min_c" in filters || "temperature_max_c" in filters)) {
    const min = "temperature_min_c" in filters ? filters.temperature_min_c : undefined;
    const max = "temperature_max_c" in filters ? filters.temperature_max_c : undefined;
    if (typeof min === "number" && typeof max === "number" && Number.isFinite(min) && Number.isFinite(max) && min <= max && min >= 0 && max <= 50) {
      return { min, max, species: entry.name || "" };
    }
    // An explicit invalid range must not silently be replaced by a preset.
    return null;
  }
  return null;
}

export const aquaticTemperatureBands: Record<string, readonly [number, number]> = {
  c0_10: [0, 10],
  c10_18: [10, 18],
  c18_22: [18, 22],
  c22_26: [22, 26],
  c26_30: [26, 30],
  c30_plus: [30, 50],
};

type TemperatureRange = { min: number; max: number };

function getAquaticTemperatureMatch(
  entry: Parameters<typeof getAquaticTemperatureReference>[0],
  selected: string,
): TemperatureRange | null {
  const range = getAquaticTemperatureReference(entry);
  const band = aquaticTemperatureBands[selected];
  if (!range || !band) return null;
  const min = Math.max(range.min, band[0]);
  const max = Math.min(range.max, band[1]);
  // Touching at a single endpoint is not a useful overlapping growth range.
  return min < max ? { min, max } : null;
}

export function matchesAquaticTemperature(entry: Parameters<typeof getAquaticTemperatureReference>[0], selected: string) {
  if (selected === "unknown") return getAquaticTemperatureReference(entry) === null;
  return getAquaticTemperatureMatch(entry, selected) !== null;
}

export function getAquaticTemperatureMatches(
  entry: Parameters<typeof getAquaticTemperatureReference>[0],
  selected: string | readonly string[],
): TemperatureRange[] {
  const choices = typeof selected === "string" ? [selected] : selected;
  if (choices.includes("all")) return [];
  const matches = choices
    .map((choice) => getAquaticTemperatureMatch(entry, choice))
    .filter((range): range is TemperatureRange => range !== null)
    .sort((left, right) => left.min - right.min);
  const merged: TemperatureRange[] = [];
  for (const range of matches) {
    const previous = merged.at(-1);
    if (previous && range.min <= previous.max) previous.max = Math.max(previous.max, range.max);
    else merged.push({ ...range });
  }
  return merged;
}
