import type { AppProfile } from "@/lib/domain-types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type CountryOption = {
  code: string;
  name: string;
};

export type RegionOption = {
  value: string;
  label: string;
};

export const countryOptions: CountryOption[] = [
  { code: "CN", name: "中国" },
  { code: "JP", name: "日本" },
  { code: "US", name: "美国" },
  { code: "GB", name: "英国" },
  { code: "CA", name: "加拿大" },
  { code: "AU", name: "澳大利亚" },
  { code: "NZ", name: "新西兰" },
  { code: "DE", name: "德国" },
  { code: "FR", name: "法国" },
  { code: "IT", name: "意大利" },
  { code: "ES", name: "西班牙" },
  { code: "SG", name: "新加坡" },
  { code: "MY", name: "马来西亚" },
  { code: "TH", name: "泰国" },
  { code: "KR", name: "韩国" },
  { code: "VN", name: "越南" },
  { code: "OTHER", name: "其他地区" },
];

const regionPresets: Record<string, RegionOption[]> = {
  CN: ["北京", "天津", "上海", "重庆", "河北", "山西", "辽宁", "吉林", "黑龙江", "江苏", "浙江", "安徽", "福建", "江西", "山东", "河南", "湖北", "湖南", "广东", "海南", "四川", "贵州", "云南", "陕西", "甘肃", "青海", "台湾", "内蒙古", "广西", "西藏", "宁夏", "新疆", "香港", "澳门"].map((item) => ({ value: item, label: item })),
  JP: ["北海道", "东北", "关东", "中部", "近畿", "中国", "四国", "九州", "冲绳", "东京", "神奈川", "埼玉", "千叶", "大阪", "京都", "兵库", "爱知", "福冈"].map((item) => ({ value: item, label: item })),
  US: ["California", "New York", "Texas", "Florida", "Washington", "Oregon", "Hawaii", "Alaska", "Illinois", "Virginia", "North Carolina", "Massachusetts"].map((item) => ({ value: item, label: item })),
  GB: ["England", "Scotland", "Wales", "Northern Ireland"].map((item) => ({ value: item, label: item })),
  CA: ["British Columbia", "Alberta", "Ontario", "Quebec", "Nova Scotia"].map((item) => ({ value: item, label: item })),
  AU: ["New South Wales", "Victoria", "Queensland", "Western Australia", "South Australia", "Tasmania", "Australian Capital Territory", "Northern Territory"].map((item) => ({ value: item, label: item })),
  NZ: ["North Island", "South Island", "Auckland", "Wellington", "Canterbury"].map((item) => ({ value: item, label: item })),
  DE: ["Bayern", "Berlin", "Hamburg", "Hessen", "Nordrhein-Westfalen", "Sachsen"].map((item) => ({ value: item, label: item })),
  FR: ["Île-de-France", "Nouvelle-Aquitaine", "Occitanie", "Provence-Alpes-Côte d'Azur"].map((item) => ({ value: item, label: item })),
  IT: ["Lombardia", "Lazio", "Toscana", "Sicilia", "Veneto"].map((item) => ({ value: item, label: item })),
  ES: ["Andalucía", "Cataluña", "Comunidad de Madrid", "Valencia", "Galicia"].map((item) => ({ value: item, label: item })),
  KR: ["首尔", "京畿道", "釜山", "济州", "江原"].map((item) => ({ value: item, label: item })),
};

