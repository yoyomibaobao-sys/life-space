export type PlantParameterLite = {
  sun_score?: number | null;
  soil_moisture_score?: number | null;
  drought_score?: number | null;
  optimal_growth_temp_min?: number | null;
  optimal_growth_temp_max?: number | null;
  frost_damage_temp?: number | null;
  lethal_low_temp?: number | null;
  shade_tolerance?: string | null;
  drought_tolerance?: string | null;
  container_friendly_score?: number | null;
  indoor_friendly_score?: number | null;
  balcony_friendly_score?: number | null;
  air_flow_score?: number | null;
  soil_aeration_score?: number | null;
  soil_fertility_score?: number | null;
};

export type EnvironmentFilters = {
  light: string;
  water: string;
  temperature: string;
  scene: string;
  indoor: string;
};

function numberValue(value: unknown) {
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function textValue(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function includesAny(value: unknown, keywords: string[]) {
  const text = textValue(value);
  if (!text) return false;
  return keywords.some((keyword) => text.includes(keyword));
}

function unique(items: string[]) {
  return Array.from(new Set(items.filter(Boolean)));
}

export function isSunLoving(parameters?: PlantParameterLite | null) {
  const sun = numberValue(parameters?.sun_score);
  return sun !== null && sun >= 7;
}

export function isShadeTolerant(parameters?: PlantParameterLite | null) {
  const sun = numberValue(parameters?.sun_score);
  return (
    (sun !== null && sun <= 3) ||
    includesAny(parameters?.shade_tolerance, [
      "high",
      "strong",
      "shade",
      "tolerant",
      "耐阴",
      "較耐陰",
      "较耐阴",
      "阴",
    ])
  );
}

export function isPartShadeFriendly(parameters?: PlantParameterLite | null) {
  const sun = numberValue(parameters?.sun_score);
  if (isShadeTolerant(parameters)) return false;
  return (
    (sun !== null && sun >= 4 && sun <= 6) ||
    includesAny(parameters?.shade_tolerance, [
      "moderate",
      "medium",
      "semi",
      "partial",
      "half",
      "半阴",
      "半陰",
      "中等",
    ])
  );
}

export function getLightLabel(parameters?: PlantParameterLite | null) {
  if (isSunLoving(parameters)) return "喜阳";
  if (isPartShadeFriendly(parameters)) return "半阴可种";
  if (isShadeTolerant(parameters)) return "耐阴";
  return null;
}

export function isMoistLoving(parameters?: PlantParameterLite | null) {
  const moisture = numberValue(parameters?.soil_moisture_score);
  return moisture !== null && moisture >= 7;
}

export function isDroughtTolerant(parameters?: PlantParameterLite | null) {
  const drought = numberValue(parameters?.drought_score);
  return (
    (drought !== null && drought >= 7) ||
    includesAny(parameters?.drought_tolerance, [
      "high",
      "strong",
      "drought",
      "xeric",
      "耐旱",
      "較耐旱",
      "较耐旱",
    ])
  );
}

export function getWaterLabel(parameters?: PlantParameterLite | null) {
  if (isMoistLoving(parameters)) return "喜湿";
  if (isDroughtTolerant(parameters)) return "耐旱";
  return null;
}

export function isHeatLoving(parameters?: PlantParameterLite | null) {
  const min = numberValue(parameters?.optimal_growth_temp_min);
  const max = numberValue(parameters?.optimal_growth_temp_max);
  return (max !== null && max >= 25) || (min !== null && min >= 18);
}

export function isCoolLoving(parameters?: PlantParameterLite | null) {
  const min = numberValue(parameters?.optimal_growth_temp_min);
  const max = numberValue(parameters?.optimal_growth_temp_max);
  return (max !== null && max <= 22) || (min !== null && min <= 12);
}

export function isColdHardy(parameters?: PlantParameterLite | null) {
  const lethalLow = numberValue(parameters?.lethal_low_temp);
  const frostDamage = numberValue(parameters?.frost_damage_temp);
  return (lethalLow !== null && lethalLow <= -5) || (frostDamage !== null && frostDamage <= -2);
}

export function isFrostSensitive(parameters?: PlantParameterLite | null) {
  const frostDamage = numberValue(parameters?.frost_damage_temp);
  return frostDamage !== null && frostDamage >= 1;
}

export function getTemperatureLabels(parameters?: PlantParameterLite | null) {
  const labels: string[] = [];

  if (isHeatLoving(parameters)) labels.push("喜热");
  if (isCoolLoving(parameters)) labels.push("喜凉");
  if (isColdHardy(parameters)) labels.push("耐寒");
  else if (isFrostSensitive(parameters)) labels.push("怕霜冻");

  return unique(labels);
}

export function isContainerFriendly(parameters?: PlantParameterLite | null) {
  const score = numberValue(parameters?.container_friendly_score);
  return score !== null && score >= 7;
}

export function isBalconyFriendly(parameters?: PlantParameterLite | null) {
  const score = numberValue(parameters?.balcony_friendly_score);
  return score !== null && score >= 7;
}

export function getSceneLabels(parameters?: PlantParameterLite | null) {
  const labels: string[] = [];

  if (isContainerFriendly(parameters)) labels.push("可盆栽");
  if (isBalconyFriendly(parameters)) labels.push("阳台友好");

  return unique(labels);
}

export function getIndoorSuitabilityTier(score: unknown) {
  const value = numberValue(score);
  if (value === null) return null;
  if (value <= 2) return "not_indoor";
  if (value <= 4) return "temporary_only";
  if (value <= 6) return "winter_only";
  return "long_term_ok";
}

export function getIndoorSuitabilityLabel(score: unknown) {
  const tier = getIndoorSuitabilityTier(score);

  if (tier === "not_indoor") return "不适合室内";
  if (tier === "temporary_only") return "可短期室内";
  if (tier === "winter_only") return "可室内过冬";
  if (tier === "long_term_ok") return "可长期室内";
  return null;
}

export function getAirflowLabel(parameters?: PlantParameterLite | null) {
  const score = numberValue(parameters?.air_flow_score);
  if (score === null) return null;
  if (score >= 8) return "喜通风";
  if (score >= 5) return "一般通风可种";
  return "通风要求低";
}

export function getSoilLabels(parameters?: PlantParameterLite | null) {
  const labels: string[] = [];
  const aeration = numberValue(parameters?.soil_aeration_score);
  const fertility = numberValue(parameters?.soil_fertility_score);

  if (aeration !== null && aeration >= 7) labels.push("喜疏松土");
  if (fertility !== null && fertility >= 7) labels.push("喜肥沃土");
  if (fertility !== null && fertility <= 3) labels.push("耐贫瘠");

  return unique(labels);
}

export function getEnvironmentTags(
  parameters?: PlantParameterLite | null,
  options?: { includeIndoor?: boolean }
) {
  const tags: string[] = [];
  const light = getLightLabel(parameters);
  const water = getWaterLabel(parameters);
  const temperature = getTemperatureLabels(parameters);
  const scenes = getSceneLabels(parameters);

  if (light) tags.push(light);
  if (water) tags.push(water);
  tags.push(...temperature);
  tags.push(...scenes);

  if (options?.includeIndoor) {
    const indoor = getIndoorSuitabilityLabel(parameters?.indoor_friendly_score);
    if (indoor) tags.push(indoor);
  }

  return unique(tags);
}

export function getEnvironmentDetailItems(parameters?: PlantParameterLite | null) {
  const light = getLightLabel(parameters);
  const water = getWaterLabel(parameters);
  const temperature = getTemperatureLabels(parameters);
  const scenes = getSceneLabels(parameters);
  const soil = getSoilLabels(parameters);
  const indoor = getIndoorSuitabilityLabel(parameters?.indoor_friendly_score);
  const airflow = getAirflowLabel(parameters);

  return [
    { label: "光照", value: light },
    { label: "水分", value: water },
    { label: "温度", value: temperature.length > 0 ? temperature.join(" · ") : null },
    { label: "土壤", value: soil.length > 0 ? soil.join(" · ") : null },
    { label: "通风", value: airflow },
    { label: "栽培场景", value: scenes.length > 0 ? scenes.join(" · ") : null },
    { label: "室内", value: indoor },
  ].filter((item) => item.value);
}

export function matchesEnvironmentFilters(
  parameters: PlantParameterLite | undefined,
  filters: EnvironmentFilters
) {
  if (filters.light === "sun" && !isSunLoving(parameters)) return false;
  if (filters.light === "part_shade" && !isPartShadeFriendly(parameters)) return false;
  if (filters.light === "shade" && !isShadeTolerant(parameters)) return false;

  if (filters.water === "moist" && !isMoistLoving(parameters)) return false;
  if (filters.water === "drought" && !isDroughtTolerant(parameters)) return false;

  if (filters.temperature === "heat" && !isHeatLoving(parameters)) return false;
  if (filters.temperature === "cool" && !isCoolLoving(parameters)) return false;
  if (filters.temperature === "cold" && !isColdHardy(parameters)) return false;
  if (filters.temperature === "frost_sensitive" && !isFrostSensitive(parameters)) return false;

  if (filters.scene === "container" && !isContainerFriendly(parameters)) return false;
  if (filters.scene === "balcony" && !isBalconyFriendly(parameters)) return false;

  if (filters.indoor !== "all") {
    const tier = getIndoorSuitabilityTier(parameters?.indoor_friendly_score);
    if (tier !== filters.indoor) return false;
  }

  return true;
}
