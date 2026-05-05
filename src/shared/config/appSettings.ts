import { MANAGED_INBOX_APP_SETTING_KEY } from '../../../lib/platform/managedInbox.js';

export const APP_SETTINGS_STORAGE_KEYS = {
  markdownSyntaxVisibility: 'foliole-markdown-syntax-visibility',
  autoLocalizeRemoteImages: 'foliole-auto-localize-remote-images',
  editorDisplayMode: 'foliole-editor-display-mode',
  settingsActiveCategory: 'foliole-settings-active-category',
  uiFont: 'foliole-ui-font-preset',
  customUiFont: 'foliole-custom-ui-font-family',
  interfaceFont: 'foliole-interface-font-preset',
  monospaceFont: 'foliole-monospace-font-preset',
  baseColor: 'foliole-base-color',
  pdfReadingMode: 'foliole-pdf-reading-mode',
  readingLineHeight: 'foliole-reading-line-height',
  dimImagesInDarkMode: 'foliole-dim-images-in-dark-mode',
  fontColor: 'foliole-font-color',
  accentColor: 'foliole-accent-color',
  selectionColor: 'foliole-selection-color',
  highlightColor: 'foliole-highlight-color',
  clozeColor: 'foliole-cloze-color',
  fontColorDark: 'foliole-font-color-dark',
  accentColorDark: 'foliole-accent-color-dark',
  selectionColorDark: 'foliole-selection-color-dark',
  highlightColorDark: 'foliole-highlight-color-dark',
  clozeColorDark: 'foliole-cloze-color-dark',
  workspaceSurfacePalette: 'foliole-workspace-surface-palette',
  workspaceSurfaceAssignments: 'foliole-workspace-surface-assignments',
  workspaceSurfacePaletteDark: 'foliole-workspace-surface-palette-dark',
  workspaceSurfaceAssignmentsDark: 'foliole-workspace-surface-assignments-dark',
  workspaceSurfaceGeneratorMode: 'foliole-workspace-surface-generator-mode',
  workspaceSurfaceRecommendationId: 'foliole-workspace-surface-recommendation-id',
  workspaceSurfaceAutoSeed: 'foliole-workspace-surface-auto-seed',
  workspaceSurfaceAutoOptions: 'foliole-workspace-surface-auto-options',
  workspaceSurfaceRandomHistory: 'foliole-workspace-surface-random-history',
  workspaceSurfaceFavorites: 'foliole-workspace-surface-favorites',
  workspaceSurfaceGeneratorModeDark: 'foliole-workspace-surface-generator-mode-dark',
  workspaceSurfaceRecommendationIdDark: 'foliole-workspace-surface-recommendation-id-dark',
  workspaceSurfaceAutoSeedDark: 'foliole-workspace-surface-auto-seed-dark',
  workspaceSurfaceAutoOptionsDark: 'foliole-workspace-surface-auto-options-dark',
  workspaceSurfaceRandomHistoryDark: 'foliole-workspace-surface-random-history-dark',
  workspaceSurfaceFavoritesDark: 'foliole-workspace-surface-favorites-dark',
  interfaceFontSize: 'foliole-interface-font-size',
  customInterfaceFont: 'foliole-custom-interface-font-family',
  customMonospaceFont: 'foliole-custom-monospace-font-family',
  mouseGestureLeftAction: 'foliole-mouse-gesture-left-action',
  mouseGestureRightAction: 'foliole-mouse-gesture-right-action',
  mouseGestureLeftUpAction: 'foliole-mouse-gesture-left-up-action',
  mouseGestureLeftDownAction: 'foliole-mouse-gesture-left-down-action',
  mouseGestureTrailColor: 'foliole-mouse-gesture-trail-color',
  mouseGestureTrailLineWidth: 'foliole-mouse-gesture-trail-line-width',
  mouseGestureTrailOpacity: 'foliole-mouse-gesture-trail-opacity',
  mouseGestureSegmentThreshold: 'foliole-mouse-gesture-segment-threshold',
  mouseGestureTrailPointThreshold: 'foliole-mouse-gesture-trail-point-threshold',
  nodeIconPendingStrokeStyle: 'foliole-node-icon-pending-stroke-style',
  nodeIconScheduledStrokeStyle: 'foliole-node-icon-scheduled-stroke-style',
  nodeIconDismissedStrokeStyle: 'foliole-node-icon-dismissed-stroke-style',
  nodeIconPendingDashLength: 'foliole-node-icon-pending-dash-length',
  nodeIconScheduledDashLength: 'foliole-node-icon-scheduled-dash-length',
  nodeIconDismissedDashLength: 'foliole-node-icon-dismissed-dash-length',
  nodeIconPendingGapLength: 'foliole-node-icon-pending-gap-length',
  nodeIconScheduledGapLength: 'foliole-node-icon-scheduled-gap-length',
  nodeIconDismissedGapLength: 'foliole-node-icon-dismissed-gap-length',
  nodeIconPendingLineWidth: 'foliole-node-icon-pending-line-width',
  nodeIconScheduledLineWidth: 'foliole-node-icon-scheduled-line-width',
  nodeIconDismissedLineWidth: 'foliole-node-icon-dismissed-line-width',
  nodeIconPendingColor: 'foliole-node-icon-pending-color',
  nodeIconScheduledColor: 'foliole-node-icon-scheduled-color',
  nodeIconDismissedColor: 'foliole-node-icon-dismissed-color',
  nodeIconPrimarySvg: 'foliole-node-icon-primary-svg',
  nodeIconSecondarySvg: 'foliole-node-icon-secondary-svg',
  nodeIconReviewVariantMode: 'foliole-node-icon-review-variant-mode',
  nodeIconDismissedFadeEnabled: 'foliole-node-icon-dismissed-fade-enabled',
  nodeIconDismissedFadeOpacity: 'foliole-node-icon-dismissed-fade-opacity',
  nodeIconDismissedFadeWholeRow: 'foliole-node-icon-dismissed-fade-whole-row',
  nodeListRowSpacing: 'foliole-node-list-row-spacing',
  nodeListManualCollapsed: 'foliole-node-list-manual-collapsed',
  nodeListManualExpanded: 'foliole-node-list-manual-expanded',
  nodeTrashManualCollapsed: 'foliole-node-trash-manual-collapsed',
  workspaceContentSort: 'foliole-workspace-content-sort',
  externalLibraryCollapsed: 'foliole-external-library-collapsed',
  listCollapsed: 'foliole-workspace-list-collapsed',
  listWidth: 'foliole-workspace-list-width',
  dualListWidth: 'foliole-workspace-dual-list-width',
  virtualSectionHeight: 'foliole-workspace-virtual-section-height',
  externalSectionHeight: 'foliole-workspace-external-section-height',
  documentWidth: 'foliole-workspace-document-width',
  linkPanelSize: 'foliole-link-panel-size',
  externalDocumentPreviewPanelSize: 'foliole-external-document-preview-panel-size',
  rightSidebarCollapsed: 'foliole-workspace-right-sidebar-collapsed',
  rightSidebarWidth: 'foliole-workspace-right-sidebar-width',
  rightSidebarActivePanel: 'foliole-workspace-right-sidebar-active-panel',
  rightSidebarPanelOrder: 'foliole-workspace-right-sidebar-panel-order',
  importManagementActivePage: 'foliole-import-management-active-page',
  managedInboxPath: MANAGED_INBOX_APP_SETTING_KEY,
  commandRecents: 'foliole-command-recents',
  nodePaletteRecents: 'foliole-node-palette-recents',
  commandShortcutOverrides: 'foliole-command-shortcut-overrides',
  desktopDeviceSyncEnabled: 'foliole-desktop-device-sync-enabled'
} as const;

