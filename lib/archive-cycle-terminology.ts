import { isPlantArchiveCategory } from "@/lib/archive-categories";

export type ArchiveCycleTerminology = {
  unit: "茬" | "轮";
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

const plantTerminology: ArchiveCycleTerminology = {
  unit: "茬",
  firstAction: "开始第一茬",
  newAction: "开始新一茬",
  endAction: "本茬结束",
  deleteAction: "删除本茬",
  assignLabel: "归入茬次",
  adjustLabel: "调整茬次",
  unassignedTitle: "未分茬记录",
  unassignedOption: "未分茬",
  emptyText: "本茬还没有记录。",
  startPrompt: "选择这一茬的开始日期。",
  endDialogMessage: "结束后，本茬会归档为已结束。",
  adjustDialogMessage: "修改这一茬的日期。",
  selectedEndAction: "保存后结束所选茬次",
  recordDateBeforeStartMessage: "记录日期不能早于本茬开始日期。",
  endAfterSaveFailureMessage: "记录已保存，但未能结束本茬，请稍后重试。",
  cycleLabel: (cycleNo) => `第${cycleNo}茬`,
  startSuccess: (cycleNo) => `第${cycleNo}茬已开始。`,
  startFailure: "开始新一茬失败，请稍后重试。",
  endSuccess: (cycleNo) => `第${cycleNo}茬已结束。`,
  endFailure: "结束本茬失败，请稍后重试。",
  datesUpdated: (cycleNo) => `第${cycleNo}茬日期已更新。`,
  deleteTitle: (cycleNo) => `删除第${cycleNo}茬？`,
  deleteMessage: (recordCount) =>
    recordCount > 0
      ? `这茬包含 ${recordCount} 条记录。\n删除茬后，这些记录会保留并移到“未分茬记录”。`
      : "删除后无法恢复。",
  deleteSuccess: (cycleNo, movedRecordCount) =>
    movedRecordCount > 0
      ? `已删除第${cycleNo}茬，${movedRecordCount}条记录已移到未分茬。`
      : `已删除第${cycleNo}茬。`,
  recordAssignedSuccess: "记录茬次已更新。",
  recordUnassignedSuccess: "记录已设为未分茬。",
};

const roundTerminology: ArchiveCycleTerminology = {
  unit: "轮",
  firstAction: "开始第一轮",
  newAction: "开始新一轮",
  endAction: "本轮结束",
  deleteAction: "删除本轮",
  assignLabel: "归入轮次",
  adjustLabel: "调整轮次",
  unassignedTitle: "未归入轮次的记录",
  unassignedOption: "未归入轮次",
  emptyText: "本轮还没有记录。",
  startPrompt: "选择这一轮的开始日期。",
  endDialogMessage: "结束后，本轮会归档为已结束。",
  adjustDialogMessage: "修改这一轮的日期。",
  selectedEndAction: "保存后结束所选轮次",
  recordDateBeforeStartMessage: "记录日期不能早于本轮开始日期。",
  endAfterSaveFailureMessage: "记录已保存，但未能结束本轮，请稍后重试。",
  cycleLabel: (cycleNo) => `第${cycleNo}轮`,
  startSuccess: (cycleNo) => `第${cycleNo}轮已开始。`,
  startFailure: "开始新一轮失败，请稍后重试。",
  endSuccess: (cycleNo) => `第${cycleNo}轮已结束。`,
  endFailure: "结束本轮失败，请稍后重试。",
  datesUpdated: (cycleNo) => `第${cycleNo}轮日期已更新。`,
  deleteTitle: (cycleNo) => `删除第${cycleNo}轮？`,
  deleteMessage: (recordCount) =>
    recordCount > 0
      ? `本轮包含 ${recordCount} 条记录。\n删除本轮后，这些记录会保留并移到“未归入轮次的记录”。`
      : "删除后无法恢复。",
  deleteSuccess: (cycleNo, movedRecordCount) =>
    movedRecordCount > 0
      ? `已删除第${cycleNo}轮，${movedRecordCount}条记录已移到未归入轮次。`
      : `已删除第${cycleNo}轮。`,
  recordAssignedSuccess: "记录轮次已更新。",
  recordUnassignedSuccess: "记录已设为未归入轮次。",
};

export function getArchiveCycleTerminology(category?: string | null) {
  return isPlantArchiveCategory(category) ? plantTerminology : roundTerminology;
}
