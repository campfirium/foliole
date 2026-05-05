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
  customMonospaceFont: 'foliole-custom-monospace-font-family'
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