export const APP_SETTINGS_OPTIONS = {
  markdownSyntaxVisibility: ['hidden', 'visible'] as const,
  editorDisplayMode: ['preview', 'source'] as const,
  pdfReadingMode: ['original', 'inverted', 'warm'] as const,
  readingLineHeight: ['compact', 'standard', 'relaxed'] as const
} as const;

export type MarkdownSyntaxVisibility = (typeof APP_SETTINGS_OPTIONS.markdownSyntaxVisibility)[number];
export type EditorDisplayMode = (typeof APP_SETTINGS_OPTIONS.editorDisplayMode)[number];
export type PdfReadingMode = (typeof APP_SETTINGS_OPTIONS.pdfReadingMode)[number];
export type ReadingLineHeight = (typeof APP_SETTINGS_OPTIONS.readingLineHeight)[number];

export interface PersistedAppSettings {
  autoLocalizeRemoteImages: boolean;
  markdownSyntaxVisibility: MarkdownSyntaxVisibility;
  editorDisplayMode: EditorDisplayMode;
}

export const DEFAULT_PERSISTED_APP_SETTINGS: PersistedAppSettings = {
  autoLocalizeRemoteImages: true,
  markdownSyntaxVisibility: 'hidden',
  editorDisplayMode: 'preview'
};
