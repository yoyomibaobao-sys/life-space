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

const roundTerminology: ArchiveCycleTerminology = {
  unit: "轮",
  firstAction: "开始第一轮",
  newAction: "开始新一轮",
  endAction: "本轮结束",
  deleteAction: "删除本轮",
  assignLabel: "归入轮次",
  adjustLabel: "调整轮次",
  unassignedTitle: "未分轮记录",
  unassignedOption: "未分轮",
  emptyText: "本轮还没有记录。",
  startPrompt: "选择这一轮的开始日期。",
  endDialogMessage: "结束后，本轮会归档为已结束。",
  adjustDialogMessage: "修改这一轮的日期。",
  selectedEndAction: "保存后结束所选轮次",
  recordDateBeforeStartMessage: "记录日期不能早于本轮开始日期。",
  endAfterSaveFailureMessage: "记录已保存，但未能结束本轮，请稍后重试。",
  startDateSuffix: "开始",
  cycleLabel: (cycleNo) => `第${cycleNo}轮`,
  startSuccess: (cycleNo) => `第${cycleNo}轮已开始。`,
  startFailure: "开始新一轮失败，请稍后重试。",
  endSuccess: (cycleNo) => `第${cycleNo}轮已结束。`,
  endFailure: "结束本轮失败，请稍后重试。",
  datesUpdated: (cycleNo) => `第${cycleNo}轮日期已更新。`,
  deleteTitle: (cycleNo) => `删除第${cycleNo}轮？`,
  deleteMessage: (recordCount) =>
    recordCount > 0
      ? `本轮包含 ${recordCount} 条记录。删除后会连同记录和照片整组移入回收站，可从回收站恢复。`
      : "删除后会移入回收站，可从回收站恢复。",
  deleteSuccess: (cycleNo, movedRecordCount) =>
    movedRecordCount > 0
      ? `第${cycleNo}轮及${movedRecordCount}条记录已移入回收站。`
      : `第${cycleNo}轮已移入回收站。`,
  recordAssignedSuccess: "记录轮次已更新。",
  recordUnassignedSuccess: "记录已设为未分轮。",
};

const roundTerminologyEn: ArchiveCycleTerminology = {
  unit: "round",
  firstAction: "Start first round",
  newAction: "Start a new round",
  endAction: "End this round",
  deleteAction: "Delete round",
  assignLabel: "Round",
  adjustLabel: "Adjust round",
  unassignedTitle: "Records without a round",
  unassignedOption: "No round",
  emptyText: "No records in this round yet.",
  startPrompt: "Choose the start date for this round.",
  endDialogMessage: "This round will be archived as ended.",
  adjustDialogMessage: "Change the dates for this round.",
  selectedEndAction: "End the selected round after saving",
  recordDateBeforeStartMessage: "The record date cannot be earlier than the round’s start date.",
  endAfterSaveFailureMessage: "The record was saved, but the round could not be ended. Try again later.",
  startDateSuffix: "start",
  cycleLabel: (cycleNo) => `Round ${cycleNo}`,
  startSuccess: (cycleNo) => `Round ${cycleNo} started.`,
  startFailure: "Could not start a new round. Try again later.",
  endSuccess: (cycleNo) => `Round ${cycleNo} ended.`,
  endFailure: "Could not end this round. Try again later.",
  datesUpdated: (cycleNo) => `Dates for round ${cycleNo} updated.`,
  deleteTitle: (cycleNo) => `Delete round ${cycleNo}?`,
  deleteMessage: (recordCount) =>
    recordCount > 0
      ? `This round contains ${recordCount} records. The round, records, and photos will move to Trash together and can be restored there.`
      : "This round will move to Trash and can be restored there.",
  deleteSuccess: (cycleNo, movedRecordCount) =>
    movedRecordCount > 0
      ? `Round ${cycleNo} and ${movedRecordCount} records moved to Trash.`
      : `Round ${cycleNo} moved to Trash.`,
  recordAssignedSuccess: "The record’s round was updated.",
  recordUnassignedSuccess: "The record is no longer assigned to a round.",
};

export function getArchiveCycleTerminology(
  _category?: string | null,
  language: Language = "zh"
) {
  if (language === "en") {
    return roundTerminologyEn;
  }

  return roundTerminology;
}
