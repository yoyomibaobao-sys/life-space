"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  type EnvironmentFilters,
  type PlantParameterLite,
  getEnvironmentTags,
  matchesEnvironmentFilters,
} from "@/lib/plant-env";
import {
  canAccessMembershipGuidance,
  normalizeMembershipRpcResult,
} from "@/lib/membership";
import {
  loadPlantBasicOverviewsCompat,
  loadPlantCoreParametersCompat,
  type PlantBasicOverviewCompatRow,
} from "@/lib/plant-guide-compat";
import UiIcon from "@/components/ui/UiIcon";
import { useLanguage } from "@/lib/i18n/useLanguage";
import { buildLoginHref } from "@/lib/auth-return";

const PLANT_SEARCH_HISTORY_KEY = "lifespace:plant-guide:recent-searches:v1";
const PLANT_SEARCH_STATE_KEY = "lifespace:plant-guide:search-state:v1";
const MAX_RECENT_SEARCHES = 8;
const INITIAL_VISIBLE_PLANT_COUNT = 24;
const PLANT_BATCH_SIZE = 24;

let hasCheckedInitialPlantNavigation = false;

function isPageReload() {
  if (hasCheckedInitialPlantNavigation) return false;
  hasCheckedInitialPlantNavigation = true;

  try {
    const navigationEntry = window.performance.getEntriesByType(
      "navigation"
    )[0] as PerformanceNavigationTiming | undefined;

    if (!navigationEntry || navigationEntry.type !== "reload") return false;

    const initialUrl = new URL(navigationEntry.name, window.location.href);

    return (
      initialUrl.pathname === window.location.pathname &&
      initialUrl.search === window.location.search
    );
  } catch {
    return false;
  }
}

type PlantItem = {
  id: string;
  slug?: string | null;
  common_name?: string | null;
  scientific_name?: string | null;
  family?: string | null;
  category?: string | null;
  sub_category?: string | null;
  sort_order?: number | null;
  is_active?: boolean | null;
};

type AliasItem = {
  species_id: string;
  alias_name: string;
};

type BasicOverview = PlantBasicOverviewCompatRow;

