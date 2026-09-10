"use client";

import { useId } from "react";
import type { Language } from "@/lib/i18n";
import { EMPTY_PLANTING_REGION, type PlantingRegion } from "@/lib/planting-region";
import { getCountryName, getLocalizedCountryOptions, getRegionOptions } from "@/lib/region-shared";

export default function PlantingRegionField({ value, onChange, language, required = false, disabled = false }: {
  value: PlantingRegion | null;
  onChange: (value: PlantingRegion) => void;
  language: Language;
  required?: boolean;
  disabled?: boolean;
}) {
  const en = language === "en";
  const id = useId();
  const draft = value || EMPTY_PLANTING_REGION;
  const options = getLocalizedCountryOptions(language);
  return (
    <fieldset disabled={disabled} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <legend style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>{en ? "Planting region" : "种植地区"}{required ? " *" : ""}</legend>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
        <label style={labelStyle}>{en ? "Country / region" : "国家／地区"}
          <select required={required} value={draft.country_code} onChange={(event) => onChange({ ...draft, country_code: event.target.value, country_name: getCountryName(event.target.value, "", language), region_name: "", city_name: "" })} style={inputStyle}>
            <option value="">{en ? "Select" : "请选择"}</option>
            {!options.some((item) => item.code === draft.country_code) && draft.country_code ? <option value={draft.country_code}>{draft.country_name || draft.country_code}</option> : null}
            {options.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
          </select>
        </label>
        {draft.country_code === "OTHER" ? <label style={labelStyle}>{en ? "Country name" : "国家／地区名称"}<input required={required} maxLength={80} value={draft.country_name} onChange={(event) => onChange({ ...draft, country_name: event.target.value })} style={inputStyle} /></label> : null}
        <label style={labelStyle}>{en ? "State / province" : "省／州"}
          <input value={draft.region_name} list={`${id}-regions`} maxLength={80} onChange={(event) => onChange({ ...draft, region_name: event.target.value })} style={inputStyle} />
          <datalist id={`${id}-regions`}>{getRegionOptions(draft.country_code, language).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</datalist>
        </label>
        <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>{en ? "City / district" : "城市／区县"}
          <input required={required} value={draft.city_name} maxLength={80} onChange={(event) => onChange({ ...draft, city_name: event.target.value })} style={inputStyle} placeholder={en ? "Where this project is grown" : "填写项目实际种植的城市或区县"} />
        </label>
      </div>
      <p style={{ margin: "8px 0 0", fontSize: 12, color: "#71806b", lineHeight: 1.6 }}>{en ? "Public projects show only this broad region. Leave out street addresses and house numbers." : "项目公开时显示此地区，请填写到城市或区县，不填写街道、门牌。"}</p>
    </fieldset>
  );
}

const labelStyle = { display: "grid", gap: 6, minWidth: 0, fontSize: 13, color: "#60735c" };
const inputStyle = { boxSizing: "border-box" as const, width: "100%", minWidth: 0, padding: "10px 12px", border: "1px solid #d9e2d4", borderRadius: 12, background: "#fff", color: "#263a28", fontSize: 15 };
