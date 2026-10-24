import { EditorView } from '@codemirror/view';

import { liveMarkdownCodeFenceTheme } from './liveMarkdownCodeFenceTheme';
import { liveMarkdownFrontmatterTheme } from './liveMarkdownFrontmatterTheme';
import { liveMarkdownImageTheme } from './liveMarkdownImageTheme';
import { liveMarkdownMathTheme } from './liveMarkdownMathTheme';
import { liveMarkdownMermaidTheme } from './liveMarkdownMermaidTheme';
import { liveMarkdownSpacing } from './liveMarkdownSpacing';
import { liveMarkdownTableTheme } from './liveMarkdownTableTheme';

const TEXT_SELECTION_BACKGROUND_COLOR = 'var(--role-text-selection-bg)';
const SHARED_HIGHLIGHT_SURFACE_COLOR = 'var(--role-highlight-surface)';
const SHARED_CLOZE_SURFACE_COLOR = 'var(--role-cloze-surface)';
const DIFF_ADDED_SURFACE_COLOR = 'var(--app-diff-added-surface-color)';
const DIFF_ADDED_SPACER_COLOR = 'var(--app-diff-added-spacer-color)';
const DIFF_REMOVED_SURFACE_COLOR = 'var(--app-diff-removed-surface-color)';
const DIFF_REMOVED_SPACER_COLOR = 'var(--app-diff-removed-spacer-color)';

