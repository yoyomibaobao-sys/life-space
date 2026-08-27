"use client";

import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import ArchiveTimeline from "@/components/archive-ui/ArchiveTimeline";
import type { ArchiveCycle, RecordItem } from "@/lib/archive-detail-types";
import {
  formatLocalCycleDate,
  localDateInputToIso,
  toLocalDateInputValue,
} from "@/lib/archive-cycle-dates";
import { getArchiveCycleTerminology } from "@/lib/archive-cycle-terminology";
import UiIcon from "@/components/ui/UiIcon";
import { useLanguage } from "@/lib/i18n/useLanguage";

type CycleDateUpdate = {
  startedAt: string;
  endedAt: string | null;
};

type Props = {
  cycles: ArchiveCycle[];
  records: RecordItem[];
  category?: string | null;
  mobileMode?: boolean;
  canManage?: boolean;
  busy?: boolean;
  emptyState: ReactNode;
  renderRecord: (record: RecordItem, index: number) => ReactNode;
  onStartCycle?: (startedAt: string) => void | Promise<void>;
  onEndCycle?: (cycle: ArchiveCycle, endedAt: string) => void | Promise<void>;
  onUpdateCycleDates?: (
    cycle: ArchiveCycle,
    dates: CycleDateUpdate
  ) => void | Promise<void>;
  onRenameCycle?: (cycle: ArchiveCycle, displayName: string) => void | Promise<void>;
  onDeleteCycle?: (cycle: ArchiveCycle) => boolean | Promise<boolean>;
};

