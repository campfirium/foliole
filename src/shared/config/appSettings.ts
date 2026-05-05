export const APP_SETTINGS_STORAGE_KEYS = {
  markdownSyntaxVisibility: 'foliole-markdown-syntax-visibility',
  editorDisplayMode: 'foliole-editor-display-mode',
  settingsActiveCategory: 'foliole-settings-active-category',
  uiFont: 'foliole-ui-font-preset',
  customUiFont: 'foliole-custom-ui-font-family',
  interfaceFont: 'foliole-interface-font-preset',
  monospaceFont: 'foliole-monospace-font-preset',
  baseColor: 'foliole-base-color',
  accentColor: 'foliole-accent-color',
  interfaceFontSize: 'foliole-interface-font-size',
  customInterfaceFont: 'foliole-custom-interface-font-family',
  customMonospaceFont: 'foliole-custom-monospace-font-family',
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
  listCollapsed: 'foliole-workspace-list-collapsed',
  rightSidebarCollapsed: 'foliole-workspace-right-sidebar-collapsed',
  commandRecents: 'foliole-command-recents',
  commandShortcutOverrides: 'foliole-command-shortcut-overrides'
} as const;

export const APP_SETTINGS_OPTIONS = {
  markdownSyntaxVisibility: ['hidden', 'visible'] as const,
  editorDisplayMode: ['preview', 'source'] as const
} as const;

export type MarkdownSyntaxVisibility = (typeof APP_SETTINGS_OPTIONS.markdownSyntaxVisibility)[number];
export type EditorDisplayMode = (typeof APP_SETTINGS_OPTIONS.editorDisplayMode)[number];

export interface PersistedAppSettings {
  markdownSyntaxVisibility: MarkdownSyntaxVisibility;
  editorDisplayMode: EditorDisplayMode;
}

export const DEFAULT_PERSISTED_APP_SETTINGS: PersistedAppSettings = {
  markdownSyntaxVisibility: 'hidden',
  editorDisplayMode: 'preview'
};
