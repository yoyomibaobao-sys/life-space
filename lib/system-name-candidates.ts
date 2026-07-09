import {
  getDefaultSystemNames,
  isNonPlantArchiveCategory,
  type ArchiveCategory,
} from "@/lib/archive-categories";

export type SystemNameCandidateSource =
  | "plant_species"
  | "builtin"
  | "cloud_archive"
  | "local_archive"
  | "current";

export type SystemNameCandidate = {
  id?: string | null;
  label: string;
  source: SystemNameCandidateSource;
  description?: string;
  plantId?: string | null;
  plantSlug?: string | null;
  aliases?: string[];
  searchText?: string;
};

export type SystemNameCandidateMode = "cloud" | "local";

export type SystemNameCandidateSupabase = {
  from: (table: string) => any;
};

type PlantSpeciesCandidateRow = {
  id?: string | null;
  common_name?: string | null;
  scientific_name?: string | null;
  slug?: string | null;
  is_active?: boolean | null;
  aliases?: string[];
  display_name?: string | null;
  search_text?: string | null;
};

type PlantSpeciesAliasRow = {
  species_id?: string | null;
  alias_name?: string | null;
  normalized_name?: string | null;
};

export type GetSystemNameCandidatesParams = {
  category?: ArchiveCategory | string | null;
  query?: string | null;
  currentValue?: string | null;
  mode?: SystemNameCandidateMode;
  includeUserArchives?: boolean;
  supabase?: SystemNameCandidateSupabase | null;
  userId?: string | null;
  cloudExistingNames?: Array<string | null | undefined>;
  localExistingNames?: Array<string | null | undefined>;
  plantSpeciesRows?: PlantSpeciesCandidateRow[];
  plantAliasRows?: PlantSpeciesAliasRow[];
  limit?: number;
};

export function normalizeSystemName(value?: string | null) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function getCandidateKey(value: string) {
  return normalizeSystemName(value).toLowerCase();
}

function addCandidate(
  map: Map<string, SystemNameCandidate>,
  candidate: Omit<SystemNameCandidate, "label"> & { label?: string | null }
) {
  const label = normalizeSystemName(candidate.label);
  if (!label) return;

  const key = getCandidateKey(label);
  if (map.has(key)) return;

  map.set(key, {
    ...candidate,
    label,
    searchText: candidate.searchText || buildSearchText(label, candidate.description, candidate.aliases),
  });
}

