export const APP_SETTINGS_STORAGE_KEYS = {
  markdownSyntaxVisibility: 'foliole-markdown-syntax-visibility',
  editorDisplayMode: 'foliole-editor-display-mode'
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