function normalize(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function normalizePlantCategoryKey(value?: string | null) {
  const key = String(value || "").trim().toLowerCase();

  if (key === "medicinal") return "herb";
  if (key === "field_crop") return "grain";

  return key;
}

function categoryLabel(
  value: string | null | undefined,
  labels: Record<string, string>,
  uncategorized: string
) {
  if (!value) return uncategorized;
  const key = normalizePlantCategoryKey(value);
  return labels[key] || key || uncategorized;
}

function uniqueTextList(items: unknown[]) {
  const seen = new Set<string>();

  return items
    .map((item) => String(item ?? "").trim())
    .filter((item) => {
      if (!item) return false;

      const key = item.toLowerCase();
      if (seen.has(key)) return false;

      seen.add(key);
      return true;
    });
}

function normalizeRecentSearches(items: unknown[]) {
  const seen = new Set<string>();

  return items
    .map((item) => String(item ?? "").trim())
    .filter((item) => {
      if (!item) return false;

      const key = item.toLowerCase();
      if (seen.has(key)) return false;

      seen.add(key);
      return true;
    })
    .slice(0, MAX_RECENT_SEARCHES);
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  compact = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  compact?: boolean;
}) {
  return (
    <label
      style={{
        display: "grid",
        gap: compact ? 4 : 6,
        minWidth: compact ? 104 : undefined,
        maxWidth: compact ? 132 : undefined,
        flex: compact ? "1 1 104px" : undefined,
      }}
    >
      <span style={{ fontSize: compact ? 11 : 12, color: "#777" }}>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={{
          height: compact ? 30 : 38,
          borderRadius: compact ? 10 : 12,
          border: "1px solid #e5e7eb",
          padding: compact ? "0 7px" : "0 12px",
          background: "#fff",
          color: "#333",
          fontSize: compact ? 12 : 14,
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function PlantIndexPage() {
  const { language, t } = useLanguage();
  const categoryLabels = t.plant.categories as Record<string, string>;
  const lightOptions = t.plant.light_options;
  const waterOptions = t.plant.water_options;
  const temperatureOptions = t.plant.temperature_options;
  const sceneOptions = t.plant.scene_options;
  const indoorOptions = t.plant.indoor_options;
  const [plants, setPlants] = useState<PlantItem[]>([]);
  const [aliases, setAliases] = useState<AliasItem[]>([]);
  const [basicOverviews, setBasicOverviews] = useState<BasicOverview[]>([]);
  const [parameters, setParameters] = useState<PlantParameterLite[]>([]);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [hasCloudAccess, setHasCloudAccess] = useState(false);
  const [interestCount, setInterestCount] = useState<number | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [searchPanelOpen, setSearchPanelOpen] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [searchStateRestored, setSearchStateRestored] = useState(false);
  const [activeCategory, setActiveCategory] = useState("all");
  const [visiblePlantCount, setVisiblePlantCount] = useState(
    INITIAL_VISIBLE_PLANT_COUNT,
  );
  const [loading, setLoading] = useState(true);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const desktopSearchWrapRef = useRef<HTMLDivElement>(null);
  const mobileSearchInputRef = useRef<HTMLInputElement>(null);
  const resultsSectionRef = useRef<HTMLElement>(null);
  const loadMorePlantsRef = useRef<HTMLDivElement>(null);
  const pendingScrollYRef = useRef<number | null>(null);
  const [filters, setFilters] = useState<EnvironmentFilters>({
    light: "all",
    water: "all",
    temperature: "all",
    scene: "all",
    indoor: "all",
  });

  useEffect(() => {
    function updateViewportMode() {
      setIsMobileViewport(window.innerWidth < 760);
    }

    updateViewportMode();
    window.addEventListener("resize", updateViewportMode);

    return () => window.removeEventListener("resize", updateViewportMode);
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const storedRecent = JSON.parse(
          window.localStorage.getItem(PLANT_SEARCH_HISTORY_KEY) || "[]"
        );
        setRecentSearches(
          normalizeRecentSearches(Array.isArray(storedRecent) ? storedRecent : [])
        );
      } catch {
        setRecentSearches([]);
      }

      try {
        if (isPageReload()) {
          window.sessionStorage.removeItem(PLANT_SEARCH_STATE_KEY);
          setSearchStateRestored(true);
          return;
        }

        const storedState = JSON.parse(
          window.sessionStorage.getItem(PLANT_SEARCH_STATE_KEY) || "null"
        ) as {
          query?: unknown;
          searchInput?: unknown;
          activeCategory?: unknown;
          filters?: Partial<EnvironmentFilters>;
          scrollY?: unknown;
          visiblePlantCount?: unknown;
        } | null;

        if (!storedState) {
          setSearchStateRestored(true);
          return;
        }

        const restoredQuery = String(storedState.query ?? "").trim();
        const restoredInput = String(storedState.searchInput ?? restoredQuery).trim();
        const restoredCategory = String(storedState.activeCategory ?? "all");
        const restoredFilters = storedState.filters || {};

        setQuery(restoredQuery);
        setSearchInput(restoredInput);
        setActiveCategory(restoredCategory || "all");
        setFilters({
          light: String(restoredFilters.light || "all"),
          water: String(restoredFilters.water || "all"),
          temperature: String(restoredFilters.temperature || "all"),
          scene: String(restoredFilters.scene || "all"),
          indoor: String(restoredFilters.indoor || "all"),
        });
        setVisiblePlantCount(
          Math.max(
            INITIAL_VISIBLE_PLANT_COUNT,
            Number(storedState.visiblePlantCount) || INITIAL_VISIBLE_PLANT_COUNT,
          ),
        );

        if (Number.isFinite(Number(storedState.scrollY))) {
          pendingScrollYRef.current = Math.max(0, Number(storedState.scrollY));
        }
        setSearchStateRestored(true);
      } catch {
        window.sessionStorage.removeItem(PLANT_SEARCH_STATE_KEY);
        setSearchStateRestored(true);
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    async function load() {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      setIsSignedIn(Boolean(user));

      const membershipResult = user
        ? await supabase.rpc("get_my_membership")
        : { data: null, error: null };
      const membership = membershipResult.error
        ? null
        : normalizeMembershipRpcResult(membershipResult.data);
      const canReadFullGuide = canAccessMembershipGuidance(membership);

      setHasCloudAccess(canReadFullGuide);

      const [
        { data: plantData },
        { data: aliasData },
        { data: overviewData },
        { data: parameterData },
        interestCountResult,
      ] = await Promise.all([
        supabase
          .from("plant_species")
          .select(
            "id, slug, common_name, scientific_name, family, category, sub_category, sort_order, is_active"
          )
          .eq("is_active", true)
          .order("sort_order", { ascending: true, nullsFirst: false })
          .order("common_name", { ascending: true }),

        supabase
          .from("plant_species_aliases")
          .select("species_id, alias_name")
          .order("alias_name", { ascending: true }),

        user
          ? loadPlantBasicOverviewsCompat(null).then((data) => ({ data }))
          : Promise.resolve({ data: [] as BasicOverview[] }),

        canReadFullGuide
          ? supabase.from("plant_parameters").select(
              "species_id, sun_score, soil_moisture_score, drought_score, optimal_growth_temp_min, optimal_growth_temp_max, frost_damage_temp, lethal_low_temp, shade_tolerance, drought_tolerance, container_friendly_score, indoor_friendly_score, balcony_friendly_score, air_flow_score, soil_aeration_score, soil_fertility_score"
            )
          : user
            ? loadPlantCoreParametersCompat(null).then((data) => ({ data }))
            : Promise.resolve({ data: [] as PlantParameterLite[] }),

        user
          ? supabase
              .from("user_plant_interests")
              .select("id", { count: "exact", head: true })
              .eq("user_id", user.id)
          : Promise.resolve({ count: null }),
      ]);

      setPlants(plantData || []);
      setAliases(aliasData || []);
      setBasicOverviews((overviewData || []) as BasicOverview[]);
      setParameters(parameterData || []);
      setInterestCount(user ? interestCountResult.count ?? 0 : null);
      setLoading(false);
    }

    load();
  }, []);

  useEffect(() => {
    if (loading || !searchStateRestored || pendingScrollYRef.current === null) return;

    const scrollY = pendingScrollYRef.current;
    pendingScrollYRef.current = null;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => window.scrollTo({ top: scrollY }));
    });
  }, [loading, searchStateRestored, visiblePlantCount]);

  useEffect(() => {
    if (!searchPanelOpen || isMobileViewport) return;

    function closeOnOutsidePointer(event: PointerEvent) {
      if (!desktopSearchWrapRef.current?.contains(event.target as Node)) {
        setSearchPanelOpen(false);
      }
    }

    window.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => window.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [searchPanelOpen, isMobileViewport]);

  useEffect(() => {
    if (!isMobileSearchOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => mobileSearchInputRef.current?.focus());

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setIsMobileSearchOpen(false);
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isMobileSearchOpen]);

  const aliasMap = useMemo(() => {
    const map: Record<string, string[]> = {};

    aliases.forEach((alias) => {
      if (!alias.species_id || !alias.alias_name) return;

      if (!map[alias.species_id]) {
        map[alias.species_id] = [];
      }

      map[alias.species_id].push(alias.alias_name);
    });

    Object.keys(map).forEach((plantId) => {
      map[plantId] = uniqueTextList(map[plantId]);
    });

    return map;
  }, [aliases]);

  const guideMap = useMemo(() => {
    const map: Record<string, BasicOverview> = {};

    basicOverviews.forEach((overview) => {
      if (overview.species_id) {
        map[overview.species_id] = overview;
      }
    });

    return map;
  }, [basicOverviews]);

  const parameterMap = useMemo(() => {
    const map: Record<string, PlantParameterLite> = {};

    parameters.forEach((item) => {
      if (item?.species_id) {
        map[item.species_id] = item;
      }
    });

    return map;
  }, [parameters]);

  const categories = useMemo(() => {
    const existing = Array.from(
      new Set(
        plants
          .map((plant) => normalizePlantCategoryKey(plant.category))
          .filter(Boolean) as string[]
      )
    );

    const preferred = [
      "vegetable",
      "fruit",
      "herb",
      "flower",
      "houseplant",
      "succulent",
      "grain",
      "tree",
    ];

    return [
      "all",
      ...preferred.filter((item) => existing.includes(item)),
      ...existing.filter((item) => !preferred.includes(item)),
    ];
  }, [plants]);

  const categoryFilterOptions = useMemo(
    () => categories.map((category) => ({
      value: category,
      label: categoryLabel(category, categoryLabels, t.plant.uncategorized),
    })),
    [categories, categoryLabels, t.plant.uncategorized]
  );

  const filteredPlants = useMemo(() => {
    const keyword = normalize(query);

    return plants.filter((plant) => {
      const plantAliases = aliasMap[plant.id] || [];
      const inCategory =
        activeCategory === "all" || normalizePlantCategoryKey(plant.category) === activeCategory;

      if (!inCategory) return false;
      if (
        hasCloudAccess &&
        !matchesEnvironmentFilters(parameterMap[plant.id], filters)
      ) {
        return false;
      }

      if (!keyword) return true;

      const searchable = [
        plant.common_name,
        plant.scientific_name,
        plant.family,
        plant.slug,
        plant.category,
        normalizePlantCategoryKey(plant.category),
        plant.sub_category,
        ...plantAliases,
      ];

      return searchable.some((item) => normalize(item).includes(keyword));
    });
  }, [
    plants,
    aliasMap,
    query,
    activeCategory,
    parameterMap,
    filters,
    hasCloudAccess,
  ]);

  const visiblePlants = useMemo(
    () => filteredPlants.slice(0, visiblePlantCount),
    [filteredPlants, visiblePlantCount],
  );
  const hasMoreVisiblePlants = visiblePlants.length < filteredPlants.length;

  useEffect(() => {
    const node = loadMorePlantsRef.current;
    if (
      !node ||
      !hasMoreVisiblePlants ||
      typeof window.IntersectionObserver === "undefined"
    ) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setVisiblePlantCount((current) =>
          Math.min(current + PLANT_BATCH_SIZE, filteredPlants.length),
        );
      },
      { rootMargin: "320px 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [filteredPlants.length, hasMoreVisiblePlants]);

  const searchSuggestions = useMemo(() => {
    const keyword = normalize(searchInput);
    if (!keyword) return [];

    return plants
      .filter((plant) => {
        const searchable = [
          plant.common_name,
          plant.scientific_name,
          plant.slug,
          ...(aliasMap[plant.id] || []),
        ];

        return searchable.some((item) => normalize(item).includes(keyword));
      })
      .slice(0, 6);
  }, [plants, aliasMap, searchInput]);

  const hasActiveEnvironmentFilters =
    hasCloudAccess &&
    (filters.light !== "all" ||
      filters.water !== "all" ||
      filters.temperature !== "all" ||
      filters.scene !== "all" ||
      filters.indoor !== "all");

  function updateFilter<K extends keyof EnvironmentFilters>(key: K, value: EnvironmentFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
    setVisiblePlantCount(INITIAL_VISIBLE_PLANT_COUNT);
  }

  function changeCategory(value: string) {
    setActiveCategory(value);
    setVisiblePlantCount(INITIAL_VISIBLE_PLANT_COUNT);
  }

  function resetFilters() {
    setFilters({
      light: "all",
      water: "all",
      temperature: "all",
      scene: "all",
      indoor: "all",
    });
    setVisiblePlantCount(INITIAL_VISIBLE_PLANT_COUNT);
  }

  function persistSearchState(
    nextQuery = query,
    nextInput = searchInput,
    nextVisiblePlantCount = visiblePlantCount,
  ) {
    try {
      window.sessionStorage.setItem(
        PLANT_SEARCH_STATE_KEY,
        JSON.stringify({
          query: nextQuery,
          searchInput: nextInput,
          activeCategory,
          filters,
          scrollY: window.scrollY,
          visiblePlantCount: nextVisiblePlantCount,
        })
      );
    } catch {
      // Search still works if browser storage is unavailable.
    }
  }

  function rememberSearch(value: string) {
    const keyword = value.trim();
    if (!keyword) return;

    setRecentSearches((current) => {
      const next = normalizeRecentSearches([keyword, ...current]);

      try {
        window.localStorage.setItem(PLANT_SEARCH_HISTORY_KEY, JSON.stringify(next));
      } catch {
        // Keep the in-memory list when browser storage is unavailable.
      }

      return next;
    });
  }

  function executeSearch(value = searchInput) {
    const keyword = value.trim();

    setSearchInput(keyword);
    setQuery(keyword);
    setVisiblePlantCount(INITIAL_VISIBLE_PLANT_COUNT);
    setSearchPanelOpen(false);
    setIsMobileSearchOpen(false);
    rememberSearch(keyword);
    persistSearchState(keyword, keyword, INITIAL_VISIBLE_PLANT_COUNT);

    window.requestAnimationFrame(() => {
      resultsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function openSearch() {
    setSearchPanelOpen(true);
    if (isMobileViewport) setIsMobileSearchOpen(true);
  }

  function removeRecentSearch(value: string) {
    setRecentSearches((current) => {
      const next = current.filter((item) => item !== value);

      try {
        window.localStorage.setItem(PLANT_SEARCH_HISTORY_KEY, JSON.stringify(next));
      } catch {
        // Keep the in-memory list when browser storage is unavailable.
      }

      return next;
    });
  }

  function clearRecentSearches() {
    setRecentSearches([]);

    try {
      window.localStorage.removeItem(PLANT_SEARCH_HISTORY_KEY);
    } catch {
      // The visible list is still cleared when browser storage is unavailable.
    }
  }

  function renderSearchAssist() {
    if (searchInput.trim()) {
      return (
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ color: "#71806d", fontSize: 12, fontWeight: 700 }}>
            {t.plant.name_suggestions}
          </div>
          {searchSuggestions.length > 0 ? (
            searchSuggestions.map((plant) => {
              const displayName = plant.common_name || plant.scientific_name || t.plant.unnamed;

              return (
                <Link
                  key={plant.id}
                  href={`/plant/${plant.id}`}
                  onClick={() => {
                    rememberSearch(searchInput);
                    persistSearchState(searchInput.trim(), searchInput.trim());
                  }}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 11px",
                    borderRadius: 10,
                    color: "#2f3c2d",
                    textDecoration: "none",
                    background: "#f7faf5",
                  }}
                >
                  <span style={{ minWidth: 0 }}>
                    <strong style={{ display: "block", fontSize: 14 }}>{displayName}</strong>
                    {plant.scientific_name && plant.scientific_name !== displayName ? (
                      <span
                        style={{
                          display: "block",
                          marginTop: 2,
                          color: "#7b8578",
                          fontSize: 12,
                          fontStyle: "italic",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {plant.scientific_name}
                      </span>
                    ) : null}
                  </span>
                  <UiIcon name="arrow-right" size={14} style={{ color: "#789174" }} />
                </Link>
              );
            })
          ) : (
            <div style={{ color: "#7b8578", fontSize: 13, lineHeight: 1.6 }}>
              {t.plant.no_suggestions}
            </div>
          )}
        </div>
      );
    }

    return (
      <div style={{ display: "grid", gap: 8 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <span style={{ color: "#71806d", fontSize: 12, fontWeight: 700 }}>{t.plant.recent_searches}</span>
          {recentSearches.length > 0 ? (
            <button
              type="button"
              onClick={clearRecentSearches}
              style={{
                border: 0,
                padding: 0,
                background: "transparent",
                color: "#8a9287",
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              {t.plant.clear}
            </button>
          ) : null}
        </div>

        {recentSearches.length > 0 ? (
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
            {recentSearches.map((item) => (
              <span
                key={item}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  border: "1px solid #dfe8dc",
                  borderRadius: 999,
                  background: "#f8fbf7",
                  overflow: "hidden",
                }}
              >
                <button
                  type="button"
                  onClick={() => executeSearch(item)}
                  style={{
                    border: 0,
                    padding: "7px 5px 7px 10px",
                    background: "transparent",
                    color: "#496345",
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  {item}
                </button>
                <button
                  type="button"
                  aria-label={`${t.plant.delete_recent_prefix}${item}`}
                  onClick={() => removeRecentSearch(item)}
                  style={{
                    border: 0,
                    padding: "7px 9px 7px 4px",
                    background: "transparent",
                    color: "#98a095",
                    cursor: "pointer",
                    fontSize: 14,
                    lineHeight: 1,
                  }}
                >
                  <UiIcon name="close" size={14} />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <div style={{ color: "#929990", fontSize: 13 }}>{t.plant.no_recent_searches}</div>
        )}
      </div>
    );
  }

  return (
    <main style={{ padding: isMobileViewport ? "10px" : "16px", maxWidth: 1080, margin: "0 auto" }}>
      {isMobileSearchOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t.plant.search_aria}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1200,
            background: "#f7f8f5",
            overflowY: "auto",
          }}
        >
          <div
            style={{
              position: "sticky",
              top: 0,
              zIndex: 1,
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px",
              borderBottom: "1px solid #e6e9e3",
              background: "rgba(255,255,255,0.96)",
            }}
          >
            <button
              type="button"
              aria-label={t.plant.back_to_guide}
              onClick={() => setIsMobileSearchOpen(false)}
              style={{
                width: 36,
                height: 36,
                border: 0,
                borderRadius: 10,
                background: "transparent",
                color: "#52604f",
                cursor: "pointer",
                fontSize: 22,
              }}
            >
              <UiIcon name="arrow-left" size={20} />
            </button>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                executeSearch();
              }}
              style={{ display: "flex", gap: 7, minWidth: 0, flex: 1 }}
            >
              <input
                ref={mobileSearchInputRef}
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder={t.plant.search_placeholder}
                aria-label={t.plant.search_placeholder}
                style={{
                  width: "100%",
                  minWidth: 0,
                  height: 38,
                  borderRadius: 11,
                  border: "1px solid #dfe5dc",
                  padding: "0 11px",
                  background: "#fff",
                  fontSize: 14,
                  boxSizing: "border-box",
                  outlineColor: "#89ad82",
                }}
              />
              <button
                type="submit"
                style={{
                  minWidth: 58,
                  height: 38,
                  border: "1px solid #477a43",
                  borderRadius: 11,
                  padding: "0 12px",
                  background: "#4f824b",
                  color: "#fff",
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: 700,
                }}
              >
                {t.plant.search}
              </button>
            </form>
          </div>

          <div style={{ padding: "14px 16px 28px" }}>{renderSearchAssist()}</div>
        </div>
      ) : null}

      <section
        style={{
          padding: isMobileViewport ? 10 : 22,
          border: "1px solid #eee",
          borderRadius: isMobileViewport ? 16 : 20,
          background: "#fff",
          boxShadow: "0 8px 24px rgba(0,0,0,0.04)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <h1
            style={{
              margin: 0,
              color: "#1f2d1f",
              fontSize: isMobileViewport ? 20 : 28,
              fontWeight: 800,
              whiteSpace: "nowrap",
            }}
          >
            {t.plant.title}
          </h1>
          <Link
            href={
              isSignedIn
                ? "/archive/interests"
                : buildLoginHref("/archive/interests")
            }
            style={{
              display: "inline-flex",
              alignItems: "center",
              minHeight: isMobileViewport ? 30 : 34,
              padding: isMobileViewport ? "4px 9px" : "5px 12px",
              border: "1px solid #dbe7d7",
              borderRadius: 999,
              background: "#fbfdf9",
              color: "#42663f",
              fontSize: isMobileViewport ? 12 : 13,
              fontWeight: 750,
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            <UiIcon name="bookmark" size={14} style={{ marginRight: 5 }} />
            {t.plant.my_saved}{isSignedIn && interestCount !== null ? `（${interestCount}）` : ""}
          </Link>
        </div>

        <div
          ref={desktopSearchWrapRef}
          style={{ position: "relative", marginTop: isMobileViewport ? 10 : 16 }}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              executeSearch();
            }}
            style={{ display: "flex", gap: isMobileViewport ? 7 : 8 }}
          >
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              onFocus={openSearch}
              onKeyDown={(event) => {
                if (event.key === "Escape") setSearchPanelOpen(false);
              }}
              placeholder={t.plant.search_placeholder}
              aria-label={t.plant.search_placeholder}
              style={{
                width: "100%",
                minWidth: 0,
                height: isMobileViewport ? 38 : 44,
                borderRadius: 12,
                border: "1px solid #dfe5dc",
                padding: isMobileViewport ? "0 11px" : "0 14px",
                background: "#fff",
                fontSize: isMobileViewport ? 13 : 14,
                boxSizing: "border-box",
                outlineColor: "#89ad82",
              }}
            />
            <button
              type="submit"
              style={{
                minWidth: isMobileViewport ? 58 : 72,
                height: isMobileViewport ? 38 : 44,
                border: "1px solid #477a43",
                borderRadius: 12,
                padding: isMobileViewport ? "0 12px" : "0 18px",
                background: "#4f824b",
                color: "#fff",
                cursor: "pointer",
                fontSize: isMobileViewport ? 13 : 14,
                fontWeight: 700,
              }}
            >
              {t.plant.search}
            </button>
          </form>

          {!isMobileViewport && searchPanelOpen ? (
            <div
              style={{
                position: "absolute",
                top: 52,
                left: 0,
                right: 80,
                zIndex: 20,
                padding: 13,
                border: "1px solid #dfe5dc",
                borderRadius: 14,
                background: "#fff",
                boxShadow: "0 14px 32px rgba(35,50,32,0.12)",
              }}
            >
              {renderSearchAssist()}
            </div>
          ) : null}
        </div>

        {!isMobileViewport ? (
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              overflowX: "visible",
              marginTop: 14,
              paddingBottom: 0,
            }}
          >
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => changeCategory(category)}
                style={{
                  border:
                    activeCategory === category
                      ? "1px solid #4CAF50"
                      : "1px solid #eee",
                  background:
                    activeCategory === category ? "#f0fff4" : "#fafafa",
                  color: activeCategory === category ? "#2e7d32" : "#333",
                  borderRadius: 999,
                  padding: "7px 12px",
                  cursor: "pointer",
                  fontSize: 13,
                  lineHeight: 1.2,
                  whiteSpace: "nowrap",
                }}
              >
                {categoryLabel(category, categoryLabels, t.plant.uncategorized)}
              </button>
            ))}
          </div>
        ) : null}

        <div
          style={{
            marginTop: 14,
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #e0eadb",
            background: "#f8fbf6",
            color: "#5a6d55",
            fontSize: 13,
            lineHeight: 1.7,
          }}
        >
          {!isSignedIn ? (
            <>
              {t.plant.visitor_notice}
              <Link href="/register" style={{ marginLeft: 6, color: "#3f6f37", fontWeight: 700 }}>
                {t.plant.register_for_summary}
              </Link>
            </>
          ) : hasCloudAccess ? (
            t.plant.cloud_notice
          ) : (
            <>
              {t.plant.local_notice_prefix}
              <Link href="/membership" style={{ marginLeft: 4, color: "#3f6f37", fontWeight: 700 }}>
                {t.plant.open_membership}
              </Link>
              {t.plant.local_notice_suffix}
            </>
          )}
        </div>

        <div
          style={{
            marginTop: isMobileViewport ? 8 : 16,
            paddingTop: isMobileViewport ? 8 : 16,
            borderTop: "1px solid #f0f0f0",
            display: "grid",
            gap: isMobileViewport ? 6 : 12,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: isMobileViewport ? 8 : 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ fontSize: isMobileViewport ? 13 : 14, fontWeight: 600 }}>
              {hasCloudAccess ? t.plant.category_environment_filters : t.plant.category_filter}
            </div>
            {hasActiveEnvironmentFilters && (
              <button
                type="button"
                onClick={resetFilters}
                style={{
                  border: "1px solid #eee",
                  background: "#fff",
                  borderRadius: 999,
                  padding: isMobileViewport ? "4px 9px" : "6px 12px",
                  fontSize: isMobileViewport ? 11 : 12,
                  color: "#666",
                  cursor: "pointer",
                }}
              >
                {t.plant.clear_environment_filters}
              </button>
            )}
          </div>

          <div
            style={{
              display: isMobileViewport ? "flex" : "grid",
              gridTemplateColumns: isMobileViewport ? undefined : "repeat(auto-fit, minmax(160px, 1fr))",
              gap: isMobileViewport ? 6 : 12,
              flexWrap: isMobileViewport ? "wrap" : undefined,
              overflowX: "visible",
              paddingBottom: 0,
            }}
          >
            <FilterSelect
              label={t.plant.category}
              value={activeCategory}
              onChange={changeCategory}
              options={categoryFilterOptions}
              compact={isMobileViewport}
            />
            {hasCloudAccess ? (
              <>
                <FilterSelect
                  label={t.plant.light}
                  value={filters.light}
                  onChange={(value) => updateFilter("light", value)}
                  options={lightOptions}
                  compact={isMobileViewport}
                />
                <FilterSelect
                  label={t.plant.water}
                  value={filters.water}
                  onChange={(value) => updateFilter("water", value)}
                  options={waterOptions}
                  compact={isMobileViewport}
                />
                <FilterSelect
                  label={t.plant.temperature}
                  value={filters.temperature}
                  onChange={(value) => updateFilter("temperature", value)}
                  options={temperatureOptions}
                  compact={isMobileViewport}
                />
                <FilterSelect
                  label={t.plant.scene}
                  value={filters.scene}
                  onChange={(value) => updateFilter("scene", value)}
                  options={sceneOptions}
                  compact={isMobileViewport}
                />
                <FilterSelect
                  label={t.plant.indoor_reference}
                  value={filters.indoor}
                  onChange={(value) => updateFilter("indoor", value)}
                  options={indoorOptions}
                  compact={isMobileViewport}
                />
              </>
            ) : null}
          </div>
        </div>
      </section>

      <section ref={resultsSectionRef} style={{ marginTop: 18, scrollMarginTop: 12 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 10,
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          {!isMobileViewport || query ? (
            <h2 style={{ margin: 0, fontSize: isMobileViewport ? 16 : 18 }}>
              {query
                ? `${t.plant.results_prefix}${query}${t.plant.results_suffix}`
                : t.plant.all_plants}
            </h2>
          ) : null}

          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{ fontSize: 13, color: "#888" }}>
              {loading ? t.plant.loading : `${filteredPlants.length}${t.plant.result_suffix}`}
            </span>
            {query ? (
              <button
                type="button"
                onClick={() => executeSearch("")}
                style={{
                  border: 0,
                  padding: 0,
                  background: "transparent",
                  color: "#587552",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                {t.plant.clear_search}
              </button>
            ) : null}
          </div>
        </div>

        {loading ? (
          <div
            style={{
              padding: 20,
              border: "1px solid #eee",
              borderRadius: 16,
              background: "#fff",
              color: "#888",
            }}
          >
            {t.plant.loading}
          </div>
        ) : filteredPlants.length === 0 ? (
          <div
            style={{
              padding: 20,
              border: "1px solid #eee",
              borderRadius: 16,
              background: "#fff",
              color: "#888",
              lineHeight: 1.75,
            }}
          >
            {t.plant.no_results}
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 12,
            }}
          >
            {visiblePlants.map((plant) => {
              const plantAliases = uniqueTextList(aliasMap[plant.id] || []);
              const summary = isSignedIn ? guideMap[plant.id]?.summary : null;
              const envTags = isSignedIn
                ? getEnvironmentTags(
                    parameterMap[plant.id],
                    { includeIndoor: true },
                    language
                  ).slice(0, 6)
                : [];

              return (
                <Link
                  key={plant.id}
                  href={`/plant/${plant.id}`}
                  onClick={() => persistSearchState()}
                  style={{
                    display: "block",
                    border: "1px solid #eee",
                    borderRadius: 18,
                    background: "#fff",
                    padding: 16,
                    color: "inherit",
                    textDecoration: "none",
                    minHeight: 196,
                    boxShadow: "0 4px 14px rgba(0,0,0,0.03)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      alignItems: "flex-start",
                    }}
                  >
                    <h3 style={{ margin: 0, fontSize: 18, lineHeight: 1.35 }}>
                      {plant.common_name ||
                        plant.scientific_name ||
                        t.plant.unnamed}
                    </h3>

                    <span
                      style={{
                        whiteSpace: "nowrap",
                        fontSize: 12,
                        padding: "4px 8px",
                        borderRadius: 999,
                        background: "#f0fff4",
                        color: "#2e7d32",
                        flexShrink: 0,
                      }}
                    >
                      {categoryLabel(plant.category, categoryLabels, t.plant.uncategorized)}
                    </span>
                  </div>

                  {plant.scientific_name && (
                    <div
                      style={{
                        marginTop: 6,
                        color: "#666",
                        fontSize: 13,
                        fontStyle: "italic",
                        lineHeight: 1.6,
                      }}
                    >
                      {t.plant.scientific_name}{plant.scientific_name}
                    </div>
                  )}

                  {plantAliases.length > 0 && (
                    <div
                      style={{
                        marginTop: 4,
                        color: "#777",
                        fontSize: 13,
                        lineHeight: 1.6,
                      }}
                    >
                      {t.plant.aliases}{plantAliases.join(t.plant.alias_separator)}
                    </div>
                  )}

                  {envTags.length > 0 && (
                    <div
                      style={{
                        display: "flex",
                        gap: 6,
                        flexWrap: "wrap",
                        marginTop: 12,
                      }}
                    >
                      {envTags.slice(0, 5).map((tag) => (
                        <span
                          key={`${plant.id}-${tag}`}
                          style={{
                            fontSize: 12,
                            color: "#2e7d32",
                            background: "#f6fbf6",
                            border: "1px solid #dfeedd",
                            borderRadius: 999,
                            padding: "3px 8px",
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  <p
                    style={{
                      margin: "12px 0 0",
                      color: summary ? "#444" : "#999",
                      fontSize: 14,
                      lineHeight: 1.65,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {summary ||
                      (isSignedIn
                        ? t.plant.summary_pending
                        : t.plant.register_for_basic_summary)}
                  </p>
                </Link>
              );
            })}
          </div>
        )}

        {!loading && hasMoreVisiblePlants ? (
          <div
            ref={loadMorePlantsRef}
            style={{
              display: "flex",
              justifyContent: "center",
              padding: "16px 0 4px",
            }}
          >
            <button
              type="button"
              onClick={() =>
                setVisiblePlantCount((current) =>
                  Math.min(current + PLANT_BATCH_SIZE, filteredPlants.length),
                )
              }
              style={{
                minHeight: 40,
                padding: "8px 18px",
                border: "1px solid #d7e5d1",
                borderRadius: 999,
                background: "#fff",
                color: "#456b40",
                fontSize: 13,
                fontWeight: 750,
                cursor: "pointer",
              }}
            >
              {t.plant.load_more}
            </button>
          </div>
        ) : null}
      </section>
    </main>
  );
}
