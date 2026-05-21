export const liveMarkdownCodeFenceTheme = {
  '.cm-md-code-tok-keyword': { color: 'var(--app-accent-color)', fontWeight: '600' },
  '.cm-md-code-tok-atom': { color: 'color-mix(in srgb, var(--app-accent-color) 82%, var(--color-text-primary))' },
  '.cm-md-code-tok-number': { color: 'color-mix(in srgb, var(--app-accent-color) 70%, var(--color-text-primary))' },
  '.cm-md-code-tok-string': { color: 'color-mix(in srgb, var(--app-highlight-color) 45%, var(--color-text-primary))' },
  '.cm-md-code-tok-comment': { color: 'var(--color-text-secondary)', fontStyle: 'italic', opacity: '0.82' },
  '.cm-md-code-tok-variable': { color: 'var(--color-text-primary)' },
  '.cm-md-code-tok-definition': { color: 'var(--color-text-primary)', fontWeight: '600' },
  '.cm-md-code-tok-property': { color: 'color-mix(in srgb, var(--app-accent-color) 55%, var(--color-text-primary))' },
  '.cm-md-code-tok-type': { color: 'color-mix(in srgb, var(--app-accent-color) 72%, var(--color-text-primary))' },
  '.cm-md-code-tok-tag': { color: 'var(--app-accent-color)', fontWeight: '600' },
  '.cm-md-code-tok-attribute': { color: 'color-mix(in srgb, var(--app-accent-color) 62%, var(--color-text-primary))' },
  '.cm-md-code-tok-operator': { color: 'var(--color-text-secondary)' }
} as const;
