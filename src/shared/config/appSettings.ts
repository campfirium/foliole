export const APP_SETTINGS_STORAGE_KEYS = {
  markdownSyntaxVisibility: 'foliole-markdown-syntax-visibility'
} as const;

export const APP_SETTINGS_OPTIONS = {
  markdownSyntaxVisibility: ['hidden', 'visible'] as const
} as const;

export type MarkdownSyntaxVisibility = (typeof APP_SETTINGS_OPTIONS.markdownSyntaxVisibility)[number];

export interface PersistedAppSettings {
  markdownSyntaxVisibility: MarkdownSyntaxVisibility;
}

export const DEFAULT_PERSISTED_APP_SETTINGS: PersistedAppSettings = {
  markdownSyntaxVisibility: 'hidden'
};
