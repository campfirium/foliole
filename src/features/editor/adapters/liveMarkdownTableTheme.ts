export const liveMarkdownTableTheme = {
  '.cm-md-table-widget': {
    boxSizing: 'border-box',
    marginBottom: '0.45rem',
    marginTop: '0.45rem',
    maxWidth: '100%',
    overflowX: 'auto',
    position: 'relative'
  },
  '.cm-md-table-preview-button': {
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
    zIndex: '2'
  },
  '.cm-md-table-widget:hover .cm-md-table-preview-button, .cm-md-table-preview-button:focus-visible': {
    opacity: '1'
  },
  '.cm-md-table-preview-button:hover': {
    backgroundColor: 'color-mix(in srgb, var(--app-surface, var(--color-bg-elevated)) 82%, var(--color-foreground) 8%)',
    color: 'rgb(var(--color-foreground))'
  },
  '.cm-md-table-preview-button:focus-visible': {
    outline: '1px solid rgb(var(--color-ring))',
    outlineOffset: '2px'
  },
  '.cm-md-table-preview-button svg': {
    fill: 'none',
    height: '0.95rem',
    pointerEvents: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    strokeWidth: '2',
    width: '0.95rem'
  },
  '.cm-md-table': {
    borderBottom: '1.5px solid rgb(var(--color-border-strong) / 0.62)',
    borderCollapse: 'separate',
    borderSpacing: '0',
    borderTop: '1.5px solid rgb(var(--color-border-strong) / 0.62)',
    fontSize: '0.94em',
    lineHeight: '1.45',
    minWidth: '100%',
    tableLayout: 'auto',
    width: 'max-content'
  },
  '.cm-md-table-preview': { minWidth: 'max-content' },
  '.cm-md-table-cell': {
    border: '0',
    borderBottom: '1px solid rgb(var(--color-border) / 0.42)',
    maxWidth: '24rem',
    padding: '0.38rem 0.58rem',
    textAlign: 'left',
    verticalAlign: 'top',
    whiteSpace: 'normal'
  },
  '.cm-md-table-row-header .cm-md-table-cell': {
    backgroundColor: 'color-mix(in srgb, var(--app-surface, var(--color-bg-subtle)) 84%, var(--color-foreground) 6%)',
    borderBottom: '1.5px solid rgb(var(--color-border-strong) / 0.62)',
    fontWeight: '650'
  },
  '.cm-md-table-row:last-child .cm-md-table-cell': { borderBottom: '0' }
};
