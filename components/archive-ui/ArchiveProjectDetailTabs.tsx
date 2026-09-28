"use client";

import type { ArchiveProjectDetailTabId } from "@/components/archive-ui/archiveProjectDetailLayout";
import {
  archiveProjectDetailTabButtonStyle,
  archiveProjectDetailTabWrapStyle,
} from "@/components/archive-ui/archiveProjectDetailLayout";

export default function ArchiveProjectDetailTabs({
  ariaLabel,
  active,
  onChange,
  labels,
}: {
  ariaLabel: string;
  active: ArchiveProjectDetailTabId;
  onChange: (tab: ArchiveProjectDetailTabId) => void;
  labels: {
    records: string;
    profile: string;
    experience: string;
  };
}) {
  return (
    <nav style={archiveProjectDetailTabWrapStyle} aria-label={ariaLabel}>
      <button
        type="button"
        onClick={() => onChange("records")}
        style={archiveProjectDetailTabButtonStyle(active === "records")}
      >
        {labels.records}
      </button>
      <button
        type="button"
        onClick={() => onChange("profile")}
        style={archiveProjectDetailTabButtonStyle(active === "profile")}
      >
        {labels.profile}
      </button>
      <button
        type="button"
        onClick={() => onChange("experience")}
        style={archiveProjectDetailTabButtonStyle(active === "experience")}
      >
        {labels.experience}
      </button>
    </nav>
  );
}
