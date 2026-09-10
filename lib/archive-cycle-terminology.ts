import type { Language } from "@/lib/i18n";

export type ArchiveCycleTerminology = {
  unit: string;
  firstAction: string;
  newAction: string;
  endAction: string;
  deleteAction: string;
  assignLabel: string;
  adjustLabel: string;
  unassignedTitle: string;
  unassignedOption: string;
  emptyText: string;
  startPrompt: string;
  endDialogMessage: string;
  adjustDialogMessage: string;
  selectedEndAction: string;
  recordDateBeforeStartMessage: string;
  endAfterSaveFailureMessage: string;
  startDateSuffix: string;
  cycleLabel: (cycleNo: number) => string;
  startSuccess: (cycleNo: number) => string;
  startFailure: string;
  endSuccess: (cycleNo: number) => string;
  endFailure: string;
  datesUpdated: (cycleNo: number) => string;
  deleteTitle: (cycleNo: number) => string;
  deleteMessage: (recordCount: number) => string;
  deleteSuccess: (cycleNo: number, movedRecordCount: number) => string;
  recordAssignedSuccess: string;
  recordUnassignedSuccess: string;
};

const periodTerminology: ArchiveCycleTerminology = {
  unit: "期",
  firstAction: "开始第一期",
  newAction: "开始新一期",
  endAction: "结束本期",
  deleteAction: "删除本期",
  assignLabel: "所属期次",
  adjustLabel: "调整期次",
  unassignedTitle: "未分期记录",
  unassignedOption: "未分期",
  emptyText: "本期还没有记录。",
  startPrompt: "选择这一期的开始日期。",
  endDialogMessage: "结束后，本期会归档为已结束。",
  adjustDialogMessage: "修改这一期的日期。",
  selectedEndAction: "保存后结束所选期次",
  recordDateBeforeStartMessage: "记录日期不能早于本期开始日期。",
  endAfterSaveFailureMessage: "记录已保存，但未能结束本期，请稍后重试。",
  startDateSuffix: "开始",
  cycleLabel: (cycleNo) => `第${cycleNo}期`,
  startSuccess: (cycleNo) => `第${cycleNo}期已开始。`,
  startFailure: "开始新一期失败，请稍后重试。",
  endSuccess: (cycleNo) => `第${cycleNo}期已结束。`,
  endFailure: "结束本期失败，请稍后重试。",
  datesUpdated: (cycleNo) => `第${cycleNo}期日期已更新。`,
  deleteTitle: (cycleNo) => `删除第${cycleNo}期？`,
  deleteMessage: (recordCount) =>
    recordCount > 0
      ? `本期包含 ${recordCount} 条记录。删除后会连同记录和照片整组移入回收站，可从回收站恢复。`
      : "删除后会移入回收站，可从回收站恢复。",
  deleteSuccess: (cycleNo, movedRecordCount) =>
    movedRecordCount > 0
      ? `第${cycleNo}期及${movedRecordCount}条记录已移入回收站。`
      : `第${cycleNo}期已移入回收站。`,
  recordAssignedSuccess: "记录期次已更新。",
  recordUnassignedSuccess: "记录已设为未分期。",
};

const periodTerminologyEn: ArchiveCycleTerminology = {
  unit: "period",
  firstAction: "Start first period",
  newAction: "Start a new period",
  endAction: "End this period",
  deleteAction: "Delete period",
  assignLabel: "Period",
  adjustLabel: "Adjust period",
  unassignedTitle: "Records without a period",
  unassignedOption: "No period",
  emptyText: "No records in this period yet.",
  startPrompt: "Choose the start date for this period.",
  endDialogMessage: "This period will be archived as ended.",
  adjustDialogMessage: "Change the dates for this period.",
  selectedEndAction: "End the selected period after saving",
  recordDateBeforeStartMessage: "The record date cannot be earlier than the period’s start date.",
  endAfterSaveFailureMessage: "The record was saved, but the period could not be ended. Try again later.",
  startDateSuffix: "start",
  cycleLabel: (cycleNo) => `Period ${cycleNo}`,
  startSuccess: (cycleNo) => `Period ${cycleNo} started.`,
  startFailure: "Could not start a new period. Try again later.",
  endSuccess: (cycleNo) => `Period ${cycleNo} ended.`,
  endFailure: "Could not end this period. Try again later.",
  datesUpdated: (cycleNo) => `Dates for period ${cycleNo} updated.`,
  deleteTitle: (cycleNo) => `Delete period ${cycleNo}?`,
  deleteMessage: (recordCount) =>
    recordCount > 0
      ? `This period contains ${recordCount} records. The period, records, and photos will move to Trash together and can be restored there.`
      : "This period will move to Trash and can be restored there.",
  deleteSuccess: (cycleNo, movedRecordCount) =>
    movedRecordCount > 0
      ? `Period ${cycleNo} and ${movedRecordCount} records moved to Trash.`
      : `Period ${cycleNo} moved to Trash.`,
  recordAssignedSuccess: "The record’s period was updated.",
  recordUnassignedSuccess: "The record is no longer assigned to a period.",
};

export function getArchiveCycleTerminology(
  _category?: string | null,
  language: Language = "zh"
) {
  if (language === "en") {
    return periodTerminologyEn;
  }

  return periodTerminology;
}
