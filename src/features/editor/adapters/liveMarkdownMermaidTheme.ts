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
    margin: 'var(--editor-space-md) 0 var(--editor-space-lg)',
    overflowX: 'auto',
    padding: 'var(--editor-space-xs) 0'
  },
  '.cm-md-mermaid-widget svg': {
    display: 'block',
    height: 'auto',
    margin: '0 auto',
    maxWidth: '100%'
  },
  '.cm-md-mermaid-widget[data-md-mermaid-kind="quadrantchart"] svg': {
    maxWidth: 'min(100%, 48rem)'
  },
  '.cm-md-mermaid-widget[data-md-mermaid-kind="gantt"] svg': {
    minWidth: '72rem'
  },
  '.cm-md-mermaid-widget-error': {
    color: 'var(--color-text-secondary)',
    fontFamily: 'var(--content-panel-mono-font-family, var(--font-family-mono))',
    fontSize: 'var(--content-panel-code-font-size, 0.86rem)',
    whiteSpace: 'pre-wrap'
  }
} as const;
