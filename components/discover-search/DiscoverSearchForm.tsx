import { useEffect, useState, type CSSProperties } from "react";
import type {
  DiscoverSearchKind,
  SearchCategory,
  SearchFilters,
} from "@/lib/discover-search-types";
import { commonSearchTags } from "@/lib/discover-search-types";
import {
  getLocalizedCountryOptions,
  getCountryName,
  getRegionOptions,
  hasPresetRegions,
} from "@/lib/region-shared";
import { useLanguage } from "@/lib/i18n/useLanguage";
import { getBehaviorTagLabel } from "@/lib/record-tags";

type Props = {
  searchKind: DiscoverSearchKind | "all";
  filters: SearchFilters;
  onFiltersChange: (next: SearchFilters) => void;
};

export default function DiscoverSearchForm({
  searchKind,
  filters,
  onFiltersChange,
}: Props) {
  const { language, t } = useLanguage();
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const isRecordSearch = searchKind === "records";
  const keywordLabel =
          searchKind === "all"
            ? t.discover.search_ui.all_short_placeholder
            : searchKind === "projects"
      ? t.discover.search_ui.project_search
      : searchKind === "experience"
        ? t.discover.search_ui.experience_search
        : t.discover.search_ui.record_search;
  const keywordPlaceholder =
    searchKind === "all"
      ? t.discover.search_ui.all_short_placeholder
      : searchKind === "projects"
      ? t.discover.search_ui.project_placeholder
      : searchKind === "experience"
        ? t.discover.search_ui.experience_placeholder
        : t.discover.search_ui.record_placeholder;
  const mobileKeywordPlaceholder =
    searchKind === "all"
      ? t.discover.search_ui.all_short_placeholder
      : searchKind === "projects"
      ? t.discover.search_ui.project_short_placeholder
      : searchKind === "experience"
        ? t.discover.search_ui.experience_short_placeholder
        : t.discover.search_ui.record_short_placeholder;
  const hasCustomTag =
    filters.tag.trim() && !commonSearchTags.includes(filters.tag.trim() as (typeof commonSearchTags)[number]);

  const regionOptions = getRegionOptions(filters.countryCode);
  const useRegionSelect = hasPresetRegions(filters.countryCode);
  const customCountry = filters.countryCode === "OTHER";

  function patch(next: Partial<SearchFilters>) {
    onFiltersChange({ ...filters, ...next });
  }

  useEffect(() => {
    function updateViewportMode() {
      setIsMobileViewport(window.innerWidth < 760);
    }

    updateViewportMode();
    window.addEventListener("resize", updateViewportMode);

    return () => window.removeEventListener("resize", updateViewportMode);
  }, []);

  if (isMobileViewport) {
    return (
      <form
        onSubmit={(event) => event.preventDefault()}
        style={mobileFormStyle}
      >
        <div style={mobileGridStyle}>
          <label
            style={mobileFieldLabelStyle}
            aria-label={t.discover.search_ui.category}
          >
            <select
              value={filters.category}
              onChange={(event) => patch({ category: event.target.value as SearchCategory })}
              style={mobileInputStyle}
            >
              <option value="all">{t.discover.search_ui.all_categories}</option>
              <option value="plant">{t.discover.filters.plant}</option>
              <option value="system">{t.discover.filters.system}</option>
              <option value="insect_fish">{t.discover.filters.insect_fish}</option>
              <option value="other">{t.discover.filters.other}</option>
            </select>
          </label>

          <label
            style={mobileFieldLabelStyle}
            aria-label={t.discover.search_ui.region_search}
          >
            <input
              value={filters.locationQuery || ""}
              onChange={(event) =>
                patch({
                  locationQuery: event.target.value,
                  countryCode: "",
                  countryName: "",
                  region: "",
                  city: "",
                })
              }
              placeholder={t.discover.search_ui.region_short_placeholder}
              style={mobileInputStyle}
            />
          </label>

          <label style={mobileFieldLabelStyle} aria-label={keywordLabel}>
            <input
              value={filters.textQuery || ""}
              onChange={(event) =>
                patch({
                  textQuery: event.target.value,
                  name: "",
                  content: "",
                  speciesId: null,
                })
              }
              placeholder={mobileKeywordPlaceholder}
              style={mobileInputStyle}
            />
          </label>
        </div>

        {isRecordSearch ? (
          <div style={mobileRecordOptionsStyle}>
            <label style={mobileTagFieldStyle} aria-label={t.discover.search_ui.tag}>
              <select
                value={filters.tag}
                onChange={(event) => patch({ tag: event.target.value })}
                style={mobileInputStyle}
              >
                <option value="">{t.discover.search_ui.all_tags}</option>
                {hasCustomTag ? <option value={filters.tag}>{filters.tag}</option> : null}
                {commonSearchTags.map((tag) => (
                  <option key={tag} value={tag}>
                    {getBehaviorTagLabel(tag, language)}
                  </option>
                ))}
              </select>
            </label>
            <label style={mobileHelpOnlyStyle}>
              <input
                type="checkbox"
                checked={filters.helpOnly}
                onChange={(event) => patch({ helpOnly: event.target.checked })}
              />
              {t.discover.search_ui.help_only}
            </label>
          </div>
        ) : null}

      </form>
    );
  }

  return (
    <form
      onSubmit={(event) => event.preventDefault()}
      style={{
        padding: 12,
        border: "1px solid #e5ece2",
        borderRadius: 16,
        background: "#fbfdf9",
        marginBottom: 14,
        boxShadow: "0 1px 8px rgba(0,0,0,0.025)",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            isRecordSearch
              ? "minmax(124px, 0.9fr) minmax(130px, 1fr) minmax(124px, 0.9fr) minmax(96px, 0.8fr) minmax(130px, 1.1fr) minmax(108px, 0.9fr) minmax(150px, 1.25fr)"
              : "minmax(124px, 1fr) minmax(140px, 1.1fr) minmax(124px, 1fr) minmax(110px, 0.8fr) minmax(240px, 1.8fr)",
          gap: 8,
          overflowX: "auto",
        }}
      >
        <label style={fieldLabelStyle}>
          {t.discover.search_ui.country_region}
          <select
            value={filters.countryCode}
            onChange={(e) =>
              patch({
                countryCode: e.target.value,
                countryName: getCountryName(e.target.value, filters.countryName, language),
                region: "",
                city: filters.city,
              })
            }
            style={inputStyle}
          >
            <option value="">{t.discover.search_ui.all_regions}</option>
            {getLocalizedCountryOptions(language).map((item) => (
              <option key={item.code} value={item.code}>
                {item.name}
              </option>
            ))}
          </select>
        </label>

        {customCountry ? (
          <label style={fieldLabelStyle}>
            {t.discover.search_ui.custom_country_region}
            <input
              value={filters.countryName}
              onChange={(e) => patch({ countryName: e.target.value })}
              placeholder={t.discover.search_ui.country_example}
              style={inputStyle}
            />
          </label>
        ) : (
          <label style={fieldLabelStyle}>
            {t.discover.search_ui.region}
            {useRegionSelect ? (
              <select value={filters.region} onChange={(e) => patch({ region: e.target.value })} style={inputStyle}>
                <option value="">{t.discover.search_ui.all}</option>
                {regionOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={filters.region}
                onChange={(e) => patch({ region: e.target.value })}
                placeholder={t.discover.search_ui.region_example}
                style={inputStyle}
              />
            )}
          </label>
        )}

        <label style={fieldLabelStyle}>
          {t.discover.search_ui.city}
          <input
            value={filters.city}
            onChange={(e) => patch({ city: e.target.value })}
            placeholder={t.discover.search_ui.city_example}
            style={inputStyle}
          />
        </label>

        <label style={fieldLabelStyle}>
          {t.discover.search_ui.category}
          <select
            value={filters.category}
            onChange={(e) => patch({ category: e.target.value as SearchCategory })}
            style={inputStyle}
          >
            <option value="all">{t.discover.filters.all}</option>
            <option value="plant">{t.discover.filters.plant}</option>
            <option value="system">{t.discover.filters.system}</option>
            <option value="insect_fish">{t.discover.filters.insect_fish}</option>
            <option value="other">{t.discover.filters.other}</option>
          </select>
        </label>

        <label style={fieldLabelStyle}>
          {keywordLabel}
          <input
            value={filters.name}
            onChange={(e) => patch({ name: e.target.value, speciesId: filters.speciesId ? null : filters.speciesId })}
            placeholder={keywordPlaceholder}
            style={inputStyle}
          />
        </label>

        {isRecordSearch ? (
          <>
            <label style={fieldLabelStyle}>
              {t.discover.search_ui.tag}
              <select
                value={filters.tag}
                onChange={(e) => patch({ tag: e.target.value })}
                style={inputStyle}
              >
                <option value="">{t.discover.search_ui.all_tags}</option>
                {hasCustomTag ? <option value={filters.tag}>{filters.tag}</option> : null}
                {commonSearchTags.map((tag) => (
                  <option key={tag} value={tag}>{getBehaviorTagLabel(tag, language)}</option>
                ))}
              </select>
            </label>

            <label style={fieldLabelStyle}>
              {t.discover.search_ui.content}
              <input
                value={filters.content}
                onChange={(e) => patch({ content: e.target.value })}
                placeholder={t.discover.search_ui.record_content}
                style={inputStyle}
              />
            </label>
          </>
        ) : null}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
        {isRecordSearch ? (
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "#374737", cursor: "pointer" }}>
            <input type="checkbox" checked={filters.helpOnly} onChange={(e) => patch({ helpOnly: e.target.checked })} />
            {t.discover.search_ui.help_only}
          </label>
        ) : <span />}

        <span />
      </div>
    </form>
  );
}