function buildSearchText(...parts: Array<string | string[] | null | undefined>) {
  return parts
    .flatMap((part) => (Array.isArray(part) ? part : [part]))
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function matchesQuery(candidate: SystemNameCandidate, query?: string | null) {
  const keyword = normalizeSystemName(query).toLowerCase();
  if (!keyword) return true;

  return (
    candidate.label.toLowerCase().includes(keyword) ||
    String(candidate.description || "").toLowerCase().includes(keyword) ||
    String(candidate.searchText || "").toLowerCase().includes(keyword)
  );
}

function normalizeCategory(value?: ArchiveCategory | string | null): ArchiveCategory {
  if (value === "plant" || value === "system" || value === "insect_fish" || value === "other") {
    return value;
  }

  return "other";
}

function buildPlantCandidatesFromRows(
  speciesRows: PlantSpeciesCandidateRow[] = [],
  aliasRows: PlantSpeciesAliasRow[] = []
) {
  const aliasesBySpecies = new Map<string, string[]>();

  aliasRows.forEach((alias) => {
    if (!alias.species_id) return;

    const list = aliasesBySpecies.get(alias.species_id) || [];
    if (alias.alias_name) list.push(alias.alias_name);
    if (alias.normalized_name && alias.normalized_name !== alias.alias_name) {
      list.push(alias.normalized_name);
    }
    aliasesBySpecies.set(alias.species_id, list);
  });

  return speciesRows.map((species) => {
    const aliases = Array.from(new Set([...(species.aliases || []), ...(aliasesBySpecies.get(species.id || "") || [])]));
    const displayName =
      normalizeSystemName(species.display_name) ||
      normalizeSystemName(species.common_name) ||
      normalizeSystemName(species.scientific_name) ||
      "未命名植物";

    return {
      id: species.id || null,
      plantId: species.id || null,
      plantSlug: species.slug || null,
      label: displayName,
      source: "plant_species" as const,
      aliases,
      description: [
        normalizeSystemName(species.scientific_name),
        aliases.length ? `别名：${aliases.slice(0, 4).join("、")}` : "",
      ]
        .filter(Boolean)
        .join(" · "),
      searchText: buildSearchText(
        displayName,
        species.common_name,
        species.scientific_name,
        species.slug,
        aliases
      ),
    } satisfies SystemNameCandidate;
  });
}

async function loadPlantSpeciesCandidates(supabase?: SystemNameCandidateSupabase | null) {
  if (!supabase) return [];

  try {
    const [{ data: speciesData, error: speciesError }, { data: aliasData, error: aliasError }] =
      await Promise.all([
        supabase
          .from("plant_species")
          .select("id, common_name, scientific_name, slug, is_active")
          .eq("is_active", true)
          .order("common_name", { ascending: true }),
        supabase
          .from("plant_species_aliases")
          .select("species_id, alias_name, normalized_name, plant_species!inner(is_active)")
          .eq("plant_species.is_active", true),
      ]);

    if (speciesError || aliasError) {
      console.warn("load system name plant candidates failed:", speciesError || aliasError);
      return [];
    }

    return buildPlantCandidatesFromRows(
      (speciesData || []) as PlantSpeciesCandidateRow[],
      (aliasData || []) as PlantSpeciesAliasRow[]
    );
  } catch (error) {
    console.warn("load system name plant candidates failed:", error);
    return [];
  }
}

async function loadCloudExistingNames(
  params: GetSystemNameCandidatesParams,
  category: ArchiveCategory
) {
  if (!params.includeUserArchives || !params.supabase || !params.userId || !isNonPlantArchiveCategory(category)) {
    return [];
  }

  try {
    const { data, error } = await params.supabase
      .from("archives")
      .select("system_name")
      .eq("user_id", params.userId)
      .eq("category", category);

    if (error) {
      console.warn("load existing archive system names failed:", error);
      return [];
    }

    return ((data || []) as Array<{ system_name?: string | null }>).map((row) => row.system_name);
  } catch (error) {
    console.warn("load existing archive system names failed:", error);
    return [];
  }
}

export function dedupeSystemNameCandidates(
  candidates: Array<Omit<SystemNameCandidate, "label"> & { label?: string | null }>,
  currentValue?: string | null
) {
  const map = new Map<string, SystemNameCandidate>();

  candidates.forEach((candidate) => addCandidate(map, candidate));
  addCandidate(map, { label: currentValue, source: "current" });

  return Array.from(map.values());
}

export function hasExactSystemNameCandidate(
  candidates: SystemNameCandidate[],
  value?: string | null
) {
  const key = getCandidateKey(value || "");
  if (!key) return false;

  return candidates.some((candidate) => getCandidateKey(candidate.label) === key);
}

export function getSystemNameCandidateLabels(candidates: SystemNameCandidate[]) {
  return candidates.map((candidate) => candidate.label);
}

export async function getSystemNameCandidates(
  params: GetSystemNameCandidatesParams
): Promise<SystemNameCandidate[]> {
  const category = normalizeCategory(params.category);
  const limit = params.limit ?? 10;
  const candidates: Array<Omit<SystemNameCandidate, "label"> & { label?: string | null }> = [];

  if (category === "plant") {
    const plantCandidates = params.plantSpeciesRows
      ? buildPlantCandidatesFromRows(params.plantSpeciesRows, params.plantAliasRows || [])
      : await loadPlantSpeciesCandidates(params.supabase);

    candidates.push(...plantCandidates);
  } else if (category === "system" || category === "insect_fish") {
    getDefaultSystemNames(category).forEach((name) => {
      candidates.push({ label: name, source: "builtin" });
    });

    (params.cloudExistingNames || []).forEach((name) => {
      candidates.push({ label: name, source: "cloud_archive" });
    });
    (params.localExistingNames || []).forEach((name) => {
      candidates.push({ label: name, source: "local_archive" });
    });

    const remoteNames = await loadCloudExistingNames(params, category);
    remoteNames.forEach((name) => {
      candidates.push({ label: name, source: "cloud_archive" });
    });
  }

  return dedupeSystemNameCandidates(candidates, params.currentValue)
    .filter((candidate) => matchesQuery(candidate, params.query))
    .slice(0, limit);
}
