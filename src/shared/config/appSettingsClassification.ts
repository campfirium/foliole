import { APP_SETTINGS_STORAGE_KEYS } from './appSettings.js';

export const APP_SETTINGS_PERSISTENCE_KINDS = {
  rendererPreference: 'renderer-preference',
  runtimeMirroredRendererSnapshot: 'runtime-mirrored-renderer-snapshot',
  desktopRuntimeState: 'desktop-runtime-state',
  crossHostSyncState: 'cross-host-sync-state',
  uiSessionOnly: 'ui-session-only'
} as const;

export type AppSettingsPersistenceKind =
  (typeof APP_SETTINGS_PERSISTENCE_KINDS)[keyof typeof APP_SETTINGS_PERSISTENCE_KINDS];
export type AppSettingsStorageName = keyof typeof APP_SETTINGS_STORAGE_KEYS;

export interface AppSettingsClassification {
  kind: AppSettingsPersistenceKind;
  allowLocalStorage: boolean;
  allowRuntimeAppSettings: boolean;
}

export const RUNTIME_MIRRORED_APP_SETTING_NAMES = [
  'markdownSyntaxVisibility',
  'highlightAnnotationPrefix',
  'longClozeFrontGuardMode',
  'longClozeFrontGuardSelectionMin',
  'longClozeFrontGuardFrontMax',
  'autoLocalizeRemoteImages',
  'editorDisplayMode',
  'settingsActiveCategory',
  'workspaceRailItems',
  'uiFont',
  'customUiFont',
  'interfaceFont',
  'monospaceFont',
  'baseColor',
  'pdfReadingMode',
  'readingLineHeight',
  'readingContentWidth',
  'dimImagesInDarkMode',
  'fontColor',
  'accentColor',
  'selectionColor',
  'highlightColor',
  'clozeColor',
  'fontColorDark',
  'accentColorDark',
  'selectionColorDark',
  'highlightColorDark',
  'clozeColorDark',
  'workspaceSurfacePalette',
  'workspaceSurfaceAssignments',
  'workspaceSurfacePaletteDark',
  'workspaceSurfaceAssignmentsDark',
  'workspaceSurfaceGeneratorMode',
  'workspaceSurfaceRecommendationId',
  'workspaceSurfaceAutoSeed',
  'workspaceSurfaceAutoOptions',
  'workspaceSurfaceRandomHistory',
  'workspaceSurfaceFavorites',
  'workspaceSurfaceGeneratorModeDark',
  'workspaceSurfaceRecommendationIdDark',
  'workspaceSurfaceAutoSeedDark',
  'workspaceSurfaceAutoOptionsDark',
  'workspaceSurfaceRandomHistoryDark',
  'workspaceSurfaceFavoritesDark',
  'interfaceFontSize',
  'customInterfaceFont',
  'customMonospaceFont',
  'mouseGestureLeftAction',
  'mouseGestureRightAction',
  'mouseGestureLeftUpAction',
  'mouseGestureLeftDownAction',
  'mouseGestureTrailColor',
  'mouseGestureTrailLineWidth',
  'mouseGestureTrailOpacity',
  'mouseGestureSegmentThreshold',
  'mouseGestureTrailPointThreshold',
  'nodeIconPrimarySvg',
  'nodeIconSecondarySvg',
  'nodeIconPrimaryLucideIcon',
  'nodeIconSecondaryLucideIcon',
  'nodeIconPrimaryAppearance',
  'nodeIconSecondaryAppearance',
  'nodeIconReviewVariantMode',
  'nodeIconPendingStrokeStyle',
  'nodeIconScheduledStrokeStyle',
  'nodeIconDismissedStrokeStyle',
  'nodeIconPendingDashLength',
  'nodeIconScheduledDashLength',
  'nodeIconDismissedDashLength',
  'nodeIconPendingGapLength',
  'nodeIconScheduledGapLength',
  'nodeIconDismissedGapLength',
  'nodeIconPendingLineWidth',
  'nodeIconScheduledLineWidth',
  'nodeIconDismissedLineWidth',
  'nodeIconPendingColor',
  'nodeIconScheduledColor',
  'nodeIconDismissedColor',
  'nodeIconDismissedFadeEnabled',
  'nodeIconDismissedFadeOpacity',
  'nodeIconDismissedFadeWholeRow',
  'nodeIconPendingTopicAppearance',
  'nodeIconPendingItemAppearance',
  'nodeIconScheduledTopicAppearance',
  'nodeIconScheduledItemAppearance',
  'nodeIconDismissedTopicAppearance',
  'nodeIconDismissedItemAppearance',
  'nodeListRowSpacing',
  'nodeListManualCollapsed',
  'nodeListManualExpanded',
  'nodeTrashManualCollapsed',
  'workspaceContentSort',
  'externalLibraryCollapsed',
  'externalLibraryFolderOrder',
  'listCollapsed',
  'listWidth',
  'dualListWidth',
  'virtualSectionHeight',
  'externalSectionHeight',
  'documentWidth',
  'linkPanelSize',
  'externalDocumentPreviewPanelSize',
  'rightSidebarCollapsed',
  'rightSidebarWidth',
  'rightSidebarActivePanel',
  'rightSidebarPanelOrder',
  'importManagementActivePage',
  'managedInboxPath',
  'commandRecents',
  'nodePaletteRecents',
  'commandShortcutOverrides'
] as const satisfies readonly AppSettingsStorageName[];

