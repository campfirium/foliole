import { EditorView } from '@codemirror/view';

import { liveMarkdownFrontmatterTheme } from './liveMarkdownFrontmatterTheme';
import { liveMarkdownImageTheme } from './liveMarkdownImageTheme';
import { liveMarkdownSpacing } from './liveMarkdownSpacing';
import { liveMarkdownTableTheme } from './liveMarkdownTableTheme';

const TEXT_SELECTION_BACKGROUND_COLOR = 'var(--app-text-selection-bg-color)';
const SHARED_HIGHLIGHT_SURFACE_COLOR = 'var(--app-highlight-surface-color)';
const SHARED_CLOZE_SURFACE_COLOR = 'var(--app-cloze-surface-color)';
const DIFF_ADDED_SURFACE_COLOR = 'var(--app-diff-added-surface-color)';
const DIFF_ADDED_SPACER_COLOR = 'var(--app-diff-added-spacer-color)';
const DIFF_REMOVED_SURFACE_COLOR = 'var(--app-diff-removed-surface-color)';
const DIFF_REMOVED_SPACER_COLOR = 'var(--app-diff-removed-spacer-color)';

export const liveMarkdownTheme = EditorView.theme({
  '&': { backgroundColor: 'transparent', height: '100%' },
  '.cm-scroller': {
    color: 'var(--content-panel-text-color, var(--color-text-primary))',
    lineHeight: 'var(--content-panel-line-height, 1.75)'
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--color-text-primary)'
  },
  '.cm-content': {
    boxSizing: 'border-box',
    caretColor: 'var(--color-text-primary)',
    fontFamily: 'var(--content-panel-font-family, var(--font-family-sans))',
    fontSize: 'var(--content-panel-font-size, 1.0625rem)',
    margin: '0 auto',
    maxWidth: 'min(100%, var(--document-max-width, 860px))',
    padding: liveMarkdownSpacing.contentPadding,
    width: '100%'
  },
  '.cm-widgetBuffer': { width: '0px' },
  '.cm-line': { padding: 0 },
  '.cm-line:has(.cm-md-image-widget-block)': { fontSize: '0', lineHeight: '0', minHeight: '0' },
  '.cm-line.cm-line-h1': { fontSize: 'var(--content-panel-h1-font-size, 1.5rem)', fontWeight: '700', letterSpacing: '-0.01em', paddingBottom: liveMarkdownSpacing.h1BlockEnd, paddingTop: liveMarkdownSpacing.h1BlockStart },
  '.cm-line.cm-line-h2': { fontSize: 'var(--content-panel-h2-font-size, 1.25rem)', fontWeight: '700', paddingBottom: liveMarkdownSpacing.h2BlockEnd, paddingTop: liveMarkdownSpacing.h2BlockStart },
  '.cm-line.cm-line-h3': { fontSize: 'var(--content-panel-h3-font-size, 1.08rem)', fontWeight: '650', paddingTop: liveMarkdownSpacing.h3BlockStart },
  '.cm-line.cm-line-list, .cm-line.cm-line-list-unordered': { paddingLeft: liveMarkdownSpacing.listInlineStart },
  '.cm-line.cm-line-quote': { borderLeft: 'var(--editor-border-width-accent) solid var(--app-accent-color)', color: 'var(--color-text-primary)', paddingBottom: 'var(--editor-space-xxs)', paddingTop: 'var(--editor-space-xxs)', paddingLeft: 'var(--editor-space-md)' },
  '.cm-line.cm-line-code, .cm-line.cm-line-code-fence': { backgroundColor: 'rgb(var(--color-foreground) / 0.06)', borderRadius: 0, fontFamily: 'var(--content-panel-mono-font-family, var(--font-family-mono))', fontSize: 'var(--content-panel-code-font-size, 0.86rem)', padding: liveMarkdownSpacing.codeLinePadding },
  '.cm-line.cm-line-code-fence-hidden': { backgroundColor: 'transparent', borderRadius: 0, border: 0, fontSize: '0', lineHeight: '0', margin: 0, minHeight: 0, overflow: 'hidden', padding: '0 !important' },
  '.cm-line.cm-md-table-source-hidden': { fontSize: '0', lineHeight: '0', margin: 0, minHeight: '0', overflow: 'hidden', padding: '0 !important' },
  '.cm-line.cm-line-frontmatter-hidden': { fontSize: '0', lineHeight: '0', margin: 0, minHeight: '0', padding: '0 !important' },
  '.cm-line.cm-line-link-reference-hidden': { fontSize: '0', lineHeight: '0', margin: 0, minHeight: '0', padding: '0 !important' },
  '.cm-line.cm-line-title-heading-hidden': { fontSize: '0', lineHeight: '0', margin: 0, minHeight: '0', padding: '0 !important' },
  '.cm-line.cm-diff-line': { borderRadius: 'var(--editor-radius-lg)' },
  '.cm-line.cm-diff-line-added': { backgroundColor: DIFF_ADDED_SURFACE_COLOR },
  '.cm-line.cm-diff-line-removed': { backgroundColor: DIFF_REMOVED_SURFACE_COLOR },
  '.cm-diff-spacer': { pointerEvents: 'none' },
  '.cm-diff-spacer-added': { backgroundColor: DIFF_ADDED_SPACER_COLOR, borderRadius: 'var(--editor-radius-lg)' },
  '.cm-diff-spacer-removed': { backgroundColor: DIFF_REMOVED_SPACER_COLOR, borderRadius: 'var(--editor-radius-lg)' },
  '.cm-diff-spacer-line': { color: 'transparent', userSelect: 'none' },
  '.cm-md-syntax-visible': { color: 'var(--app-accent-color)', opacity: '0.74' },
  ...liveMarkdownFrontmatterTheme,
  '.cm-md-heading-syntax-hidden': {
    display: 'none'
  },
  '.cm-md-emphasis': { fontStyle: 'italic', fontSynthesisStyle: 'none' },
  '.cm-md-strong': { fontWeight: '600' },
  '.cm-md-strikethrough': { textDecoration: 'line-through' },
  '.cm-md-thematic-break': {
    borderTop: '1.5px solid rgb(var(--color-border-strong) / 0.58)',
    display: 'block',
    margin: liveMarkdownSpacing.thematicBreakMargin,
    width: '100%'
  },
  '.cm-document-section-divider': { padding: liveMarkdownSpacing.sectionDividerPadding },
  '.cm-md-inline-code': { backgroundColor: 'rgb(var(--color-foreground) / 0.08)', borderRadius: 'var(--editor-radius-md)', fontFamily: 'var(--content-panel-mono-font-family, var(--font-family-mono))', fontSize: 'var(--content-panel-code-font-size, 0.86rem)', padding: '0 var(--editor-space-xxs)' },
  '.cm-md-footnote-widget': { display: 'inline-block', lineHeight: '1', marginInline: liveMarkdownSpacing.footnoteMarkerInline, position: 'relative', verticalAlign: 'super' },
  '.cm-md-footnote-marker': {
    borderBottom: '1px dotted color-mix(in srgb, var(--app-accent-color) 60%, transparent)',
    color: 'var(--app-accent-color)',
    cursor: 'help',
    fontSize: liveMarkdownSpacing.footnoteMarkerFontSize,
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
    borderRadius: 'var(--editor-radius-popover)',
    bottom: 'calc(100% + var(--editor-space-sm))',
    boxShadow: 'var(--shadow-popover)',
    color: 'var(--color-text-primary)',
    left: '50%',
    lineHeight: '1.45',
    maxWidth: 'min(24rem, 60vw)',
    minWidth: '12rem',
    padding: liveMarkdownSpacing.footnoteTooltipPadding,
    position: 'absolute',
    transform: 'translateX(-50%)',
    whiteSpace: 'normal',
    zIndex: 'var(--z-surface-raised)'
  },
  '.cm-md-link-text': { color: 'var(--app-accent-color)', cursor: 'pointer', textDecoration: 'underline' },
  '.cm-md-source-highlight': {
    backgroundColor: 'var(--editor-source-highlight-surface-color)',
    borderRadius: 'var(--editor-radius-sm)'
  },
  '.cm-md-highlight': { backgroundColor: SHARED_HIGHLIGHT_SURFACE_COLOR, borderRadius: 'var(--editor-radius-md)', cursor: 'pointer' },
  '.cm-md-highlight:hover, .cm-md-highlight-active': {
    backgroundColor: 'color-mix(in srgb, var(--app-highlight-surface-color) 78%, rgb(var(--color-foreground)) 22%)'
  },
  '.cm-md-cloze': { backgroundColor: SHARED_CLOZE_SURFACE_COLOR, borderRadius: 'var(--editor-radius-md)' },
  '.cm-md-anchor-overlap': { backgroundColor: SHARED_HIGHLIGHT_SURFACE_COLOR, borderRadius: 'var(--editor-radius-md)', cursor: 'pointer' },
  '.cm-md-anchor-overlap:hover, .cm-md-anchor-overlap.cm-md-highlight-active': {
    backgroundColor: 'color-mix(in srgb, var(--app-highlight-surface-color) 78%, rgb(var(--color-foreground)) 22%)'
  },
  '.cm-md-highlight-overlap': { backgroundColor: SHARED_HIGHLIGHT_SURFACE_COLOR, borderRadius: 'var(--editor-radius-md)', cursor: 'pointer' },
  '.cm-md-highlight-overlap:hover, .cm-md-highlight-overlap.cm-md-highlight-active': {
    backgroundColor: 'color-mix(in srgb, var(--app-highlight-surface-color) 78%, rgb(var(--color-foreground)) 22%)'
  },
  '.cm-md-cloze-placeholder': { backgroundColor: SHARED_CLOZE_SURFACE_COLOR, borderRadius: 'var(--editor-radius-md)' },
  '.cm-md-anchor-tag-token': { color: 'var(--app-accent-color)', opacity: '0.9' },
  '.cm-md-anchor-tag-delimiter': { color: 'var(--app-accent-color)', opacity: '0.7' },
  '.cm-md-anchor-tag-kind': { color: 'var(--app-accent-color)', fontWeight: '700', opacity: '1' },
  '.cm-md-anchor-tag-attr': { color: 'var(--app-accent-color)', opacity: '0.75' },
  '.cm-md-anchor-tag-id': { color: 'var(--app-accent-color)', fontWeight: '700', opacity: '1' },
  '.cm-md-prefix-widget': { color: 'var(--color-text-secondary)', display: 'inline-block', whiteSpace: 'pre' },
  '.cm-md-prefix-unordered-list, .cm-md-prefix-ordered-list': { color: 'var(--color-text-secondary)', fontWeight: '500', opacity: '0.95' },
  '.cm-md-prefix-task-list': { display: 'inline-flex', alignItems: 'center', height: '1em', marginRight: liveMarkdownSpacing.taskPrefixInlineEnd, verticalAlign: '-0.08em' },
  '.cm-md-task-checkbox': {
    border: '1px solid rgb(var(--color-border-strong) / 0.72)',
    borderRadius: 'var(--editor-radius-sm)',
    boxSizing: 'border-box',
    display: 'inline-block',
    height: liveMarkdownSpacing.taskCheckboxSize,
    position: 'relative',
    width: liveMarkdownSpacing.taskCheckboxSize
  },
  '.cm-md-task-checkbox[data-md-task-checked="true"]': {
    backgroundColor: 'var(--app-accent-color)',
    borderColor: 'var(--app-accent-color)'
  },
  '.cm-md-task-checkbox[data-md-task-checked="true"]::after': {
    borderBottom: '1.5px solid rgb(var(--color-bg-elevated))',
    borderRight: '1.5px solid rgb(var(--color-bg-elevated))',
    content: '""',
    height: liveMarkdownSpacing.taskCheckHeight,
    left: liveMarkdownSpacing.taskCheckLeft,
    position: 'absolute',
    top: liveMarkdownSpacing.taskCheckTop,
    transform: 'rotate(42deg)',
    width: liveMarkdownSpacing.taskCheckWidth
  },
  '.cm-md-callout-title': { color: 'var(--app-accent-color)', fontWeight: '650' },
  ...liveMarkdownTableTheme,
  ...liveMarkdownImageTheme,
  '.cm-topic-search-match': {
    backgroundColor: 'color-mix(in srgb, var(--app-highlight-surface-color) 68%, transparent)',
    borderRadius: 'var(--editor-radius-md)'
  },
  '.cm-topic-search-match-active': {
    backgroundColor: 'color-mix(in srgb, var(--app-selection-surface-color) 78%, var(--app-highlight-surface-color))',
    borderRadius: 'var(--editor-radius-md)',
    boxShadow: 'var(--editor-shadow-inset-match)'
  },
  '.cm-paragraph-marker-line': {
    position: 'relative'
  },
  '.cm-paragraph-marker-line::before': {
    backgroundColor: 'var(--app-accent-color)',
    bottom: '0',
    content: '""',
    left: '-1.2em',
    pointerEvents: 'none',
    position: 'absolute',
    top: '0',
    width: '3px'
  },
  '.cm-activeLine': { backgroundColor: 'transparent' },
  '.cm-content ::selection': {
    backgroundColor: TEXT_SELECTION_BACKGROUND_COLOR,
    color: 'var(--app-text-selection-fg-color)',
    WebkitTextFillColor: 'var(--app-text-selection-fg-color)'
  },
  '&[data-paragraph-marker-active="true"] .cm-content ::selection': {
    backgroundColor: 'transparent'
  }
});
