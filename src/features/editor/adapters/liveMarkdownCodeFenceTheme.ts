export const liveMarkdownCodeFenceTheme = {
  '.cm-line.cm-line-code-copy-start': { paddingRight: '2.45rem', position: 'relative' },
  '.cm-md-code-copy-button': {
    alignItems: 'center',
    backgroundColor: 'color-mix(in srgb, var(--app-surface, var(--color-bg-elevated)) 92%, transparent)',
    border: '1px solid rgb(var(--color-border) / 0.5)',
    borderRadius: 'var(--editor-radius-xl)',
    color: 'rgb(var(--color-foreground) / 0.72)',
    cursor: 'pointer',
    display: 'inline-flex',
    height: '1.75rem',
    justifyContent: 'center',
    opacity: '0',
    padding: '0',
    position: 'absolute',
    right: '0.35rem',
    top: '0.35rem',
    transition: 'background-color 120ms ease, color 120ms ease, opacity 120ms ease',
    width: '1.75rem',
    zIndex: 'var(--z-local-overlay)'
  },
  '.cm-line-code-copy-start:hover .cm-md-code-copy-button, .cm-md-code-copy-button:focus-visible': {
    opacity: '1'
  },
  '.cm-md-code-copy-button:hover': {
    backgroundColor: 'color-mix(in srgb, var(--app-surface, var(--color-bg-elevated)) 82%, var(--color-foreground) 8%)',
    color: 'rgb(var(--color-foreground))'
  },
  '.cm-md-code-copy-button:focus-visible': {
    outline: '1px solid rgb(var(--color-ring))',
    outlineOffset: '2px'
  },
  '.cm-md-code-copy-button[data-copy-status="copied"]': {
    color: 'var(--app-accent-color)',
    opacity: '1'
  },
  '.cm-md-code-copy-button svg': {
    fill: 'none',
    height: '0.95rem',
    pointerEvents: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    strokeWidth: '2',
    width: '0.95rem'
  },
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
