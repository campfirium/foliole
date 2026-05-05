import { EditorView } from '@codemirror/view';

const SHARED_SELECTION_SURFACE_COLOR = 'var(--app-selection-surface-color)';
const SHARED_HIGHLIGHT_SURFACE_COLOR = 'var(--app-highlight-surface-color)';
const SHARED_CLOZE_SURFACE_COLOR = 'var(--app-cloze-surface-color)';

export const liveMarkdownTheme = EditorView.theme({
  '&': { backgroundColor: 'transparent', height: '100%' },
  '.cm-scroller': { color: 'var(--color-text-primary)', lineHeight: '1.72' },
  '.cm-content': {
    boxSizing: 'border-box',
    fontFamily: 'var(--content-panel-font-family, var(--font-family-sans))',
    fontSize: 'var(--content-panel-font-size, 1.0625rem)',
    margin: '0 auto',
    maxWidth: 'min(100%, var(--document-max-width, 860px))',
    padding: '0.72rem 1.5rem var(--editor-content-padding-bottom, 0.6rem)',
    width: '100%'
  },
  '.cm-widgetBuffer': { width: '0px' },
  '.cm-line': { padding: 0 },
  '.cm-line:has(.cm-md-image-widget-block)': { fontSize: '0', lineHeight: '0', minHeight: '0' },
  '.cm-line.cm-line-h1': { fontSize: 'var(--content-panel-h1-font-size, 1.5rem)', fontWeight: '700', letterSpacing: '-0.01em', paddingBottom: '0.25rem', paddingTop: '0.75rem' },
  '.cm-line.cm-line-h2': { fontSize: 'var(--content-panel-h2-font-size, 1.25rem)', fontWeight: '700', paddingBottom: '0.2rem', paddingTop: '0.65rem' },
  '.cm-line.cm-line-h3': { fontSize: 'var(--content-panel-h3-font-size, 1.08rem)', fontWeight: '650', paddingTop: '0.5rem' },
  '.cm-line.cm-line-list, .cm-line.cm-line-list-unordered': { paddingLeft: '0.2rem' },
  '.cm-line.cm-line-quote': { borderLeft: '2px solid var(--app-accent-color)', color: 'var(--color-text-primary)', paddingBottom: '0.15rem', paddingTop: '0.15rem', paddingLeft: '0.75rem' },
  '.cm-line.cm-line-code, .cm-line.cm-line-code-fence': { backgroundColor: 'rgba(15, 23, 42, 0.06)', borderRadius: 0, fontFamily: 'var(--content-panel-mono-font-family, var(--font-family-mono))', fontSize: 'var(--content-panel-code-font-size, 0.86rem)', padding: '0 0.5rem' },
  '.cm-line.cm-line-code-fence-hidden': { backgroundColor: 'transparent', borderRadius: 0, border: 0, fontSize: '0', lineHeight: '0', margin: 0, minHeight: 0, overflow: 'hidden', padding: '0 !important' },
  '.cm-line.cm-line-frontmatter-hidden': { fontSize: '0', lineHeight: '0', margin: 0, minHeight: '0', padding: '0 !important' },
  '.cm-line.cm-line-title-heading-hidden': { fontSize: '0', lineHeight: '0', margin: 0, minHeight: '0', padding: '0 !important' },
  '.cm-line.cm-diff-line': { borderRadius: '0.35rem' },
  '.cm-line.cm-diff-line-added': { backgroundColor: 'rgba(34, 197, 94, 0.16)' },
  '.cm-line.cm-diff-line-removed': { backgroundColor: 'rgba(239, 68, 68, 0.14)' },
  '.cm-diff-spacer': { pointerEvents: 'none' },
  '.cm-diff-spacer-added': { backgroundColor: 'rgba(34, 197, 94, 0.12)', borderRadius: '0.35rem' },
  '.cm-diff-spacer-removed': { backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: '0.35rem' },
  '.cm-diff-spacer-line': { color: 'transparent', userSelect: 'none' },
  '.cm-md-syntax-visible': { color: 'var(--app-accent-color)', opacity: '0.74' },
  '.cm-md-frontmatter-summary': {
    color: 'color-mix(in srgb, var(--color-text-secondary) 82%, transparent)',
    fontSize: '0.82rem',
    fontWeight: '500',
    letterSpacing: '0.02em',
    lineHeight: '1.5',
    margin: '0.48rem 0 0.32rem',
    textAlign: 'center'
  },
  '.cm-md-strong': { fontWeight: '700' },
  '.cm-md-inline-code': { backgroundColor: 'rgba(15, 23, 42, 0.08)', borderRadius: '0.25rem', fontFamily: 'var(--content-panel-mono-font-family, var(--font-family-mono))', fontSize: 'var(--content-panel-code-font-size, 0.86rem)', padding: '0 0.15rem' },
  '.cm-md-footnote-widget': { display: 'inline-block', lineHeight: '1', marginInline: '0.05em', position: 'relative', verticalAlign: 'super' },
  '.cm-md-footnote-marker': {
    borderBottom: '1px dotted color-mix(in srgb, var(--app-accent-color) 60%, transparent)',
    color: 'var(--app-accent-color)',
    cursor: 'help',
    fontSize: '0.72em',
    fontWeight: '600',
    outline: 'none'
  },
  '.cm-md-footnote-widget[data-md-footnote-status="unresolved"] .cm-md-footnote-marker': {
    borderBottomStyle: 'dashed',
    color: 'color-mix(in srgb, var(--app-accent-color) 78%, var(--color-text-secondary))'
  },
  '.cm-md-footnote-tooltip': {
    backgroundColor: 'var(--color-bg-elevated)',
    border: '1px solid var(--color-border)',
    borderRadius: '0.75rem',
    bottom: 'calc(100% + 0.45rem)',
    boxShadow: 'var(--shadow-popover)',
    color: 'var(--color-text-primary)',
    left: '50%',
    lineHeight: '1.45',
    maxWidth: 'min(24rem, 60vw)',
    minWidth: '12rem',
    padding: '0.6rem 0.75rem',
    position: 'absolute',
    transform: 'translateX(-50%)',
    whiteSpace: 'normal',
    zIndex: '30'
  },
  '.cm-md-link-text': { color: 'var(--app-accent-color)', cursor: 'pointer', textDecoration: 'underline' },
  '.cm-md-highlight': { backgroundColor: SHARED_HIGHLIGHT_SURFACE_COLOR, borderRadius: '0.25rem' },
  '.cm-md-cloze': { backgroundColor: SHARED_CLOZE_SURFACE_COLOR, borderRadius: '0.25rem' },
  '.cm-md-anchor-overlap': { backgroundColor: SHARED_HIGHLIGHT_SURFACE_COLOR, borderRadius: '0.25rem' },
  '.cm-md-highlight-overlap': { backgroundColor: SHARED_HIGHLIGHT_SURFACE_COLOR, borderRadius: '0.25rem' },
  '.cm-md-cloze-placeholder': { backgroundColor: SHARED_CLOZE_SURFACE_COLOR, borderRadius: '0.25rem' },
  '.cm-md-anchor-tag-token': { color: 'var(--app-accent-color)', opacity: '0.9' },
  '.cm-md-anchor-tag-delimiter': { color: 'var(--app-accent-color)', opacity: '0.7' },
  '.cm-md-anchor-tag-kind': { color: 'var(--app-accent-color)', fontWeight: '700', opacity: '1' },
  '.cm-md-anchor-tag-attr': { color: 'var(--app-accent-color)', opacity: '0.75' },
  '.cm-md-anchor-tag-id': { color: 'var(--app-accent-color)', fontWeight: '700', opacity: '1' },
  '.cm-md-prefix-widget': { color: 'var(--color-text-secondary)', display: 'inline-block', whiteSpace: 'pre' },
  '.cm-md-prefix-unordered-list, .cm-md-prefix-ordered-list': { color: '#a0a5ad', fontWeight: '500', opacity: '0.95' },
  '.cm-md-image-widget': { maxWidth: '100%' },
  '.cm-md-image-widget-block': {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: '0.24rem',
    marginTop: '0.24rem',
    width: '100%'
  },
  '.cm-md-image-widget-inline': { display: 'inline-block', height: '1lh', lineHeight: '1', margin: '0 0.18rem', maxWidth: '100%', overflow: 'hidden', verticalAlign: 'text-bottom' },
  '.cm-md-image-element': {
    border: '1px solid color-mix(in srgb, var(--color-border-strong) 36%, transparent)',
    borderRadius: '0.45rem',
    boxSizing: 'border-box',
    display: 'block',
    height: 'auto',
    maxHeight: 'var(--editor-image-max-height, none)',
    maxWidth: 'var(--editor-image-max-width, 100%)',
    marginLeft: 'auto',
    marginRight: 'auto',
    objectFit: 'contain',
    width: 'auto',
  },
  '.cm-md-image-element-block': { height: 'auto' },
  '.cm-md-image-element-inline': { height: '100%', margin: 0, maxHeight: '1lh', verticalAlign: 'bottom' },
  '.cm-md-image-status': {
    alignItems: 'center',
    backgroundColor: 'color-mix(in srgb, var(--color-bg-muted) 88%, transparent)',
    border: '1px dashed color-mix(in srgb, var(--color-border-strong) 40%, transparent)',
    borderRadius: '0.45rem',
    color: 'var(--color-text-secondary)',
    display: 'flex',
    fontSize: '0.9rem',
    justifyContent: 'center',
    minHeight: '5rem',
    padding: '0.75rem'
  },
  '.cm-md-image-status-block': { minHeight: '5rem', padding: '0.75rem' },
  '.cm-md-image-status-inline': {
    borderRadius: '0.35rem',
    display: 'inline-flex',
    fontSize: '0.72em',
    height: '1lh',
    minHeight: '1lh',
    padding: '0 0.45em',
    verticalAlign: 'text-bottom'
  },
  '.cm-topic-search-match': {
    backgroundColor: 'color-mix(in srgb, var(--app-highlight-surface-color) 68%, transparent)',
    borderRadius: '0.25rem'
  },
  '.cm-topic-search-match-active': {
    backgroundColor: 'color-mix(in srgb, var(--app-selection-surface-color) 78%, var(--app-highlight-surface-color))',
    borderRadius: '0.25rem',
    boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--app-accent-color) 30%, transparent)'
  },
  '.cm-activeLine': { backgroundColor: 'transparent' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
    backgroundColor: SHARED_SELECTION_SURFACE_COLOR
  }
});