export default function ArchiveCycleTimeline({
  cycles,
  records,
  category,
  mobileMode = false,
  canManage = false,
  busy = false,
  emptyState,
  renderRecord,
  onStartCycle,
  onEndCycle,
  onUpdateCycleDates,
  onRenameCycle,
  onDeleteCycle,
}: Props) {
  const { language, t } = useLanguage();
  const copy = t.archive;
  const terminology = getArchiveCycleTerminology(category, language);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [startDialogOpen, setStartDialogOpen] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [cycleToEnd, setCycleToEnd] = useState<ArchiveCycle | null>(null);
  const [endDate, setEndDate] = useState("");
  const [cycleToAdjust, setCycleToAdjust] = useState<ArchiveCycle | null>(null);
  const [adjustStartDate, setAdjustStartDate] = useState("");
  const [adjustEndDate, setAdjustEndDate] = useState("");
  const [cycleToDelete, setCycleToDelete] = useState<ArchiveCycle | null>(null);
  const [cycleToRename, setCycleToRename] = useState<ArchiveCycle | null>(null);
  const [cycleNameDraft, setCycleNameDraft] = useState("");
  const [dateError, setDateError] = useState("");
  const sortedCycles = useMemo(() => {
    const byStartedAtDescending = (a: ArchiveCycle, b: ArchiveCycle) =>
      new Date(b.started_at).getTime() - new Date(a.started_at).getTime();
    const active = cycles.filter((cycle) => cycle.status === "active").sort(byStartedAtDescending);
    const ended = cycles.filter((cycle) => cycle.status === "ended").sort(byStartedAtDescending);
    return [...active, ...ended];
  }, [cycles]);
  const latestActiveCycleId = sortedCycles.find((cycle) => cycle.status === "active")?.id || null;
  const recordIndex = useMemo(
    () => new Map(records.map((record, index) => [record.id, index])),
    [records]
  );
  const cycleIds = new Set(cycles.map((cycle) => cycle.id));
  const ungroupedRecords = records.filter(
    (record) => !record.cycle_id || !cycleIds.has(record.cycle_id)
  );

  function openStartDialog() {
    setDateError("");
    setStartDate(toLocalDateInputValue());
    setStartDialogOpen(true);
  }

  function openEndDialog(cycle: ArchiveCycle) {
    setDateError("");
    setEndDate(toLocalDateInputValue());
    setCycleToEnd(cycle);
  }

  function openAdjustDialog(cycle: ArchiveCycle) {
    setDateError("");
    setAdjustStartDate(toLocalDateInputValue(cycle.started_at));
    setAdjustEndDate(cycle.status === "ended" ? toLocalDateInputValue(cycle.ended_at) : "");
    setCycleToAdjust(cycle);
  }

  function openRenameDialog(cycle: ArchiveCycle) {
    setCycleNameDraft(
      cycle.display_name || terminology.cycleLabel(cycle.cycle_no)
    );
    setCycleToRename(cycle);
  }

  function dateFields(error: string, children: ReactNode) {
    return (
      <div style={dialogFieldsStyle}>
        {children}
        {error ? <div style={dateErrorStyle}>{error}</div> : null}
      </div>
    );
  }

  const startActionLabel = cycles.length === 0
    ? terminology.firstAction
    : terminology.newAction;

  return (
    <>
      {cycles.length === 0 ? (
        <>
          {canManage && onStartCycle ? (
            <div style={cycleEntryRowStyle}>
              <button type="button" onClick={openStartDialog} disabled={busy} style={cycleActionStyle}>
                {startActionLabel}
              </button>
            </div>
          ) : null}
          <ArchiveTimeline id="archive-records" mobileMode={mobileMode}>
            {records.map((record, index) => renderRecord(record, index))}
            {records.length === 0 ? emptyState : null}
          </ArchiveTimeline>
        </>
      ) : (
        <section id="archive-records" style={cycleSectionStyle}>
          {canManage && onStartCycle ? (
            <div style={cycleEntryRowStyle}>
              <button type="button" onClick={openStartDialog} disabled={busy} style={cycleActionStyle}>
                {startActionLabel}
              </button>
            </div>
          ) : null}

          {sortedCycles.map((cycle) => {
            const cycleRecords = records.filter((record) => record.cycle_id === cycle.id);
            const isExpanded = expanded[cycle.id] ?? cycle.id === latestActiveCycleId;
            const startedText = formatLocalCycleDate(cycle.started_at);
            const endedText = formatLocalCycleDate(cycle.ended_at);

            return (
              <div key={cycle.id} style={cycleGroupStyle}>
                <div style={cycleHeaderRowStyle}>
                  <button
                    type="button"
                    onClick={() => setExpanded((current) => ({ ...current, [cycle.id]: !isExpanded }))}
                    aria-expanded={isExpanded}
                    style={cycleHeaderStyle}
                  >
                    <span style={cycleTitleStyle}>
                      {cycle.display_name || terminology.cycleLabel(cycle.cycle_no)}
                    </span>
                    <span style={cycleStatusStyle(cycle.status)}>
                      {cycle.status === "active" ? copy.ongoing : copy.ended}
                    </span>
                    <span style={cycleCountStyle}>
                      {language === "en"
                        ? `${cycleRecords.length} ${copy.record_unit}`
                        : `${cycleRecords.length}${copy.record_unit}`}
                    </span>
                    <span aria-hidden="true" style={cycleChevronStyle}><UiIcon name={isExpanded ? "chevron-up" : "chevron-down"} size={15} /></span>
                  </button>
                  {canManage ? (
                    <div style={cycleActionGroupStyle}>
                      {onRenameCycle ? (
                        <button
                          type="button"
                          onClick={() => openRenameDialog(cycle)}
                          disabled={busy}
                          style={adjustDateButtonStyle}
                        >
                          {copy.rename_cycle}
                        </button>
                      ) : null}
                      {onUpdateCycleDates ? (
                        <button
                          type="button"
                          onClick={() => openAdjustDialog(cycle)}
                          disabled={busy}
                          style={adjustDateButtonStyle}
                        >
                          {copy.adjust_date}
                        </button>
                      ) : null}
                      {cycle.status === "active" && onEndCycle ? (
                        <button
                          type="button"
                          onClick={() => openEndDialog(cycle)}
                          disabled={busy}
                          style={adjustDateButtonStyle}
                        >
                          {terminology.endAction}
                        </button>
                      ) : null}
                      {onDeleteCycle ? (
                        <details style={cycleMoreStyle}>
                          <summary style={cycleMoreSummaryStyle} aria-label={t.nav.more_actions}>
                            <UiIcon name="more" size={18} />
                          </summary>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.currentTarget.closest("details")?.removeAttribute("open");
                              setCycleToDelete(cycle);
                            }}
                            disabled={busy}
                            style={deleteCycleButtonStyle}
                          >
                            {terminology.deleteAction}
                          </button>
                        </details>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <div style={cycleDateStyle}>
                  {cycle.status === "ended" && endedText
                    ? `${startedText || copy.start_time_unknown}—${endedText}`
                    : language === "en"
                      ? `${startedText || copy.today} ${copy.started_suffix}`
                      : `${startedText || copy.today}${copy.started_suffix}`}
                </div>

                {isExpanded ? (
                  <div style={cycleRecordsStyle}>
                    <ArchiveTimeline mobileMode={mobileMode}>
                      {cycleRecords.map((record) =>
                        renderRecord(record, recordIndex.get(record.id) ?? 0)
                      )}
                      {cycleRecords.length === 0 ? (
                        <div style={cycleEmptyStyle}>{terminology.emptyText}</div>
                      ) : null}
                    </ArchiveTimeline>
                  </div>
                ) : null}
              </div>
            );
          })}

          {ungroupedRecords.length > 0 ? (
            <div style={cycleGroupStyle}>
              <button
                type="button"
                onClick={() => setExpanded((current) => ({ ...current, ungrouped: !current.ungrouped }))}
                aria-expanded={Boolean(expanded.ungrouped)}
                style={cycleHeaderStyle}
              >
                <span style={cycleTitleStyle}>{terminology.unassignedTitle}</span>
                <span style={cycleCountStyle}>
                  {language === "en"
                    ? `${ungroupedRecords.length} ${copy.item_unit}`
                    : `${ungroupedRecords.length}${copy.item_unit}`}
                </span>
                <span aria-hidden="true" style={cycleChevronStyle}><UiIcon name={expanded.ungrouped ? "chevron-up" : "chevron-down"} size={15} /></span>
              </button>
              {expanded.ungrouped ? (
                <ArchiveTimeline mobileMode={mobileMode}>
                  {ungroupedRecords.map((record) =>
                    renderRecord(record, recordIndex.get(record.id) ?? 0)
                  )}
                </ArchiveTimeline>
              ) : null}
            </div>
          ) : null}
        </section>
      )}

      <ConfirmDialog
        open={startDialogOpen}
        title={startActionLabel}
        message={terminology.startPrompt}
        confirmText={startActionLabel}
        confirmDisabled={busy || !startDate}
        cancelDisabled={busy}
        onClose={() => {
          if (!busy) setStartDialogOpen(false);
        }}
        onConfirm={async () => {
          if (!startDate || !onStartCycle) return;
          await onStartCycle(localDateInputToIso(startDate));
          setStartDialogOpen(false);
        }}
      >
        {dateFields(dateError, (
          <label style={dateFieldStyle}>
            <span>{copy.start_date}</span>
            <input
              type="date"
              value={startDate}
              disabled={busy}
              onChange={(event) => {
                setDateError("");
                setStartDate(event.target.value);
              }}
              style={dateInputStyle}
            />
          </label>
        ))}
      </ConfirmDialog>

      <ConfirmDialog
        open={Boolean(cycleToEnd)}
        title={terminology.endAction}
        message={terminology.endDialogMessage}
        confirmText={copy.confirm_end}
        confirmDisabled={busy || !endDate}
        cancelDisabled={busy}
        onClose={() => {
          if (!busy) setCycleToEnd(null);
        }}
        onConfirm={async () => {
          if (!cycleToEnd || !onEndCycle || !endDate) return;
          const startedDate = toLocalDateInputValue(cycleToEnd.started_at);
          if (endDate < startedDate) {
            setDateError(copy.end_before_start);
            return;
          }
          await onEndCycle(cycleToEnd, localDateInputToIso(endDate, "end"));
          setCycleToEnd(null);
        }}
      >
        {dateFields(dateError, (
          <label style={dateFieldStyle}>
            <span>{copy.end_date}</span>
            <input
              type="date"
              min={cycleToEnd ? toLocalDateInputValue(cycleToEnd.started_at) : undefined}
              value={endDate}
              disabled={busy}
              onChange={(event) => {
                setDateError("");
                setEndDate(event.target.value);
              }}
              style={dateInputStyle}
            />
          </label>
        ))}
      </ConfirmDialog>

      <ConfirmDialog
        open={Boolean(cycleToAdjust)}
        title={copy.adjust_dates}
        message={terminology.adjustDialogMessage}
        confirmText={copy.save_dates}
        confirmDisabled={busy || !adjustStartDate || (cycleToAdjust?.status === "ended" && !adjustEndDate)}
        cancelDisabled={busy}
        onClose={() => {
          if (!busy) setCycleToAdjust(null);
        }}
        onConfirm={async () => {
          if (!cycleToAdjust || !onUpdateCycleDates || !adjustStartDate) return;
          if (cycleToAdjust.status === "ended" && adjustEndDate < adjustStartDate) {
            setDateError(copy.end_before_start);
            return;
          }
          await onUpdateCycleDates(cycleToAdjust, {
            startedAt: localDateInputToIso(adjustStartDate),
            endedAt:
              cycleToAdjust.status === "ended" && adjustEndDate
                ? localDateInputToIso(adjustEndDate, "end")
                : null,
          });
          setCycleToAdjust(null);
        }}
      >
        {dateFields(dateError, (
          <>
            <label style={dateFieldStyle}>
              <span>{copy.start_date}</span>
              <input
                type="date"
                value={adjustStartDate}
                disabled={busy}
                onChange={(event) => {
                  setDateError("");
                  setAdjustStartDate(event.target.value);
                }}
                style={dateInputStyle}
              />
            </label>
            {cycleToAdjust?.status === "ended" ? (
              <label style={dateFieldStyle}>
                <span>{copy.end_date}</span>
                <input
                  type="date"
                  min={adjustStartDate || undefined}
                  value={adjustEndDate}
                  disabled={busy}
                  onChange={(event) => {
                    setDateError("");
                    setAdjustEndDate(event.target.value);
                  }}
                  style={dateInputStyle}
                />
              </label>
            ) : null}
          </>
        ))}
      </ConfirmDialog>

      <ConfirmDialog
        open={Boolean(cycleToRename)}
        title={copy.rename_cycle_title}
        message=""
        confirmText={t.save}
        confirmDisabled={busy || !cycleNameDraft.trim()}
        cancelDisabled={busy}
        onClose={() => {
          if (!busy) setCycleToRename(null);
        }}
        onConfirm={async () => {
          if (!cycleToRename || !onRenameCycle || !cycleNameDraft.trim()) return;
          await onRenameCycle(cycleToRename, cycleNameDraft.trim().slice(0, 80));
          setCycleToRename(null);
        }}
      >
        <label style={dateFieldStyle}>
          <span>{copy.cycle_name}</span>
          <input
            value={cycleNameDraft}
            maxLength={80}
            autoFocus
            disabled={busy}
            placeholder={copy.cycle_name_placeholder}
            onChange={(event) => setCycleNameDraft(event.target.value)}
            style={dateInputStyle}
          />
        </label>
      </ConfirmDialog>

      <ConfirmDialog
        open={Boolean(cycleToDelete)}
        title={cycleToDelete ? terminology.deleteTitle(cycleToDelete.cycle_no) : `${terminology.deleteAction}？`}
        message={(() => {
          if (!cycleToDelete) return "";
          const recordCount = records.filter(
            (record) => record.cycle_id === cycleToDelete.id
          ).length;
          return terminology.deleteMessage(recordCount);
        })()}
        confirmText={terminology.deleteAction}
        danger
        confirmDisabled={busy}
        cancelDisabled={busy}
        onClose={() => {
          if (!busy) setCycleToDelete(null);
        }}
        onConfirm={async () => {
          if (!cycleToDelete || !onDeleteCycle) return;
          const deleted = await onDeleteCycle(cycleToDelete);
          if (deleted) setCycleToDelete(null);
        }}
      />
    </>
  );
}

const cycleSectionStyle: CSSProperties = { scrollMarginTop: 76 };
const cycleEntryRowStyle: CSSProperties = { display: "flex", justifyContent: "flex-end", margin: "0 0 10px" };
const cycleActionStyle: CSSProperties = {
  border: "1px solid #cddbc8",
  borderRadius: 999,
  background: "#f8fbf6",
  color: "#486346",
  padding: "8px 13px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};
const cycleGroupStyle: CSSProperties = { borderTop: "1px solid #e6ece3", paddingTop: 10, marginTop: 12 };
const cycleHeaderRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 8,
};
const cycleHeaderStyle: CSSProperties = {
  minWidth: 0,
  flex: "1 1 220px",
  display: "flex",
  alignItems: "center",
  gap: 8,
  border: 0,
  background: "transparent",
  padding: "2px 0",
  color: "#344733",
  cursor: "pointer",
  textAlign: "left",
};
const cycleTitleStyle: CSSProperties = { fontSize: 16, fontWeight: 820 };
const cycleCountStyle: CSSProperties = { color: "#71806f", fontSize: 13 };
const cycleChevronStyle: CSSProperties = { marginLeft: "auto", color: "#6e806b", fontSize: 16 };
const cycleDateStyle: CSSProperties = { marginTop: 5, color: "#758373", fontSize: 14, lineHeight: 1.45 };
const cycleRecordsStyle: CSSProperties = { marginTop: 10 };
const cycleEmptyStyle: CSSProperties = { padding: "10px 12px", color: "#899486", fontSize: 13 };
const adjustDateButtonStyle: CSSProperties = {
  flexShrink: 0,
  border: 0,
  background: "transparent",
  color: "#61745e",
  fontSize: 13.5,
  textDecoration: "underline",
  cursor: "pointer",
};
const cycleActionGroupStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  flexWrap: "nowrap",
  gap: 5,
  flexShrink: 0,
  marginLeft: "auto",
};
const deleteCycleButtonStyle: CSSProperties = {
  position: "absolute",
  zIndex: 3,
  top: 38,
  right: 0,
  width: "max-content",
  minWidth: 116,
  minHeight: 42,
  border: 0,
  borderRadius: 9,
  background: "#fff7f6",
  color: "#a0524b",
  padding: "8px 11px",
  fontSize: 13,
  fontWeight: 700,
  textAlign: "left",
  whiteSpace: "nowrap",
  cursor: "pointer",
};
const cycleMoreStyle: CSSProperties = { position: "relative", flexShrink: 0 };
const cycleMoreSummaryStyle: CSSProperties = {
  width: 34,
  height: 34,
  display: "grid",
  placeItems: "center",
  border: "1px solid #e0e7dd",
  borderRadius: 999,
  background: "#fff",
  color: "#667462",
  cursor: "pointer",
  listStyle: "none",
};
const dialogFieldsStyle: CSSProperties = { display: "grid", gap: 10 };
const dateFieldStyle: CSSProperties = { display: "grid", gap: 6, color: "#4f5e4f", fontSize: 13 };
const dateInputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #d9e3d6",
  borderRadius: 10,
  padding: "9px 10px",
  color: "#30412f",
  background: "#fff",
};
const dateErrorStyle: CSSProperties = { color: "#b04d45", fontSize: 12 };

function cycleStatusStyle(status: ArchiveCycle["status"]): CSSProperties {
  return {
    borderRadius: 999,
    padding: "2px 7px",
    fontSize: 11,
    color: status === "active" ? "#436c42" : "#7b8379",
    background: status === "active" ? "#edf7ea" : "#f1f3f0",
  };
}
