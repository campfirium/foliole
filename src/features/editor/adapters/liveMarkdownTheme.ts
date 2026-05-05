import { EditorView } from '@codemirror/view';

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
  '.cm-line.cm-line-h1': { fontSize: 'var(--content-panel-h1-font-size, 1.5rem)', fontWeight: '700', letterSpacing: '-0.01em', paddingBottom: '0.25rem', paddingTop: '0.75rem' },
  '.cm-line.cm-line-h2': { fontSize: 'var(--content-panel-h2-font-size, 1.25rem)', fontWeight: '700', paddingBottom: '0.2rem', paddingTop: '0.65rem' },
  '.cm-line.cm-line-h3': { fontSize: 'var(--content-panel-h3-font-size, 1.08rem)', fontWeight: '650', paddingTop: '0.5rem' },
  '.cm-line.cm-line-list, .cm-line.cm-line-list-unordered': { paddingLeft: '0.2rem' },
  '.cm-line.cm-line-quote': { borderLeft: '2px solid var(--app-accent-color)', color: 'var(--color-text-primary)', paddingBottom: '0.15rem', paddingTop: '0.15rem', paddingLeft: '0.75rem' },
  '.cm-line.cm-line-code, .cm-line.cm-line-code-fence': { backgroundColor: 'rgba(15, 23, 42, 0.06)', borderRadius: 0, fontFamily: 'var(--content-panel-mono-font-family, var(--font-family-mono))', fontSize: 'var(--content-panel-code-font-size, 0.86rem)', padding: '0 0.5rem' },
  '.cm-line.cm-line-code-fence-hidden': { backgroundColor: 'transparent', borderRadius: 0, border: 0, fontSize: '0', lineHeight: '0', margin: 0, minHeight: 0, overflow: 'hidden', padding: '0 !important' },
  '.cm-line.cm-line-frontmatter-hidden': { fontSize: '0', lineHeight: '0', margin: 0, minHeight: '0', padding: '0 !important' },
  '.cm-line.cm-line-title-heading-hidden': { fontSize: '0', lineHeight: '0', margin: 0, minHeight: '0', padding: '0 !important' },
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
  '.cm-md-link-text': { color: 'var(--app-accent-color)', cursor: 'pointer', textDecoration: 'underline' },
  '.cm-md-highlight': { backgroundColor: 'rgba(56, 189, 248, 0.28)', borderRadius: '0.25rem' },
  '.cm-md-cloze': { backgroundColor: 'rgba(250, 204, 21, 0.32)', borderRadius: '0.25rem' },
  '.cm-md-anchor-overlap': { backgroundColor: 'rgba(56, 189, 248, 0.32)', borderRadius: '0.25rem' },
  '.cm-md-highlight-overlap': { backgroundColor: 'rgba(56, 189, 248, 0.2)', borderRadius: '0.25rem' },
  '.cm-md-cloze-placeholder': { backgroundColor: 'rgba(251, 113, 133, 0.24)', borderRadius: '0.25rem' },
  '.cm-md-anchor-tag-token': { color: 'var(--app-accent-color)', opacity: '0.9' },
  '.cm-md-anchor-tag-delimiter': { color: 'var(--app-accent-color)', opacity: '0.7' },
  '.cm-md-anchor-tag-kind': { color: 'var(--app-accent-color)', fontWeight: '700', opacity: '1' },
  '.cm-md-anchor-tag-attr': { color: 'var(--app-accent-color)', opacity: '0.75' },
  '.cm-md-anchor-tag-id': { color: 'var(--app-accent-color)', fontWeight: '700', opacity: '1' },
  '.cm-md-prefix-widget': { color: 'var(--color-text-secondary)', display: 'inline-block', whiteSpace: 'pre' },
  '.cm-md-prefix-unordered-list, .cm-md-prefix-ordered-list': { color: '#a0a5ad', fontWeight: '500', opacity: '0.95' },
  '.cm-md-image-widget': { display: 'block', marginBottom: '0.24rem', marginTop: '0.24rem', maxWidth: '100%' },
  '.cm-md-image-element': { border: '1px solid color-mix(in srgb, var(--color-border-strong) 36%, transparent)', borderRadius: '0.45rem', display: 'block', height: 'auto', maxWidth: '100%', width: 'auto', objectFit: 'contain' },
  '.cm-activeLine': { backgroundColor: 'transparent' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
    backgroundColor: 'rgba(var(--app-accent-color-rgb), 0.26)'
  }
});
