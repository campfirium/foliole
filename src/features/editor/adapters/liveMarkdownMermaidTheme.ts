export const liveMarkdownMermaidTheme = {
  '.cm-line.cm-line-mermaid-block': {
    backgroundColor: 'transparent',
    fontSize: 'inherit',
    lineHeight: 'inherit',
    padding: 'var(--editor-space-sm) 0'
  },
  '.cm-line.cm-line-mermaid-source-hidden': {
    fontSize: '0',
    lineHeight: '0',
    margin: 0,
    minHeight: '0',
    overflow: 'hidden',
    padding: '0 !important'
  },
  '.cm-md-mermaid-widget': {
    boxSizing: 'border-box',
    color: 'var(--content-panel-text-color, var(--color-text-primary))',
    margin: 'var(--editor-space-lg) 0 calc(var(--editor-space-lg) * 1.35)',
    padding: '0'
  },
  '.cm-md-mermaid-surface': {
    backgroundColor: 'rgb(var(--color-foreground) / 0.045)',
    border: '1px solid rgb(var(--color-border-strong) / 0.36)',
    borderRadius: 'var(--editor-radius-md)',
    boxSizing: 'border-box',
    overflow: 'hidden',
    position: 'relative'
  },
  '.cm-md-mermaid-widget:hover .cm-md-mermaid-preview-button, .cm-md-mermaid-preview-button:focus-visible': {
    opacity: '1'
  },
  '.cm-md-mermaid-preview-button': {
    zIndex: 'var(--z-local-overlay)'
  },
  '.cm-md-mermaid-body': {
    boxSizing: 'border-box',
    minHeight: '10rem',
    overflowX: 'auto',
    padding: 'var(--editor-space-lg) var(--editor-space-md) var(--editor-space-md)'
  },
  '.cm-md-mermaid-body > svg': {
    display: 'block',
    height: 'auto',
    margin: '0 auto',
    maxWidth: '100%'
  },
  '.cm-md-mermaid-body > svg text, .cm-md-mermaid-body > svg tspan, .cm-md-mermaid-preview > svg text, .cm-md-mermaid-preview > svg tspan': {
    fill: 'var(--color-text-primary) !important'
  },
  '.cm-md-mermaid-body > svg .today, .cm-md-mermaid-preview > svg .today': {
    stroke: 'var(--color-danger, #ff6868) !important',
    strokeWidth: '2px !important'
  },
  '.cm-md-mermaid-widget[data-md-mermaid-kind="quadrantchart"] .cm-md-mermaid-body > svg': {
    maxWidth: 'min(100%, 42rem)'
  },
  '.cm-md-mermaid-widget[data-md-mermaid-kind="quadrantchart"] .cm-md-mermaid-body': {
    padding: 'var(--editor-space-md) var(--editor-space-lg) var(--editor-space-lg)'
  },
  '.cm-md-mermaid-widget[data-md-mermaid-kind="gantt"] .cm-md-mermaid-body > svg': {
    maxWidth: 'none',
    minWidth: '72rem'
  },
  '.cm-md-mermaid-widget[data-md-mermaid-kind="gantt"] .cm-md-mermaid-body': {
    minHeight: '13rem',
    padding: 'var(--editor-space-md)'
  },
  '.cm-md-mermaid-preview': {
    alignItems: 'flex-start',
    display: 'flex',
    justifyContent: 'center',
    minWidth: '100%',
    width: '100%'
  },
  '.cm-md-mermaid-preview svg': {
    flex: '0 0 auto',
    display: 'block',
    height: 'auto',
    maxWidth: 'none',
    width: '100%'
  },
  '.cm-md-mermaid-preview[data-md-mermaid-kind="quadrantchart"]': {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 'min(38rem, calc(100vh - 12rem))'
  },
  '.cm-md-mermaid-preview[data-md-mermaid-kind="quadrantchart"] svg': {
    maxWidth: 'min(100%, 62rem)',
    width: 'min(100%, 62rem)'
  },
  '.cm-md-mermaid-preview[data-md-mermaid-kind="gantt"]': {
    justifyContent: 'flex-start',
    minWidth: 'min(92rem, calc(100vw - 12rem))'
  },
  '.cm-md-mermaid-preview[data-md-mermaid-kind="gantt"] svg': {
    minWidth: '92rem',
    width: '92rem'
  },
  '.cm-md-mermaid-widget-error': {
    color: 'var(--color-text-secondary)',
    fontFamily: 'var(--content-panel-mono-font-family, var(--font-family-mono))',
    fontSize: 'var(--content-panel-code-font-size, 0.86rem)',
    whiteSpace: 'pre-wrap'
  }
} as const;
