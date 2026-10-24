export const liveMarkdownCodeFenceTheme = {
  '.cm-line.cm-line-code-copy-start': { paddingRight: '2.45rem', position: 'relative' },
  '.cm-md-code-copy-button': {
    alignItems: 'center',
    backgroundColor: 'color-mix(in srgb, var(--app-surface, var(--role-legacy-elevated-rgb)) 92%, transparent)',
    border: '1px solid rgb(var(--role-legacy-border-rgb) / 0.5)',
    borderRadius: 'var(--editor-radius-xl)',
    color: 'rgb(var(--role-ink-rgb) / 0.72)',
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
    backgroundColor: 'color-mix(in srgb, var(--app-surface, var(--role-legacy-elevated-rgb)) 82%, var(--role-ink-rgb) 8%)',
    color: 'rgb(var(--role-ink-rgb))'
  },
  '.cm-md-code-copy-button:focus-visible': {
    outline: '1px solid rgb(var(--color-ring))',
    outlineOffset: '2px'
  },
  '.cm-md-code-copy-button[data-copy-status="copied"]': {
    color: 'var(--role-accent)',
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
  '.cm-md-code-tok-keyword': { color: 'var(--role-accent)', fontWeight: '600' },
  '.cm-md-code-tok-atom': { color: 'color-mix(in srgb, var(--role-accent) 82%, var(--role-text))' },
  '.cm-md-code-tok-number': { color: 'color-mix(in srgb, var(--role-accent) 70%, var(--role-text))' },
  '.cm-md-code-tok-string': { color: 'color-mix(in srgb, var(--role-highlight) 45%, var(--role-text))' },
  '.cm-md-code-tok-comment': { color: 'var(--role-text-secondary)', fontStyle: 'italic', opacity: '0.82' },
  '.cm-md-code-tok-variable': { color: 'var(--role-text)' },
  '.cm-md-code-tok-definition': { color: 'var(--role-text)', fontWeight: '600' },
  '.cm-md-code-tok-property': { color: 'color-mix(in srgb, var(--role-accent) 55%, var(--role-text))' },
  '.cm-md-code-tok-type': { color: 'color-mix(in srgb, var(--role-accent) 72%, var(--role-text))' },
  '.cm-md-code-tok-tag': { color: 'var(--role-accent)', fontWeight: '600' },
  '.cm-md-code-tok-attribute': { color: 'color-mix(in srgb, var(--role-accent) 62%, var(--role-text))' },
  '.cm-md-code-tok-operator': { color: 'var(--role-text-secondary)' }
} as const;
