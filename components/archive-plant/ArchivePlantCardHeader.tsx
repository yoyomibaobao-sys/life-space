import Link from "next/link";
import type { PlantSpeciesSummary } from "@/lib/domain-types";
import { categoryLabel, plantDisplayName } from "@/lib/archive-plant-shared";

type Props = {
  speciesId: string;
  plant: PlantSpeciesSummary | null | undefined;
  badgeText: string;
  badgeStyle: {
    background: string;
    color: string;
    border?: string;
  };
  metaItems?: string[];
};

export default function ArchivePlantCardHeader({
  speciesId,
  plant,
  badgeText,
  badgeStyle,
  metaItems = [],
}: Props) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        alignItems: "flex-start",
      }}
    >
      <div>
        <Link
          href={`/plant/${speciesId}`}
          style={{
            color: "#111",
            fontWeight: 700,
            fontSize: 18,
            textDecoration: "none",
          }}
        >
          {plantDisplayName(plant)}
        </Link>

        {plant?.scientific_name && (
          <div
            style={{
              marginTop: 4,
              color: "#777",
              fontSize: 13,
              fontStyle: "italic",
            }}
          >
            {plant.scientific_name}
          </div>
        )}

        <div style={{ marginTop: 8, color: "#888", fontSize: 13 }}>
          {categoryLabel(plant?.category)}
        </div>

        {metaItems.length > 0 && (
          <div style={{ marginTop: 6, color: "#777", fontSize: 13 }}>
            {metaItems.join(" · ")}
          </div>
        )}
      </div>

      <span
        style={{
          whiteSpace: "nowrap",
          borderRadius: 999,
          padding: "5px 10px",
          background: badgeStyle.background,
          color: badgeStyle.color,
          border: badgeStyle.border,
          fontSize: 12,
          fontWeight: 650,
        }}
      >
        {badgeText}
      </span>
    </div>
  );
}
