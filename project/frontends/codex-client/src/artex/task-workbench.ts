export const ARTEXTaskTabs = [
  { id: "activity", label: "活动" },
  { id: "sessions", label: "会话" },
  { id: "overview", label: "总览" },
  { id: "discovery", label: "发现" },
  { id: "retest", label: "复测" },
  { id: "assets", label: "资产" },
  { id: "coverage", label: "覆盖" },
  { id: "intercept", label: "拦截" },
  { id: "report", label: "报告" },
] as const;

export type TaskTabId = (typeof ARTEXTaskTabs)[number]["id"];

export function taskTabLabel(id: TaskTabId): string {
  return ARTEXTaskTabs.find((tab) => tab.id === id)?.label ?? "活动";
}
