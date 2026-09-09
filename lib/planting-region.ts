import { loadRememberedLocalOwnerContext } from "@/lib/local-owner-context";
import { getCountryName } from "@/lib/region-shared";
import type { Language } from "@/lib/i18n";

/** Coarse project region only. Never copy record GPS or a street address here. */
export type PlantingRegion = {
  country_code: string;
  country_name: string;
  region_name: string;
  city_name: string;
};
export const EMPTY_PLANTING_REGION: PlantingRegion = { country_code: "", country_name: "", region_name: "", city_name: "" };
const PREFIX = "lifespace:planting-region-default:v1:";

export function normalizePlantingRegion(value: unknown): PlantingRegion | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const result = { ...EMPTY_PLANTING_REGION };
  for (const key of Object.keys(result) as (keyof PlantingRegion)[]) {
    const part = input[key];
    if (part != null && typeof part !== "string") return null;
    const text = String(part || "").trim();
    if (text.length > 80 || /[\u0000-\u001f\u007f]/.test(text)) return null;
    result[key] = text;
  }
  if (!/^([A-Z]{2}|OTHER)$/.test(result.country_code) || !result.city_name) return null;
  if (result.country_code === "OTHER" && !result.country_name) return null;
  return result;
}

export function formatPlantingRegion(value: unknown, language: Language = "zh") {
  const region = normalizePlantingRegion(value);
  if (!region) return "";
  return [getCountryName(region.country_code, region.country_name, language), region.region_name, region.city_name].filter(Boolean).join(" · ");
}

export function rememberDefaultPlantingRegion(userId: string, profile: unknown) {
  if (typeof window === "undefined" || !userId) return;
  try { localStorage.setItem(PREFIX + userId, JSON.stringify(normalizePlantingRegion(profile))); } catch { /* Optional default only. */ }
}

export function loadDefaultPlantingRegion(userId = loadRememberedLocalOwnerContext()?.userId): PlantingRegion | null {
  if (typeof window === "undefined" || !userId) return null;
  try { return normalizePlantingRegion(JSON.parse(localStorage.getItem(PREFIX + userId) || "null")); } catch { return null; }
}
