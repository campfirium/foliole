export const liveMarkdownMathTheme = {
  '.cm-md-math-widget-inline': { display: 'inline-block', paddingInline: '0.08em', verticalAlign: '-0.08em' },
  '.cm-md-math-widget-block': {
    boxSizing: 'border-box',
    display: 'block',
    margin: 0,
    overflowX: 'auto',
    overflowY: 'hidden',
    padding: '1.5rem 0',
    position: 'relative',
    width: '100%'
  },
  '.cm-line.cm-line-math-block::before': { content: 'none', display: 'none' },
  '.cm-line.cm-line-math-block': {
    alignItems: 'center',
    backgroundColor: 'rgb(var(--role-ink-rgb) / 0.055)',
    display: 'flex',
    justifyContent: 'center',
    minHeight: 'calc((var(--content-panel-code-font-size, 0.86rem) * 1.75 + 0.2rem) * 3)',
    padding: '0.7rem 0.65rem',
    textAlign: 'center'
  },
  '.cm-line.cm-line-math-block.cm-activeLine': { backgroundColor: 'rgb(var(--role-ink-rgb) / 0.055)' },
  '.cm-md-math-widget-block .katex-display': { margin: 0 },
  '.cm-line.cm-line-math-source-hidden': {
    fontSize: '0',
    lineHeight: '0',
    margin: 0,
    minHeight: '0',
    overflow: 'hidden',
    padding: '0 !important'
  },
  '.cm-md-math-widget-with-overlay': { position: 'relative' },
  '.cm-md-math-source-button': {
    backgroundColor: 'rgb(var(--color-background-elevated) / 0.92)',
    border: '1px solid rgb(var(--color-border-subtle) / 0.86)',
    borderRadius: 'var(--editor-radius-sm)',
    color: 'var(--role-text-secondary)',
    cursor: 'pointer',
    fontFamily: 'var(--content-panel-mono-font-family, var(--font-family-mono))',
    fontSize: '0.68rem',
    lineHeight: '1',
    opacity: 0,
    padding: '0.18rem 0.24rem',
    position: 'absolute',
    right: '0.1rem',
    top: '0.1rem',
    transition: 'opacity 120ms ease',
    zIndex: 2
  },
  '.cm-md-math-widget-with-overlay:hover .cm-md-math-source-button, .cm-md-math-source-button:focus-visible': {
    opacity: 1
  },
  '.cm-line.cm-line-math-source': {
    backgroundColor: 'rgb(var(--role-ink-rgb) / 0.055)',
    fontFamily: 'var(--content-panel-mono-font-family, var(--font-family-mono))',
    fontSize: 'var(--content-panel-code-font-size, 0.86rem)',
    lineHeight: '1.75',
    padding: '0.1rem 0.65rem'
  },
  '.cm-line.cm-line-math-source::before': { content: 'none', display: 'none' },
  '.cm-md-math-source-shell': {
    fontFamily: 'var(--content-panel-mono-font-family, var(--font-family-mono))',
    whiteSpace: 'pre-wrap'
  },
  '.cm-md-math-source-delimiter': {
    color: 'var(--role-text-secondary)',
    fontWeight: '600'
  },
  '.cm-md-math-source-code': { color: 'var(--role-text)' },
  '.cm-md-math-source-command': {
    color: 'var(--role-accent)',
    fontWeight: '600'
  },
  '.cm-md-math-source-bracket': { color: 'color-mix(in srgb, var(--role-accent) 62%, var(--role-text))' },
  '.cm-md-math-source-number': { color: 'color-mix(in srgb, var(--role-highlight) 44%, var(--role-text))' },
  '.cm-md-math-source-operator': { color: 'var(--role-text-secondary)' },
  '.cm-md-formula-cloze-overlay': { inset: 0, pointerEvents: 'none', position: 'absolute' },
  '.cm-md-formula-cloze-region, .cm-md-formula-cloze-draft': {
    borderRadius: 'var(--editor-radius-sm)',
    boxSizing: 'border-box',
    position: 'absolute',
    zIndex: 1
  },
  '.cm-md-formula-cloze-region[data-md-formula-region-hidden="true"]': {
    backgroundColor: 'color-mix(in srgb, rgb(var(--role-ink-rgb)) 5.5%, var(--role-content-bg) 94.5%)',
    border: '2px solid rgb(var(--color-border-subtle) / 0.92)'
  },
  '.cm-md-formula-cloze-region[data-md-formula-region-outlined="true"]': {
    border: '2px dashed var(--role-accent)',
    backgroundColor: 'transparent'
  },
  '.cm-md-formula-cloze-draft': {
    backgroundColor: 'color-mix(in srgb, var(--role-selection-surface) 42%, transparent)',
    border: '1px solid var(--role-accent)'
  },
  '.cm-md-math-widget-error': {
    backgroundColor: 'rgb(var(--role-ink-rgb) / 0.08)',
    borderRadius: 'var(--editor-radius-sm)',
    color: 'var(--role-text-secondary)',
    fontFamily: 'var(--content-panel-mono-font-family, var(--font-family-mono))',
    fontSize: 'var(--content-panel-code-font-size, 0.86rem)',
    padding: '0 var(--editor-space-xxs)',
    whiteSpace: 'pre-wrap'
  }
};