export const liveMarkdownTheme = EditorView.theme({
  '&': { backgroundColor: 'transparent', height: '100%' },
  '.markdown-editor-host[data-scroll-container="outer"] &': { height: 'auto', minHeight: '100%' },
  '.cm-scroller': {
    color: 'var(--content-panel-text-color, var(--role-text))',
    lineHeight: 'var(--content-panel-line-height, 1.75)'
  },
  '.markdown-editor-host[data-scroll-container="outer"] & .cm-scroller': { minHeight: '100%', overflow: 'visible' },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--role-text)'
  },
  '.cm-content': {
    boxSizing: 'border-box',
    caretColor: 'var(--role-text)',
    fontFamily: 'var(--content-panel-font-family, var(--font-family-sans))',
    fontSize: 'var(--content-panel-font-size, 1.0625rem)',
    margin: '0 auto',
    maxWidth: 'min(100%, var(--document-max-width, 860px))',
    padding: liveMarkdownSpacing.contentPadding,
    width: '100%'
  },
  '.cm-widgetBuffer': { width: '0px' },
  '.cm-line': { padding: 0 },
  '.cm-line.cm-line-paragraph': { paddingBottom: 'var(--content-panel-paragraph-spacing, 0.75em)' },
  '.cm-line:has(.cm-md-image-widget-block)': { fontSize: '0', lineHeight: '0', minHeight: '0' },
  '.cm-line.cm-line-h1': { fontSize: 'var(--content-panel-h1-font-size, 1.5rem)', fontWeight: '700', letterSpacing: '-0.01em', paddingBottom: liveMarkdownSpacing.h1BlockEnd, paddingTop: liveMarkdownSpacing.h1BlockStart },
  '.cm-line.cm-line-h2': { fontSize: 'var(--content-panel-h2-font-size, 1.25rem)', fontWeight: '700', paddingBottom: liveMarkdownSpacing.h2BlockEnd, paddingTop: liveMarkdownSpacing.h2BlockStart },
  '.cm-line.cm-line-h3': { fontSize: 'var(--content-panel-h3-font-size, 1.08rem)', fontWeight: '650', paddingTop: liveMarkdownSpacing.h3BlockStart },
  '.cm-line.cm-line-quote': { borderLeft: 'var(--editor-border-width-accent) solid var(--role-accent)', color: 'var(--role-text)', paddingBottom: 'var(--editor-space-xxs)', paddingTop: 'var(--editor-space-xxs)', paddingLeft: 'var(--editor-space-md)' },
  '.cm-line.cm-line-code, .cm-line.cm-line-code-fence': { backgroundColor: 'rgb(var(--role-ink-rgb) / 0.06)', borderRadius: 0, fontFamily: 'var(--content-panel-mono-font-family, var(--font-family-mono))', fontSize: 'var(--content-panel-code-font-size, 0.86rem)', padding: liveMarkdownSpacing.codeLinePadding },
  '.cm-line.cm-line-code-fence-hidden': { backgroundColor: 'transparent', borderRadius: 0, border: 0, fontSize: '0', lineHeight: '0', margin: 0, minHeight: 0, overflow: 'hidden', padding: '0 !important' },
  '.cm-line.cm-md-table-source-hidden': { fontSize: '0', lineHeight: '0', margin: 0, minHeight: '0', overflow: 'hidden', padding: '0 !important' },
  '.cm-line.cm-line-frontmatter-hidden': { fontSize: '0', lineHeight: '0', margin: 0, minHeight: '0', padding: '0 !important' },
  '.cm-line.cm-line-link-reference-hidden': { fontSize: '0', lineHeight: '0', margin: 0, minHeight: '0', padding: '0 !important' },
  '.cm-line.cm-line-forum-title-link-hidden': { fontSize: '0', lineHeight: '0', margin: 0, minHeight: '0', padding: '0 !important' },
  '.cm-line.cm-line-title-heading-hidden': { fontSize: '0', lineHeight: '0', margin: 0, minHeight: '0', padding: '0 !important' },
  '.cm-line.cm-diff-line': { borderRadius: 0 },
  '.cm-line.cm-diff-line-first': { borderTopLeftRadius: 'var(--editor-radius-lg)', borderTopRightRadius: 'var(--editor-radius-lg)' },
  '.cm-line.cm-diff-line-last': { borderBottomLeftRadius: 'var(--editor-radius-lg)', borderBottomRightRadius: 'var(--editor-radius-lg)' },
  '.cm-line.cm-diff-line-added': { backgroundColor: DIFF_ADDED_SURFACE_COLOR },
  '.cm-line.cm-diff-line-removed': { backgroundColor: DIFF_REMOVED_SURFACE_COLOR },
  '.cm-diff-spacer': { pointerEvents: 'none' },
  '.cm-diff-spacer-added': { backgroundColor: DIFF_ADDED_SPACER_COLOR, borderRadius: 'var(--editor-radius-lg)' },
  '.cm-diff-spacer-removed': { backgroundColor: DIFF_REMOVED_SPACER_COLOR, borderRadius: 'var(--editor-radius-lg)' },
  '.cm-diff-spacer-line': { color: 'transparent', userSelect: 'none' },
  '.cm-md-syntax-visible': { color: 'var(--role-accent)', opacity: '0.74' },
  ...liveMarkdownFrontmatterTheme,
  '.cm-md-heading-syntax-hidden': {
    display: 'none'
  },
  '.cm-md-emphasis': { fontStyle: 'italic', fontSynthesisStyle: 'none' },
  '.cm-md-strong': { fontWeight: '600' },
  '.cm-md-strikethrough': { textDecoration: 'line-through' },
  '.cm-md-thematic-break': {
    borderTop: '1.5px solid rgb(var(--role-legacy-border-strong-rgb) / 0.58)',
    display: 'block',
    margin: liveMarkdownSpacing.thematicBreakMargin,
    width: '100%'
  },
  '.cm-document-section-divider': { padding: liveMarkdownSpacing.sectionDividerPadding },
  '.cm-md-inline-code': { backgroundColor: 'rgb(var(--role-ink-rgb) / 0.08)', borderRadius: 'var(--editor-radius-md)', fontFamily: 'var(--content-panel-mono-font-family, var(--font-family-mono))', fontSize: 'var(--content-panel-code-font-size, 0.86rem)', padding: '0 var(--editor-space-xxs)' },
  ...liveMarkdownMathTheme,
  ...liveMarkdownCodeFenceTheme,
  '.cm-md-footnote-widget': { display: 'inline-block', lineHeight: '1', marginInline: liveMarkdownSpacing.footnoteMarkerInline, position: 'relative', verticalAlign: 'super' },
  '.cm-md-footnote-marker': {
    borderBottom: '1px dotted color-mix(in srgb, var(--role-accent) 60%, transparent)',
    color: 'var(--role-accent)',
    cursor: 'help',
    fontSize: liveMarkdownSpacing.footnoteMarkerFontSize,
    fontWeight: '600',
    outline: 'none'
  },
  '.cm-md-footnote-widget[data-md-footnote-status="unresolved"] .cm-md-footnote-marker': {
    borderBottomStyle: 'dashed',
    color: 'color-mix(in srgb, var(--role-accent) 78%, var(--role-text-secondary))'
  },
  '.cm-md-footnote-tooltip': {
    backgroundColor: 'var(--role-legacy-elevated-rgb)',
    border: '1px solid var(--role-legacy-border-rgb)',
    borderRadius: 'var(--editor-radius-popover)',
    bottom: 'calc(100% + var(--editor-space-sm))',
    boxShadow: 'var(--shadow-popover)',
    color: 'var(--role-text)',
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
  '.cm-md-link-text': { color: 'var(--role-accent)', cursor: 'pointer', textDecoration: 'underline' },
  '.cm-md-link-text-unsafe': { color: 'var(--role-text)', cursor: 'default', textDecoration: 'none' },
  '.cm-md-source-highlight': {
    backgroundColor: 'var(--editor-source-highlight-surface-color)',
    borderRadius: 'var(--editor-radius-sm)'
  },
  '.cm-md-highlight': { backgroundColor: SHARED_HIGHLIGHT_SURFACE_COLOR, borderRadius: 'var(--editor-radius-md)', cursor: 'pointer' },
  '.cm-md-highlight:hover, .cm-md-highlight-active': {
    backgroundColor: 'color-mix(in srgb, var(--role-highlight-surface) 78%, rgb(var(--role-ink-rgb)) 22%)'
  },
  '.cm-md-cloze': { backgroundColor: SHARED_CLOZE_SURFACE_COLOR, borderRadius: 'var(--editor-radius-md)' },
  '.cm-md-anchor-overlap': { backgroundColor: SHARED_HIGHLIGHT_SURFACE_COLOR, borderRadius: 'var(--editor-radius-md)', cursor: 'pointer' },
  '.cm-md-anchor-overlap:hover, .cm-md-anchor-overlap.cm-md-highlight-active': {
    backgroundColor: 'color-mix(in srgb, var(--role-highlight-surface) 78%, rgb(var(--role-ink-rgb)) 22%)'
  },
  '.cm-md-highlight-overlap': { backgroundColor: SHARED_HIGHLIGHT_SURFACE_COLOR, borderRadius: 'var(--editor-radius-md)', cursor: 'pointer' },
  '.cm-md-highlight-overlap:hover, .cm-md-highlight-overlap.cm-md-highlight-active': {
    backgroundColor: 'color-mix(in srgb, var(--role-highlight-surface) 78%, rgb(var(--role-ink-rgb)) 22%)'
  },
  '.cm-md-cloze-placeholder': {
    color: 'color-mix(in srgb, var(--role-cloze) 78%, var(--role-text))',
    fontWeight: '600',
    letterSpacing: '0.08em',
    paddingInline: '0.08em'
  },
  '.cm-md-anchor-tag-token': { color: 'var(--role-accent)', opacity: '0.9' },
  '.cm-md-anchor-tag-delimiter': { color: 'var(--role-accent)', opacity: '0.7' },
  '.cm-md-anchor-tag-kind': { color: 'var(--role-accent)', fontWeight: '700', opacity: '1' },
  '.cm-md-anchor-tag-attr': { color: 'var(--role-accent)', opacity: '0.75' },
  '.cm-md-anchor-tag-id': { color: 'var(--role-accent)', fontWeight: '700', opacity: '1' },
  '.cm-md-prefix-widget': { color: 'var(--role-text-secondary)', display: 'inline-block', whiteSpace: 'pre' },
  '.cm-md-prefix-unordered-list, .cm-md-prefix-ordered-list, .cm-md-prefix-task-list': {
    alignItems: 'center',
    boxSizing: 'border-box',
    display: 'inline-flex',
    inlineSize: liveMarkdownSpacing.listMarkerColumnInlineSize,
    justifyContent: 'flex-end',
    paddingInlineEnd: liveMarkdownSpacing.listMarkerInlineEnd
  },
  '.cm-md-prefix-unordered-list, .cm-md-prefix-ordered-list': { color: 'var(--role-text-secondary)', fontWeight: '500', opacity: '0.95' },
  '.cm-md-prefix-task-list': { height: '1em', verticalAlign: '-0.08em' },
  '.cm-md-task-checkbox': {
    appearance: 'none',
    backgroundColor: 'transparent',
    border: '1px solid rgb(var(--role-legacy-border-strong-rgb) / 0.72)',
    borderRadius: liveMarkdownSpacing.taskCheckboxRadius,
    boxSizing: 'border-box',
    cursor: 'pointer',
    display: 'inline-block',
    height: liveMarkdownSpacing.taskCheckboxSize,
    margin: 0,
    padding: 0,
    position: 'relative',
    WebkitAppearance: 'none',
    width: liveMarkdownSpacing.taskCheckboxSize
  },
  '.cm-md-task-checkbox:hover': {
    backgroundColor: 'rgb(var(--role-ink-rgb) / 0.04)',
    borderColor: 'rgb(var(--role-legacy-border-strong-rgb) / 0.95)'
  },
  '.cm-md-task-checkbox:focus-visible': {
    outline: '0.1em solid color-mix(in srgb, var(--role-accent) 72%, transparent)',
    outlineOffset: '0.1em'
  },
  '.cm-md-task-checkbox[data-md-task-checked="true"]': {
    backgroundColor: 'var(--role-accent)',
    borderColor: 'var(--role-accent)'
  },
  '.cm-md-task-checkbox[data-md-task-checked="true"]:hover': {
    backgroundColor: 'color-mix(in srgb, var(--role-accent) 88%, rgb(var(--role-ink-rgb)))',
    borderColor: 'color-mix(in srgb, var(--role-accent) 88%, rgb(var(--role-ink-rgb)))'
  },
  '.cm-md-task-checkbox[data-md-task-checked="true"]::after': {
    borderBottom: `${liveMarkdownSpacing.taskCheckStroke} solid rgb(var(--role-legacy-elevated-rgb))`,
    borderRight: `${liveMarkdownSpacing.taskCheckStroke} solid rgb(var(--role-legacy-elevated-rgb))`,
    content: '""',
    height: liveMarkdownSpacing.taskCheckHeight,
    left: liveMarkdownSpacing.taskCheckLeft,
    position: 'absolute',
    top: liveMarkdownSpacing.taskCheckTop,
    transform: 'rotate(42deg)',
    width: liveMarkdownSpacing.taskCheckWidth
  },
  '.cm-md-callout-title': { color: 'var(--role-accent)', fontWeight: '650' },
  ...liveMarkdownTableTheme,
  ...liveMarkdownMermaidTheme,
  ...liveMarkdownImageTheme,
  '.cm-topic-search-match': {
    backgroundColor: 'color-mix(in srgb, var(--role-highlight-surface) 68%, transparent)',
    borderRadius: 'var(--editor-radius-md)'
  },
  '.cm-topic-search-match-active': {
    backgroundColor: 'color-mix(in srgb, var(--role-selection-surface) 78%, var(--role-highlight-surface))',
    borderRadius: 'var(--editor-radius-md)',
    boxShadow: 'var(--editor-shadow-inset-match)'
  },
  '.cm-paragraph-marker-line': {
    position: 'relative'
  },
  '.cm-paragraph-marker-line::before': {
    backgroundColor: 'var(--role-accent)',
    bottom: '0',
    content: '""',
    left: '-1.2em',
    pointerEvents: 'none',
    position: 'absolute',
    top: '0',
    width: '3px'
  },
  '.cm-activeLine': { backgroundColor: 'transparent' },
  '.markdown-editor-host[data-review-caret-line="true"] &.cm-focused .cm-activeLine': {
    backgroundColor: 'rgb(var(--role-ink-rgb) / 0.035)'
  },
  '.cm-content ::selection': {
    backgroundColor: TEXT_SELECTION_BACKGROUND_COLOR,
    color: 'var(--role-text-selection-ink)',
    WebkitTextFillColor: 'var(--role-text-selection-ink)'
  },
  '&[data-paragraph-marker-active="true"] .cm-content ::selection': {
    backgroundColor: 'transparent'
  }
});
