import type { User } from '@supabase/supabase-js';

export type SupabaseUser = User;

export type AppProfile = {
  id: string;
  email?: string | null;
  username?: string | null;
  avatar_url?: string | null;
  location?: string | null;
  country_code?: string | null;
  country_name?: string | null;
  region_name?: string | null;
  city_name?: string | null;
  level?: number | null;
  flower_count?: number | null;
  view_count?: number | null;
  storage_used?: number | null;
  storage_limit?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  is_public?: boolean | null;
};

export type PlantSpeciesSummary = {
  id: string;
  common_name?: string | null;
  scientific_name?: string | null;
  slug?: string | null;
  category?: string | null;
  sub_category?: string | null;
};

export type PlantPlanStatus = 'want' | 'preparing' | 'started' | 'abandoned';

export type PlantPlanLocationType =
  | 'indoor'
  | 'balcony'
  | 'garden'
  | 'terrace'
  | 'greenhouse'
  | 'field'
  | 'other';

export type PlantPlanRow = {
  id: string;
  user_id: string;
  species_id: string;
  status?: PlantPlanStatus | null;
  planned_start_date?: string | null;
  location_type?: PlantPlanLocationType | null;
  note?: string | null;
  created_archive_id?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  plant_species?: PlantSpeciesSummary | null;
};

export type PlantInterestRow = {
  id: string;
  user_id: string;
  species_id: string;
  note?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  plant_species?: PlantSpeciesSummary | null;
};

export type RecordTagRow = {
  record_id: string;
  tag: string;
  tag_type?: string | null;
  is_active?: boolean | null;
};

export type ProfileLocationRow = Pick<AppProfile, 'id' | 'location' | 'country_code' | 'country_name' | 'region_name' | 'city_name'>;
export type SpeciesIdRow = { id: string };
export type PlantI18nIdRow = { plant_id: string };
export type PlantAliasIdRow = { species_id: string };
export type RecordIdRow = { record_id: string };
export type SpeciesRefRow = { species_id: string };

export type MediaItem = {
  id: string;
  record_id?: string | null;
  user_id?: string | null;
  type?: string | null;
  url?: string | null;
  file_url?: string | null;
  path?: string | null;
  size_mb?: number | null;
  duration_sec?: number | null;
  storage_class?: string | null;
  sort_order?: number | null;
  created_at?: string | null;
};

export type PlantSpeciesAliasSearchRow = {
  species_id: string;
  alias_name?: string | null;
  normalized_name?: string | null;
};

export type CookieWriteOptions = {
  path?: string;
  maxAge?: number;
  expires?: Date;
  domain?: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: boolean | 'lax' | 'strict' | 'none';
};

