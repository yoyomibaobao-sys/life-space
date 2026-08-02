import { useEffect, useState, type CSSProperties } from "react";
import type {
  DiscoverSearchKind,
  SearchCategory,
  SearchFilters,
} from "@/lib/discover-search-types";
import { commonSearchTags } from "@/lib/discover-search-types";
import {
  countryOptions,
  getCountryName,
  getRegionOptions,
  hasPresetRegions,
} from "@/lib/region-shared";

type Props = {
  searchKind: DiscoverSearchKind;
  filters: SearchFilters;
  onFiltersChange: (next: SearchFilters) => void;
  onSubmit: () => void;
  onReset: () => void;
};

export default function DiscoverSearchForm({
  searchKind,
  filters,
  onFiltersChange,
  onSubmit,
  onReset,
}: Props) {
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const isRecordSearch = searchKind === "records";
  const keywordLabel =
    searchKind === "projects"
      ? "项目搜索"
      : searchKind === "experience"
        ? "经验卡搜索"
        : "记录搜索";
  const keywordPlaceholder =
    searchKind === "projects"
      ? "项目名 / 系统名 / 用户名"
      : searchKind === "experience"
        ? "经验卡标题 / 项目名 / 系统名 / 用户名"
        : "项目名 / 记录内容 / 系统名";
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
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
        style={mobileFormStyle}
      >
        <div style={mobileGridStyle}>
          <label style={fieldLabelStyle}>
            地区搜索
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
              placeholder="国家 / 地域 / 城市"
              style={inputStyle}
            />
          </label>

          <label style={fieldLabelStyle}>
            {keywordLabel}
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
              placeholder={keywordPlaceholder}
              style={inputStyle}
            />
          </label>

          <label style={fieldLabelStyle}>
            类别
            <select
              value={filters.category}
              onChange={(event) => patch({ category: event.target.value as SearchCategory })}
              style={inputStyle}
            >
              <option value="all">全部</option>
              <option value="plant">种植</option>
              <option value="system">农法设施</option>
              <option value="insect_fish">虫鱼生态</option>
              <option value="other">其他</option>
            </select>
          </label>

          {isRecordSearch ? (
            <label style={fieldLabelStyle}>
              标签
              <select
                value={filters.tag}
                onChange={(event) => patch({ tag: event.target.value })}
                style={inputStyle}
              >
                <option value="">全部标签</option>
                {hasCustomTag ? <option value={filters.tag}>{filters.tag}</option> : null}
                {commonSearchTags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>

        <div style={mobileActionsStyle}>
          {isRecordSearch ? (
            <label style={mobileHelpOnlyStyle}>
              <input
                type="checkbox"
                checked={filters.helpOnly}
                onChange={(event) => patch({ helpOnly: event.target.checked })}
              />
              只看求助
            </label>
          ) : <span />}

          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={onReset} style={secondaryButtonStyle}>
              重置
            </button>
            <button type="submit" style={primaryButtonStyle}>
              搜索
            </button>
          </div>
        </div>
      </form>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
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
          国家 / 地区
          <select
            value={filters.countryCode}
            onChange={(e) =>
              patch({
                countryCode: e.target.value,
                countryName: getCountryName(e.target.value, filters.countryName),
                region: "",
                city: filters.city,
              })
            }
            style={inputStyle}
          >
            <option value="">全部地区</option>
            {countryOptions.map((item) => (
              <option key={item.code} value={item.code}>
                {item.name}
              </option>
            ))}
          </select>
        </label>

        {customCountry ? (
          <label style={fieldLabelStyle}>
            自定义国家 / 地区
            <input
              value={filters.countryName}
              onChange={(e) => patch({ countryName: e.target.value })}
              placeholder="例如：巴西"
              style={inputStyle}
            />
          </label>
        ) : (
          <label style={fieldLabelStyle}>
            省 / 州 / 地域
            {useRegionSelect ? (
              <select value={filters.region} onChange={(e) => patch({ region: e.target.value })} style={inputStyle}>
                <option value="">全部</option>
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
                placeholder="例如：浙江 / California"
                style={inputStyle}
              />
            )}
          </label>
        )}

        <label style={fieldLabelStyle}>
          城市
          <input
            value={filters.city}
            onChange={(e) => patch({ city: e.target.value })}
            placeholder="例如：宁波 / Tokyo"
            style={inputStyle}
          />
        </label>

        <label style={fieldLabelStyle}>
          类别
          <select
            value={filters.category}
            onChange={(e) => patch({ category: e.target.value as SearchCategory })}
            style={inputStyle}
          >
            <option value="all">全部</option>
            <option value="plant">种植</option>
            <option value="system">农法设施</option>
            <option value="insect_fish">虫鱼生态</option>
            <option value="other">其他</option>
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
              标签
              <select
                value={filters.tag}
                onChange={(e) => patch({ tag: e.target.value })}
                style={inputStyle}
              >
                <option value="">全部标签</option>
                {hasCustomTag ? <option value={filters.tag}>{filters.tag}</option> : null}
                {commonSearchTags.map((tag) => (
                  <option key={tag} value={tag}>{tag}</option>
                ))}
              </select>
            </label>

            <label style={fieldLabelStyle}>
              内容
              <input
                value={filters.content}
                onChange={(e) => patch({ content: e.target.value })}
                placeholder="记录内容"
                style={inputStyle}
              />
            </label>
          </>
        ) : null}
      </div>

      <div style={{ marginTop: 8, fontSize: 12, color: "#6f7f6f", lineHeight: 1.6 }}>
        按地区匹配公开{searchKind === "projects" ? "项目" : searchKind === "experience" ? "经验卡" : "记录"}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
        {isRecordSearch ? (
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "#374737", cursor: "pointer" }}>
            <input type="checkbox" checked={filters.helpOnly} onChange={(e) => patch({ helpOnly: e.target.checked })} />
            只看求助
          </label>
        ) : <span />}

        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={onReset} style={secondaryButtonStyle}>重置</button>
          <button type="submit" style={primaryButtonStyle}>搜索</button>
        </div>
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
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 8,
};

const mobileActionsStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  marginTop: 10,
};

const mobileHelpOnlyStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontSize: 13,
  color: "#374737",
  cursor: "pointer",
};

const secondaryButtonStyle: CSSProperties = {
  border: "1px solid #e1e8dd",
  background: "#fff",
  color: "#4d5d4d",
  borderRadius: 999,
  padding: "8px 13px",
  cursor: "pointer",
  fontSize: 13,
};

const primaryButtonStyle: CSSProperties = {
  border: "1px solid #7eb87e",
  background: "#4CAF50",
  color: "#fff",
  borderRadius: 999,
  padding: "8px 15px",
  cursor: "pointer",
  fontSize: 13,
};
