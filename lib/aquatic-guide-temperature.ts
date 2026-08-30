import type { PublicGuideEntry } from "./public-guide-library";

type TemperatureReference = {
  min: number;
  max: number;
  species: string;
  source?: { title: string; url: string };
};

// Published ranges for named examples, not universal tolerances for a common
// name/genus. Unverified entries stay unknown instead of inheriting numbers
// from the old qualitative "warm/temperate" tags.
const references: Record<string, TemperatureReference> = {
  莫斯: reference(22, 28, "Taxiphyllum barbieri", "https://dennerleplants.com/en/plants/plantdetails/Taxiphyllum-barbieri-%2830192%29/23040"),
  水榕: reference(22, 28, "Anubias barteri var. nana", "https://dennerleplants.com/en/plants/plantdetails/Anubiasbarterivar.nana(781)/27804"),
  椒草: reference(20, 28, "Cryptocoryne wendtii 'Green'", "https://dennerleplants.com/en/plants/plantdetails/Cryptocoryne-wendtii-%27Green%27-%28411%29/27846"),
  皇冠草: reference(22, 28, "Echinodorus grisebachii 'Bleherae'", "https://dennerleplants.com/en/plants/plantdetails/Echinodorus-grisebachii-%27Bleherae%27-%28154%29/23002"),
  矮珍珠: reference(18, 26, "Hemianthus callitrichoides 'Cuba'", "https://dennerleplants.com/en/plants/plantdetails/Hemianthus-callitrichoides-%27Cuba%27-%28444%29/27872"),
  牛毛毡: reference(12, 26, "Eleocharis pusilla", "https://dennerleplants.co.uk/products/eleocharis-pusilla"),
  宫廷草: reference(18, 28, "Rotala rotundifolia", "https://dennerleplants.com/en/plants/plantdetails/Rotalarotundifolia(915)/30724"),
  红蝴蝶: reference(22, 28, "Rotala macrandra 'Bangladesh'", "https://dennerleplants.co.uk/products/rotala-macrandra-bangladesh"),
  金鱼藻: reference(1, 28, "Ceratophyllum demersum", "https://dennerleplants.com/en/plants/plantdetails/Ceratophyllumdemersum(764)/22989"),
  狐尾藻: reference(23, 25, "Myriophyllum mattogrossense", "https://dennerleplants.co.uk/products/myriophyllum-mattogrossense"),
};

function reference(min: number, max: number, species: string, url: string): TemperatureReference {
  return { min, max, species, source: { title: `Dennerle — ${species}`, url } };
}

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
  if (entry.source !== "preset" || entry.category !== "insect_fish" || entry.content_template !== "aquatic_plant") return null;
  return entry.name ? references[entry.name] || null : null;
}

export const aquaticTemperatureBands: Record<string, readonly [number, number]> = {
  c18_22: [18, 22],
  c22_26: [22, 26],
  c26_30: [26, 30],
};

export function matchesAquaticTemperature(entry: Parameters<typeof getAquaticTemperatureReference>[0], selected: string) {
  const range = getAquaticTemperatureReference(entry);
  if (selected === "unknown") return range === null;
  const band = aquaticTemperatureBands[selected];
  // Touching at a single endpoint is not a useful overlapping growth range.
  return Boolean(range && band && Math.max(range.min, band[0]) < Math.min(range.max, band[1]));
}
