import { supabase } from "@/lib/supabase";
import { isMissingDatabaseFunction } from "@/lib/supabase-schema-compat";
import { loadGuideDirectoryRows } from "@/lib/guide-directory-search";

export type PlantBasicOverviewCompatRow = {
  species_id: string;
  summary?: string | null;
};

export type PublicPlantCatalogRow = {
  id: string;
  slug?: string | null;
  common_name?: string | null;
  scientific_name?: string | null;
  family?: string | null;
  category?: string | null;
  sub_category?: string | null;
  growth_type?: string | null;
  entry_type?: string | null;
  sort_order?: number | null;
  is_active: boolean;
  aliases: Array<{ species_id: string; alias_name: string; relation_type?: string | null }>;
  translations: Array<{ plant_id: string; language_code: string; common_name?: string | null; family?: string | null }>;
  summary_zh?: string | null;
  summary_en?: string | null;
};

export function loadPublicPlantCatalogPage(from: number, to: number) {
  return supabase.rpc("get_public_plant_catalog", {
    p_lookup: null,
    p_offset: from,
    p_limit: to - from + 1,
  });
}

export async function loadPublicPlantCatalogDetail(lookup: string) {
  const direct = await supabase.rpc("get_public_plant_catalog", {
    p_lookup: lookup,
    p_offset: 0,
    p_limit: 1,
  });
  if (direct.error || direct.data?.length) return direct;

  // Built-in directory labels can be exact aliases rather than species names.
  // Resolve only a unique active species through the same public, basic-only RPC.
  const catalog = await loadGuideDirectoryRows<PublicPlantCatalogRow>(loadPublicPlantCatalogPage);
  if (catalog.error) return { ...direct, error: catalog.error };
  const name = lookup.normalize("NFKC").trim().toLowerCase();
  const matches = catalog.data.filter((plant) =>
    plant.is_active && plant.aliases?.some((alias) =>
      alias.relation_type === "exact" && alias.alias_name.normalize("NFKC").trim().toLowerCase() === name
    )
  );
  return matches.length === 1 ? { ...direct, data: matches } : direct;
}

export type PlantCoreParametersCompatRow = {
  species_id: string;
  sun_score?: number | null;
  need_trellis?: boolean | null;
  container_friendly_score?: number | null;
  indoor_friendly_score?: number | null;
  balcony_friendly_score?: number | null;
};

type PlantOverviewFallbackRow = {
  id: string;
  description?: string | null;
};

type CareGuideOverviewFallbackRow = {
  plant_id: string;
  summary?: string | null;
};

export async function loadPlantBasicOverviewsCompat(
  speciesId: string | null,
  languageCode: "zh" | "en" = "zh",
): Promise<PlantBasicOverviewCompatRow[]> {
  const rpcResult = await supabase.rpc("get_plant_basic_overviews", {
    p_species_id: speciesId,
    p_language_code: languageCode,
  });

  if (!isMissingDatabaseFunction(rpcResult.error, "get_plant_basic_overviews")) {
    return (rpcResult.data || []) as PlantBasicOverviewCompatRow[];
  }

  let speciesQuery = supabase
    .from("plant_species")
    .select("id, description")
    .eq("is_active", true);
  let careGuideQuery = supabase
    .from("plant_care_guides")
    .select("plant_id, summary")
    .eq("language_code", languageCode);

  if (speciesId) {
    speciesQuery = speciesQuery.eq("id", speciesId);
    careGuideQuery = careGuideQuery.eq("plant_id", speciesId);
  }

  const [speciesResult, careGuideResult] = await Promise.all([
    speciesQuery,
    careGuideQuery,
  ]);
  const guideSummaryBySpecies = new Map(
    ((careGuideResult.data || []) as CareGuideOverviewFallbackRow[]).map(
      (guide) => [guide.plant_id, guide.summary || null]
    )
  );

  return ((speciesResult.data || []) as PlantOverviewFallbackRow[]).map(
    (species) => ({
      species_id: species.id,
      summary:
        guideSummaryBySpecies.get(species.id) || species.description || null,
    })
  );
}

export async function loadPlantCoreParametersCompat(
  speciesId: string | null
): Promise<PlantCoreParametersCompatRow[]> {
  const rpcResult = await supabase.rpc("get_plant_core_parameters", {
    p_species_id: speciesId,
  });

  if (!isMissingDatabaseFunction(rpcResult.error, "get_plant_core_parameters")) {
    return (rpcResult.data || []) as PlantCoreParametersCompatRow[];
  }

  let fallbackQuery = supabase
    .from("plant_parameters")
    .select(
      "species_id, sun_score, need_trellis, container_friendly_score, indoor_friendly_score, balcony_friendly_score"
    );

  if (speciesId) {
    fallbackQuery = fallbackQuery.eq("species_id", speciesId);
  }

  const fallbackResult = await fallbackQuery;
  return (fallbackResult.data || []) as PlantCoreParametersCompatRow[];
}