export function normalizeRegionPart(value?: string | null) {
  return String(value || "")
    .replace(/[·•]/g, " ")
    .replace(/[，、；;｜|/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getCountryOption(code?: string | null) {
  return countryOptions.find((item) => item.code === code) || null;
}

export function getCountryName(code?: string | null, fallbackName?: string | null) {
  if (code === "OTHER") return normalizeRegionPart(fallbackName);
  return getCountryOption(code)?.name || normalizeRegionPart(fallbackName);
}

export function getRegionOptions(countryCode?: string | null) {
  return regionPresets[String(countryCode || "")] || [];
}

export function hasPresetRegions(countryCode?: string | null) {
  return getRegionOptions(countryCode).length > 0;
}

export function parseLegacyLocation(location?: string | null) {
  const normalized = normalizeRegionPart(location);
  if (!normalized) {
    return {
      countryCode: "",
      countryName: "",
      regionName: "",
      cityName: "",
    };
  }

  const parts = normalized
    .split(/[\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  const matchedCountry = countryOptions.find((country) => country.code !== "OTHER" && parts[0] === country.name);

  if (matchedCountry) {
    return {
      countryCode: matchedCountry.code,
      countryName: matchedCountry.name,
      regionName: parts[1] || "",
      cityName: parts.slice(2).join(" "),
    };
  }

  return {
    countryCode: "OTHER",
    countryName: parts[0] || normalized,
    regionName: parts[1] || "",
    cityName: parts.slice(2).join(" "),
  };
}

export function buildRegionDisplay(parts: {
  countryCode?: string | null;
  countryName?: string | null;
  regionName?: string | null;
  cityName?: string | null;
  location?: string | null;
}) {
  const country = getCountryName(parts.countryCode, parts.countryName);
  const region = normalizeRegionPart(parts.regionName);
  const city = normalizeRegionPart(parts.cityName);
  const values = [country, region, city].filter(Boolean);
  if (values.length) return values.join(" · ");
  const fallback = normalizeRegionPart(parts.location);
  return fallback || "未填写";
}

export function formatRegionDisplayFromProfile(profile?: AppProfile | null) {
  return buildRegionDisplay({
    countryCode: profile?.country_code,
    countryName: profile?.country_name,
    regionName: profile?.region_name,
    cityName: profile?.city_name,
    location: profile?.location,
  });
}

export function buildLocationTextFromFields(parts: {
  countryCode?: string | null;
  countryName?: string | null;
  regionName?: string | null;
  cityName?: string | null;
}) {
  const country = getCountryName(parts.countryCode, parts.countryName);
  const region = normalizeRegionPart(parts.regionName);
  const city = normalizeRegionPart(parts.cityName);
  return [country, region, city].filter(Boolean).join(" ");
}

export function makeRegionSearchText(parts: {
  countryCode?: string | null;
  countryName?: string | null;
  regionName?: string | null;
  cityName?: string | null;
}) {
  return [
    getCountryName(parts.countryCode, parts.countryName),
    normalizeRegionPart(parts.regionName),
    normalizeRegionPart(parts.cityName),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export async function findUserIdsByRegionFilters(
  supabase: SupabaseClient<any, "public", any>,
  filters: {
    countryCode?: string | null;
    countryName?: string | null;
    regionName?: string | null;
    cityName?: string | null;
  }
) {
  const countryCode = String(filters.countryCode || "").trim();
  const countryName = normalizeRegionPart(filters.countryName);
  const regionName = normalizeRegionPart(filters.regionName);
  const cityName = normalizeRegionPart(filters.cityName);
  const keywords = [getCountryName(countryCode, countryName), regionName, cityName].filter(Boolean);

  if (!keywords.length) return [] as string[];

  let query = supabase
    .from("profiles")
    .select("id, location, country_code, country_name, region_name, city_name")
    .limit(500);

  if (countryCode && countryCode !== "OTHER") {
    query = query.eq("country_code", countryCode);
  } else if (countryName) {
    query = query.ilike("country_name", `%${countryName}%`);
  }

  if (regionName) {
    query = query.ilike("region_name", `%${regionName}%`);
  }

  if (cityName) {
    query = query.ilike("city_name", `%${cityName}%`);
  }

  const { data, error } = await query;
  if (error) {
    console.error("region search profile error:", error);
    return [] as string[];
  }

  const ids = new Set<string>();
  const lowerKeywords = keywords.map((item) => item.toLowerCase());

  for (const row of data || []) {
    const text = makeRegionSearchText({
      countryCode: row.country_code,
      countryName: row.country_name,
      regionName: row.region_name,
      cityName: row.city_name,
    }) || String(row.location || "").toLowerCase();

    if (lowerKeywords.every((keyword) => text.includes(keyword))) {
      ids.add(String(row.id));
    }
  }

  return Array.from(ids);
}
