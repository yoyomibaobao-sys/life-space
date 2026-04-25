export type ActionMessage = {
  type: "success" | "error";
  text: string;
  href?: string;
  hrefText?: string;
};

export type PlantCardItem = {
  label: string;
  value: string | null;
  hint?: string | null;
};

export type PlantRecordItem = {
  record_id: string;
  archive_id: string;
  archive_title?: string | null;
  note?: string | null;
  primary_image_url?: string | null;
};


export type PlantSpeciesDetail = {
  id: string;
  common_name?: string | null;
  scientific_name?: string | null;
  description?: string | null;
  family?: string | null;
  category?: string | null;
  sub_category?: string | null;
  growth_type?: string | null;
  entry_type?: string | null;
  is_active?: boolean | null;
  sort_order?: number | null;
  created_at?: string | null;
};

export type PlantI18nItem = {
  plant_id: string;
  language_code: string;
  common_name?: string | null;
  description?: string | null;
  family?: string | null;
};

export type PlantAliasItem = {
  species_id: string;
  alias_name?: string | null;
};

export type PlantParameterRow = {
  species_id: string;
  management_difficulty_score?: number | null;
  ph_sensitivity_score?: number | null;
  ph_min?: number | null;
  ph_max?: number | null;
  sun_score?: number | null;
  air_humidity_score?: number | null;
  air_flow_score?: number | null;
  soil_moisture_score?: number | null;
  soil_aeration_score?: number | null;
  soil_fertility_score?: number | null;
  drought_score?: number | null;
  growth_speed_score?: number | null;
  disease_risk_score?: number | null;
  best_germ_temp_min?: number | null;
  best_germ_temp_max?: number | null;
  optimal_growth_temp_min?: number | null;
  optimal_growth_temp_max?: number | null;
  vigorous_growth_temp?: number | null;
  growth_slow_temp?: number | null;
  frost_damage_temp?: number | null;
  lethal_low_temp?: number | null;
  stop_low_temp?: number | null;
  stop_high_temp?: number | null;
  heat_scorch_temp?: number | null;
  lethal_high_temp?: number | null;
  photoperiod_type?: string | null;
  photoperiod_sensitivity_score?: number | null;
  critical_day_length_hours?: number | null;
  photoperiod_trigger_stage?: string | string[] | null;
  temperature_note?: string | null;
  photoperiod_note?: string | null;
  [key: string]: unknown;
};

export type PlantCareGuideRow = {
  plant_id: string;
  language_code?: string | null;
  summary?: string | null;
  climate_timing_note?: string | null;
  planting_guide?: string | null;
  care_guide?: string | null;
  harvest_guide?: string | null;
  common_problem_guide?: string | null;
  rotation_intercrop_guide?: string | null;
};

export type PlantSpeciesRow = PlantSpeciesDetail;
export type PlantSpeciesI18nRow = PlantI18nItem;
export type PlantAliasRow = PlantAliasItem;
export type PlantParametersRow = PlantParameterRow;

