const EDITOR_SPACE_XS = 'var(--editor-space-xs)';
const EDITOR_SPACE_MD = 'var(--editor-space-md)';

// Local rhythm values preserve the existing CodeMirror markdown spacing while
// keeping the theme object free of scattered spacing literals.
const LOCAL_MARKDOWN_RHYTHM = {
  contentBlockEnd: '0.6rem',
  contentBlockStart: '0.25rem',
  contentInline: '1.5rem',
  codeLineInline: '0.5rem',
  footnoteMarkerInline: '0.05em',
  footnoteTooltipBlock: '0.6rem',
  h2BlockEnd: '0.2rem',
  h2BlockStart: '0.65rem',
  h3BlockStart: '0.5rem',
  imageBlock: '0.24rem',
  imageInline: '0.18rem',
  listInlineStart: '0.2rem',
  sectionDividerBlockEnd: '0.85rem',
  sectionDividerBlockStart: '0.9rem',
  taskPrefixInlineEnd: '0.1rem',
  thematicBreakBlock: '0.72rem'
} as const;

// Font-relative badge padding intentionally follows the inline image label size.
const IMAGE_INLINE_STATUS_PADDING_INLINE = '0.45em';

const FONT_RELATIVE_GEOMETRY = {
  footnoteMarkerFontSize: '0.72em',
  taskCheckHeight: '0.42em',
  taskCheckLeft: '0.27em',
  taskCheckTop: '0.08em',
  taskCheckWidth: '0.22em',
  taskCheckboxSize: '0.86em'
} as const;

export const liveMarkdownSpacing = {
  contentPadding: `var(--editor-content-padding-top, ${LOCAL_MARKDOWN_RHYTHM.contentBlockStart}) var(--document-content-inline-padding, ${LOCAL_MARKDOWN_RHYTHM.contentInline}) var(--editor-content-padding-bottom, ${LOCAL_MARKDOWN_RHYTHM.contentBlockEnd})`,
  codeLinePadding: `0 ${LOCAL_MARKDOWN_RHYTHM.codeLineInline}`,
  footnoteMarkerInline: LOCAL_MARKDOWN_RHYTHM.footnoteMarkerInline,
  footnoteMarkerFontSize: FONT_RELATIVE_GEOMETRY.footnoteMarkerFontSize,
  footnoteTooltipPadding: `${LOCAL_MARKDOWN_RHYTHM.footnoteTooltipBlock} ${EDITOR_SPACE_MD}`,
  h1BlockEnd: EDITOR_SPACE_XS,
  h1BlockStart: EDITOR_SPACE_MD,
  h2BlockEnd: LOCAL_MARKDOWN_RHYTHM.h2BlockEnd,
  h2BlockStart: LOCAL_MARKDOWN_RHYTHM.h2BlockStart,
  h3BlockStart: LOCAL_MARKDOWN_RHYTHM.h3BlockStart,
  imageBlockMargin: LOCAL_MARKDOWN_RHYTHM.imageBlock,
  imageInlineMargin: `0 ${LOCAL_MARKDOWN_RHYTHM.imageInline}`,
  imageInlineStatusPadding: `0 ${IMAGE_INLINE_STATUS_PADDING_INLINE}`,
  listInlineStart: LOCAL_MARKDOWN_RHYTHM.listInlineStart,
  sectionDividerPadding: `${LOCAL_MARKDOWN_RHYTHM.sectionDividerBlockStart} 0 ${LOCAL_MARKDOWN_RHYTHM.sectionDividerBlockEnd}`,
  taskCheckHeight: FONT_RELATIVE_GEOMETRY.taskCheckHeight,
  taskCheckLeft: FONT_RELATIVE_GEOMETRY.taskCheckLeft,
  taskCheckTop: FONT_RELATIVE_GEOMETRY.taskCheckTop,
  taskCheckWidth: FONT_RELATIVE_GEOMETRY.taskCheckWidth,
  taskCheckboxSize: FONT_RELATIVE_GEOMETRY.taskCheckboxSize,
  taskPrefixInlineEnd: LOCAL_MARKDOWN_RHYTHM.taskPrefixInlineEnd,
  thematicBreakMargin: `${LOCAL_MARKDOWN_RHYTHM.thematicBreakBlock} 0`
} as const;
