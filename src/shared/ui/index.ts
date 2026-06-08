// Foundation controls: reusable across desktop workbench surfaces and companion shell.
export { AppBreadcrumb, type AppBreadcrumbItem } from './Breadcrumb';
export { AppButton } from './Button';
export {
  AppDialog,
  AppDialogClose,
  AppDialogContent,
  AppDialogDescription,
  AppDialogOverlay,
  AppDialogPortal,
  AppDialogTitle,
  AppDialogTrigger
} from './Dialog';
export { AppIconButton } from './IconButton';
export { AppInput } from './Input';
export {
  appInputBorderFocusVisibleClassName,
  appInputFocusVisibleClassName
} from './InputFocus';
export { LucideCatalogIcon, LUCIDE_ICON_OPTIONS } from './LucideIconCatalog';
export { AppPanel } from './Panel';
export { AppToolbar } from './Toolbar';
export { ToolbarActionGroup } from './ToolbarActionGroup';
export {
  AppTooltip,
  AppTooltipContent,
  AppTooltipPortal,
  AppTooltipProvider,
  AppTooltipTrigger
} from './Tooltip';
export { TruncatedTextTooltip } from './TruncatedTextTooltip';

// Feedback and status surfaces: empty, loading, error, badges, confirmation, and startup fallback.
export { AppConfirmationProvider } from './AppConfirmationProvider';
export {
  requestAppConfirmation,
  requestAppTextInput,
  type AppConfirmationOptions,
  type AppTextInputOptions
} from './appConfirmation';
export { AppEmptyState, AppErrorState, AppLoadingState, AppSpinner } from './EmptyState';
export { AppStatusBadge } from './StatusBadge';
export { StartupErrorBoundary } from './StartupErrorBoundary';
export {
  createStartupBootSurfaceModel,
  createStartupErrorSurfaceModel,
  renderStartupBootView,
  renderStartupErrorView,
  StartupSurface,
  type StartupErrorActions,
  type StartupErrorViewModel,
  type StartupSurfaceAction,
  type StartupSurfaceModel
} from './StartupSurface';

// Floating surfaces: dropdowns, selection menus, and reusable floating class contracts.
export {
  AppDropdownMenu,
  AppDropdownMenuCheckItem,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuLabel,
  AppDropdownMenuPortal,
  AppDropdownMenuSeparator,
  AppDropdownMenuTrigger,
  AppSelectionDropdownMenu,
  AppSelectionDropdownMenuItem
} from './DropdownMenu';
export {
  appFloatingEmptyStateClassName,
  appFloatingInputClassName,
  appFloatingItemClassName,
  appFloatingListClassName,
  appFloatingMetaBadgeClassName,
  appFloatingOverlayClassName,
  appFloatingSectionHeaderClassName,
  appFloatingSurfaceClassName
} from './FloatingSurface';

// Workbench list and inspector patterns: shared desktop structure, not settings-specific.
export { AppListHeader, AppListItem, AppListSectionHeader, AppListSurface } from './ListSurface';
export { ActionHelpCard, type ActionHelpCardCopy } from './ActionHelpCard';
export { InspectorSection } from './InspectorSection';
export { NodeBrowseList, type NodeBrowseListItem } from './NodeBrowseList';
export {
  ObjectConfigHeader,
  ObjectConfigPathButton,
  ObjectConfigPathControl,
  ObjectConfigRow,
  ObjectConfigTable
} from './ObjectConfigTable';
export {
  shouldVirtualizeList,
  VirtualListSurface,
  type VirtualListRenderMeta
} from './VirtualListSurface';

// Review patterns: action hierarchy consumers for desktop review and companion review shell.
export {
  ContinueReadingAction,
  FsrsRevealAction,
  ReadingReviewActions,
  ReviewCompleteAction,
  ResumeReviewAction,
  ReviewGradeActions
} from './ReviewActionControls';
export { ReviewActionBar } from './ReviewActionBar';

// Settings patterns: shared only because settings pages reuse them; do not treat as generic controls.
export {
  SETTINGS_ACTION_TABLE_EXTERNAL_LIBRARY_COLUMNS_CLASS_NAME,
  SETTINGS_ACTION_TABLE_IMPORT_SOURCE_COLUMNS_CLASS_NAME,
  settingsActionTableAddButtonClassName,
  settingsActionTableClassName,
  settingsActionTableHeaderClassName,
  settingsActionTableRowClassName
} from './SettingsActionTable';
export {
  SETTINGS_ACTION_BUTTON_WIDTH_CLASS_NAME,
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SETTINGS_BUTTON_WIDTH_CLASS_NAME,
  SETTINGS_COMPOUND_CONTROL_WIDTH_CLASS_NAME,
  SETTINGS_INPUT_WIDTH_CLASS_NAME,
  SETTINGS_INPUT_VALUE_WIDTH_CLASS_NAME,
  SETTINGS_PATH_BUTTON_WIDTH_CLASS_NAME,
  SETTINGS_PATH_CONTROL_CLASS_NAME,
  SETTINGS_PATH_FIELD_WIDTH_CLASS_NAME,
  SETTINGS_PATH_RESET_BUTTON_CLASS_NAME,
  SETTINGS_PATH_VALUE_WIDTH_CLASS_NAME,
  SETTINGS_RANGE_WIDTH_CLASS_NAME,
  SETTINGS_SELECT_WIDTH_CLASS_NAME,
  SETTINGS_SURFACE_SIDEBAR_GRID_CLASS_NAME,
  SETTINGS_ACTION_ROW_CLASS_NAME,
  SETTINGS_HOTKEY_LIST_COLUMNS_CLASS_NAME,
  settingsHotkeyChipClassName,
  settingsHotkeyChipClearClassName,
  settingsHotkeyRowClassName,
  settingsHotkeySearchFieldClassName,
  settingsHotkeySearchHeaderClassName,
  settingsHotkeySearchPanelClassName,
  settingsHotkeyToolbarClassName,
  SETTINGS_VALUE_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  SettingsGroup,
  SettingsRow,
  SettingsSection,
  settingsButtonClassName,
  settingsColorFieldClassName,
  settingsFieldClassName,
  settingsControlValueClassName,
  settingsIconButtonClassName,
  settingsPaletteButtonClassName,
  settingsSwitchClassName,
  settingsRangeClassName,
  settingsResetButtonClassName,
  settingsSwitchKnobClassName,
  settingsToggleButtonClassName,
  settingsUtilityIconButtonClassName,
  settingsColorSwatchClassName,
  settingsValueBoxClassName
} from './SettingsLayout';
export type { SettingsSegmentedOption } from './SettingsSegmentedControl';
export { SettingsSegmentedControl, SettingsSegmentedRow } from './SettingsSegmentedControl';
export {
  SettingsEmptyState,
  SettingsErrorState,
  SettingsLoadingState,
  SettingsStateAction
} from './SettingsStateSurface';
