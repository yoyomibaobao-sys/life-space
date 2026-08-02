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
import AppIcon from "@/components/ui/AppIcon";

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
  onDeleteCycle,
}: Props) {
  const terminology = getArchiveCycleTerminology(category);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [startDialogOpen, setStartDialogOpen] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [cycleToEnd, setCycleToEnd] = useState<ArchiveCycle | null>(null);
  const [endDate, setEndDate] = useState("");
  const [cycleToAdjust, setCycleToAdjust] = useState<ArchiveCycle | null>(null);
  const [adjustStartDate, setAdjustStartDate] = useState("");
  const [adjustEndDate, setAdjustEndDate] = useState("");
  const [cycleToDelete, setCycleToDelete] = useState<ArchiveCycle | null>(null);
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
                    <span style={cycleTitleStyle}>{terminology.cycleLabel(cycle.cycle_no)}</span>
                    <span style={cycleStatusStyle(cycle.status)}>
                      {cycle.status === "active" ? "进行中" : "已结束"}
                    </span>
                    <span style={cycleCountStyle}>{cycleRecords.length}条记录</span>
                    <span aria-hidden="true" style={cycleChevronStyle}><AppIcon name={isExpanded ? "chevron-up" : "chevron-down"} size={15} /></span>
                  </button>
                  {canManage ? (
                    <div style={cycleActionGroupStyle}>
                      {onUpdateCycleDates ? (
                        <button
                          type="button"
                          onClick={() => openAdjustDialog(cycle)}
                          disabled={busy}
                          style={adjustDateButtonStyle}
                        >
                          调整日期
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
                        <button
                          type="button"
                          onClick={() => setCycleToDelete(cycle)}
                          disabled={busy}
                          style={deleteCycleButtonStyle}
                        >
                          {terminology.deleteAction}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <div style={cycleDateStyle}>
                  {cycle.status === "ended" && endedText
                    ? `${startedText || "开始时间未知"}—${endedText}`
                    : `${startedText || "今天"}开始`}
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
                <span style={cycleCountStyle}>{ungroupedRecords.length}条</span>
                <span aria-hidden="true" style={cycleChevronStyle}><AppIcon name={expanded.ungrouped ? "chevron-up" : "chevron-down"} size={15} /></span>
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
            <span>开始日期</span>
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
        confirmText="确认结束"
        confirmDisabled={busy || !endDate}
        cancelDisabled={busy}
        onClose={() => {
          if (!busy) setCycleToEnd(null);
        }}
        onConfirm={async () => {
          if (!cycleToEnd || !onEndCycle || !endDate) return;
          const startedDate = toLocalDateInputValue(cycleToEnd.started_at);
          if (endDate < startedDate) {
            setDateError("结束日期不能早于开始日期。");
            return;
          }
          await onEndCycle(cycleToEnd, localDateInputToIso(endDate, "end"));
          setCycleToEnd(null);
        }}
      >
        {dateFields(dateError, (
          <label style={dateFieldStyle}>
            <span>结束日期</span>
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
        title="调整日期"
        message={terminology.adjustDialogMessage}
        confirmText="保存日期"
        confirmDisabled={busy || !adjustStartDate || (cycleToAdjust?.status === "ended" && !adjustEndDate)}
        cancelDisabled={busy}
        onClose={() => {
          if (!busy) setCycleToAdjust(null);
        }}
        onConfirm={async () => {
          if (!cycleToAdjust || !onUpdateCycleDates || !adjustStartDate) return;
          if (cycleToAdjust.status === "ended" && adjustEndDate < adjustStartDate) {
            setDateError("结束日期不能早于开始日期。");
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
              <span>开始日期</span>
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
                <span>结束日期</span>
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
const cycleTitleStyle: CSSProperties = { fontSize: 15, fontWeight: 800 };
const cycleCountStyle: CSSProperties = { color: "#7b8978", fontSize: 12 };
const cycleChevronStyle: CSSProperties = { marginLeft: "auto", color: "#6e806b", fontSize: 16 };
const cycleDateStyle: CSSProperties = { marginTop: 3, color: "#8a9588", fontSize: 12 };
const cycleRecordsStyle: CSSProperties = { marginTop: 10 };
const cycleEmptyStyle: CSSProperties = { padding: "10px 12px", color: "#899486", fontSize: 13 };
const adjustDateButtonStyle: CSSProperties = {
  flexShrink: 0,
  border: 0,
  background: "transparent",
  color: "#61745e",
  fontSize: 12,
  textDecoration: "underline",
  cursor: "pointer",
};
const cycleActionGroupStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  flexWrap: "wrap",
  gap: 8,
  flexShrink: 0,
  marginLeft: "auto",
};
const deleteCycleButtonStyle: CSSProperties = {
  ...adjustDateButtonStyle,
  color: "#a0524b",
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
