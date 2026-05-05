import { MANAGED_INBOX_APP_SETTING_KEY } from '../../../lib/platform/managedInbox';

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
  accentColor: 'foliole-accent-color',
  selectionColor: 'foliole-selection-color',
  highlightColor: 'foliole-highlight-color',
  clozeColor: 'foliole-cloze-color',
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
  listCollapsed: 'foliole-workspace-list-collapsed',
  listWidth: 'foliole-workspace-list-width',
  dualListWidth: 'foliole-workspace-dual-list-width',
  documentWidth: 'foliole-workspace-document-width',
  linkPanelSize: 'foliole-link-panel-size',
  rightSidebarCollapsed: 'foliole-workspace-right-sidebar-collapsed',
  rightSidebarWidth: 'foliole-workspace-right-sidebar-width',
  rightSidebarActivePanel: 'foliole-workspace-right-sidebar-active-panel',
  rightSidebarPanelOrder: 'foliole-workspace-right-sidebar-panel-order',
  importManagementActivePage: 'foliole-import-management-active-page',
  managedInboxPath: MANAGED_INBOX_APP_SETTING_KEY,
  commandRecents: 'foliole-command-recents',
  nodePaletteRecents: 'foliole-node-palette-recents',
  commandShortcutOverrides: 'foliole-command-shortcut-overrides'
} as const;

export const APP_SETTINGS_OPTIONS = {
  markdownSyntaxVisibility: ['hidden', 'visible'] as const,
  editorDisplayMode: ['preview', 'source'] as const
} as const;

export type MarkdownSyntaxVisibility = (typeof APP_SETTINGS_OPTIONS.markdownSyntaxVisibility)[number];
export type EditorDisplayMode = (typeof APP_SETTINGS_OPTIONS.editorDisplayMode)[number];

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
