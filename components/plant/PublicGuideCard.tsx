"use client";

import type { CSSProperties } from "react";
import {
  publicGuideCardStyle,
  publicGuideCardTitleRowStyle,
  publicGuideCategoryBadgeStyle,
  publicGuideNameStyle,
  publicGuideSecondaryNameStyle,
  publicGuideSummaryStyle,
  publicGuideTraitRowStyle,
  publicGuideTraitStyle,
} from "@/components/plant/publicGuideCardStyles";

export function PublicGuideCardBody({
  name,
  categoryLabel,
  secondaryName,
  summary,
  traitLabels = [],
  hasSummaryAccess,
  isMobile = true,
}: {
  name: string;
  categoryLabel?: string | null;
  secondaryName?: string | null;
  summary?: string | null;
  traitLabels?: string[];
  hasSummaryAccess: boolean;
  isMobile?: boolean;
}) {
  return (
    <>
      <span style={publicGuideCardTitleRowStyle}>
        <strong style={publicGuideNameStyle(isMobile)}>{name}</strong>
        {categoryLabel ? (
          <span style={publicGuideCategoryBadgeStyle}>{categoryLabel}</span>
        ) : null}
      </span>
      {secondaryName && secondaryName !== name ? (
        <span style={publicGuideSecondaryNameStyle}>{secondaryName}</span>
      ) : null}
      {traitLabels.length > 0 ? (
        <span style={publicGuideTraitRowStyle}>
          {traitLabels.map((label) => (
            <span key={label} style={publicGuideTraitStyle}>
              {label}
            </span>
          ))}
        </span>
      ) : null}
      {summary ? (
        <span style={publicGuideSummaryStyle(isMobile, hasSummaryAccess)}>
          {summary}
        </span>
      ) : null}
    </>
  );
}

export default function PublicGuideCard({
  name,
  categoryLabel,
  secondaryName,
  summary,
  traitLabels,
  hasSummaryAccess,
  isMobile = true,
  onClick,
}: {
  name: string;
  categoryLabel?: string | null;
  secondaryName?: string | null;
  summary?: string | null;
  traitLabels?: string[];
  hasSummaryAccess: boolean;
  isMobile?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={name}
      style={publicGuideCardButtonStyle(isMobile)}
    >
      <PublicGuideCardBody
        name={name}
        categoryLabel={categoryLabel}
        secondaryName={secondaryName}
        summary={summary}
        traitLabels={traitLabels}
        hasSummaryAccess={hasSummaryAccess}
        isMobile={isMobile}
      />
    </button>
  );
}

function publicGuideCardButtonStyle(isMobile: boolean): CSSProperties {
  return {
    ...publicGuideCardStyle(isMobile),
    width: "100%",
    textAlign: "left",
    cursor: "pointer",
    font: "inherit",
  };
}