const fieldLabelStyle: CSSProperties = {
  fontSize: 12,
  color: "#6f7f6f",
  minWidth: 0,
};

const inputStyle: CSSProperties = {
  width: "100%",
  marginTop: 4,
  padding: "9px 10px",
  borderRadius: 10,
  border: "1px solid #dfe8dc",
  background: "#fff",
  color: "#1f2d1f",
  boxSizing: "border-box",
  fontSize: 13,
};

const mobileFormStyle: CSSProperties = {
  padding: 10,
  border: "1px solid #e5ece2",
  borderRadius: 14,
  background: "#fbfdf9",
  marginBottom: 12,
  boxShadow: "0 1px 8px rgba(0,0,0,0.025)",
};

const mobileGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 5,
};

const mobileFieldLabelStyle: CSSProperties = {
  display: "block",
  minWidth: 0,
};

const mobileInputStyle: CSSProperties = {
  ...inputStyle,
  minWidth: 0,
  height: 36,
  marginTop: 0,
  padding: "0 7px",
  borderRadius: 9,
  fontSize: 13,
};

const mobileRecordOptionsStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  marginTop: 8,
};

const mobileTagFieldStyle: CSSProperties = {
  flex: "0 1 150px",
  minWidth: 0,
};

const mobileHelpOnlyStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontSize: 13,
  color: "#374737",
  cursor: "pointer",
};
