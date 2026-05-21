export const liveMarkdownMathTheme = {
  '.cm-md-math-widget-inline': { display: 'inline-block', paddingInline: '0.08em', verticalAlign: '-0.08em' },
  '.cm-md-math-widget-block': {
    display: 'block',
    margin: 'var(--editor-space-md) 0',
    overflowX: 'auto',
    overflowY: 'hidden',
    padding: 'var(--editor-space-xs) 0'
  },
  '.cm-md-math-widget-with-overlay': { position: 'relative' },
  '.cm-md-formula-cloze-overlay': { inset: 0, pointerEvents: 'none', position: 'absolute' },
  '.cm-md-formula-cloze-region, .cm-md-formula-cloze-draft': {
    borderRadius: 'var(--editor-radius-sm)',
    boxSizing: 'border-box',
    position: 'absolute'
  },
  '.cm-md-formula-cloze-region[data-md-formula-region-hidden="true"]': {
    backgroundColor: 'var(--app-cloze-surface-color)'
  },
  '.cm-md-formula-cloze-region[data-md-formula-region-outlined="true"]': {
    border: '1px solid color-mix(in srgb, var(--app-cloze-color) 72%, transparent)'
  },
  '.cm-md-formula-cloze-draft': {
    backgroundColor: 'color-mix(in srgb, var(--app-selection-surface-color) 42%, transparent)',
    border: '1px solid var(--app-accent-color)'
  },
  '.cm-md-math-widget-error': {
    backgroundColor: 'rgb(var(--color-foreground) / 0.08)',
    borderRadius: 'var(--editor-radius-sm)',
    color: 'var(--color-text-secondary)',
    fontFamily: 'var(--content-panel-mono-font-family, var(--font-family-mono))',
    fontSize: 'var(--content-panel-code-font-size, 0.86rem)',
    padding: '0 var(--editor-space-xxs)',
    whiteSpace: 'pre-wrap'
  }
};
