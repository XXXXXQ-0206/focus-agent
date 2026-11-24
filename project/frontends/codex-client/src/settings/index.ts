/**
 * 设置域对外出口。
 *
 * 契约（docs/ARCHITECTURE.md §5）：
 *   · 设置页主体：SettingsPage（挂到 /settings/:section，接线在 App.tsx 的路由表）
 *   · 侧栏设置导航：SettingsNav + 数据模型 nav-model.ts（面板归 cx-shell）
 *   · 设置项真实生效：store.ts（官方常规页 25 行 + 外观页 + 附加档位，全部写 DOM）
 *   · 控件原语：controls.tsx（SPEC §5 实测几何）
 *   · 快捷键：shortcuts.ts（数据来自 SPEC §4 §5，含真实按键捕获与可改键）
 *   · 非 C1 分区：panes/index.ts 的 SETTINGS_PANES（C2 组填充）
 */

export { ControlsGalleryPage } from "./ControlsGalleryPage";
export {
  type AppCommand,
  COMMANDS,
  type CommandContext,
  chordEquals,
  commandChord,
  findChordConflict,
  normalizeChord,
  resetAllCommandChords,
  setCommandCapture,
  setCommandChord,
  useCommandChords,
  useCommandHost,
} from "./commands";
export {
  SettingsBadge,
  SettingsButton,
  SettingsField,
  SettingsHotkeyButton,
  type SettingsOption,
  SettingsSecretInput,
  SettingsSegmented,
  SettingsSelect,
  SettingsSwitch,
  SettingsValueText,
} from "./controls";
export {
  DEFAULT_SETTINGS_SECTION,
  filterSettingsNav,
  findSettingsSection,
  OFFICIAL_SETTINGS_NAV_ITEMS,
  SETTINGS_NAV_GROUPS,
  SETTINGS_NAV_ITEMS,
  SETTINGS_SEARCH_ARIA_LABEL,
  SETTINGS_SEARCH_EMPTY,
  SETTINGS_SEARCH_PLACEHOLDER,
  type SettingsNavGroup,
  type SettingsNavIcon,
  type SettingsNavItem,
  VISIBLE_SETTINGS_NAV_GROUPS,
} from "./nav-model";
export {
  clearPaneStates,
  RESET_SETTINGS_LABEL,
  ResetSettingsSection,
  resetProjectSettings,
} from "./reset-settings";
export { SettingsNav } from "./SettingsNav";
export { SettingsPage } from "./SettingsPage";
export {
  SettingsCard,
  SettingsCardBody,
  SettingsRow,
  type SettingsRowProps,
  SettingsSection,
} from "./SettingsRow";
export {
  type AppLanguage,
  applySettings,
  type CodexSettings,
  type ConfirmBeforeClose,
  type CornerScale,
  DEFAULT_PROJECTLESS_CHAT_FOLDER,
  DEFAULT_SETTINGS,
  type DiffMarkerStyle,
  type EnterBehavior,
  type FollowUpMode,
  type FontScale,
  getSettings,
  type NotificationSound,
  type OpenTarget,
  resetSettings,
  SETTINGS_ROW_HEIGHT_VAR,
  type SettingsDensity,
  type TerminalShell,
  type TurnCompleteNotification,
  updateSettings,
  useSetting,
  useSettings,
} from "./store";