export const RENDERER_PREFERENCE_APP_SETTING_NAMES = [] as const satisfies readonly AppSettingsStorageName[];
export const DESKTOP_RUNTIME_APP_SETTING_NAMES = [] as const satisfies readonly AppSettingsStorageName[];
export const CROSS_HOST_SYNC_APP_SETTING_NAMES = [
  'desktopDeviceSyncEnabled'
] as const satisfies readonly AppSettingsStorageName[];
export const UI_SESSION_ONLY_APP_SETTING_NAMES = [] as const satisfies readonly AppSettingsStorageName[];

function createClassification(kind: AppSettingsPersistenceKind): AppSettingsClassification {
  return {
    kind,
    allowLocalStorage:
      kind === APP_SETTINGS_PERSISTENCE_KINDS.rendererPreference ||
      kind === APP_SETTINGS_PERSISTENCE_KINDS.runtimeMirroredRendererSnapshot,
    allowRuntimeAppSettings:
      kind === APP_SETTINGS_PERSISTENCE_KINDS.runtimeMirroredRendererSnapshot ||
      kind === APP_SETTINGS_PERSISTENCE_KINDS.desktopRuntimeState ||
      kind === APP_SETTINGS_PERSISTENCE_KINDS.crossHostSyncState
  };
}

function addClassifications(
  target: Partial<Record<AppSettingsStorageName, AppSettingsClassification>>,
  names: readonly AppSettingsStorageName[],
  kind: AppSettingsPersistenceKind
) {
  for (const name of names) {
    target[name] = createClassification(kind);
  }
}

const classifications: Partial<Record<AppSettingsStorageName, AppSettingsClassification>> = {};
addClassifications(
  classifications,
  RUNTIME_MIRRORED_APP_SETTING_NAMES,
  APP_SETTINGS_PERSISTENCE_KINDS.runtimeMirroredRendererSnapshot
);
addClassifications(classifications, RENDERER_PREFERENCE_APP_SETTING_NAMES, APP_SETTINGS_PERSISTENCE_KINDS.rendererPreference);
addClassifications(classifications, DESKTOP_RUNTIME_APP_SETTING_NAMES, APP_SETTINGS_PERSISTENCE_KINDS.desktopRuntimeState);
addClassifications(classifications, CROSS_HOST_SYNC_APP_SETTING_NAMES, APP_SETTINGS_PERSISTENCE_KINDS.crossHostSyncState);
addClassifications(classifications, UI_SESSION_ONLY_APP_SETTING_NAMES, APP_SETTINGS_PERSISTENCE_KINDS.uiSessionOnly);

export const APP_SETTINGS_CLASSIFICATIONS = classifications as Record<AppSettingsStorageName, AppSettingsClassification>;

export function getAppSettingsKey(name: AppSettingsStorageName) {
  return APP_SETTINGS_STORAGE_KEYS[name];
}

export function getClassifiedAppSettingsKeys(predicate: (classification: AppSettingsClassification) => boolean) {
  return Object.entries(APP_SETTINGS_CLASSIFICATIONS)
    .filter(([, classification]) => predicate(classification))
    .map(([name]) => getAppSettingsKey(name as AppSettingsStorageName));
}

export function getLocalStorageAppSettingsKeys() {
  return getClassifiedAppSettingsKeys((classification) => classification.allowLocalStorage);
}

export function getRuntimeAppSettingsKeys() {
  return getClassifiedAppSettingsKeys((classification) => classification.allowRuntimeAppSettings);
}
