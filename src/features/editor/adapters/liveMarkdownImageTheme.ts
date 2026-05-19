import { liveMarkdownSpacing } from './liveMarkdownSpacing';

export const liveMarkdownImageTheme = {
  '.cm-md-image-widget': { maxWidth: '100%' },
  '.cm-md-image-widget-block': {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: liveMarkdownSpacing.imageBlockMargin,
    marginTop: liveMarkdownSpacing.imageBlockMargin,
    width: '100%'
  },
  '.cm-md-image-widget-inline': {
    display: 'inline-block',
    height: '1lh',
    lineHeight: '1',
    margin: liveMarkdownSpacing.imageInlineMargin,
    maxWidth: '100%',
    overflow: 'hidden',
    verticalAlign: 'text-bottom'
  },
  '.cm-md-image-element': {
    border: '1px solid color-mix(in srgb, var(--color-border-strong) 36%, transparent)',
    borderRadius: 'var(--editor-radius-xl)',
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
  '.cm-md-image-element-block': { height: 'auto', maxWidth: '100%', width: '100%' },
  '.cm-md-image-element-inline': { height: '100%', margin: 0, maxHeight: '1lh', verticalAlign: 'bottom' },
  '.cm-md-image-status': {
    boxSizing: 'border-box',
    color: 'var(--color-text-secondary)',
    display: 'flex',
    flexDirection: 'column',
    lineHeight: '1.4',
    width: '100%'
  },
  '.cm-md-image-status-frame': {
    alignItems: 'center',
    backgroundColor: 'color-mix(in srgb, var(--color-bg-muted) 72%, var(--color-text-secondary) 4%)',
    border: '1px solid color-mix(in srgb, var(--color-border-strong) 22%, transparent)',
    borderRadius: 'var(--editor-radius-lg)',
    boxSizing: 'border-box',
    display: 'flex',
    gap: '1.05rem',
    minHeight: '8.25rem',
    overflow: 'hidden',
    padding: '1rem 1.05rem',
    position: 'relative',
    width: '100%'
  },
  '.cm-md-image-status-frame-glyph': {
    alignItems: 'center',
    display: 'inline-flex',
    flex: '0 0 auto',
    color: 'color-mix(in srgb, var(--color-text-secondary) 30%, transparent)',
    height: '3.5rem',
    justifyContent: 'center',
    opacity: '0.78',
    width: '3.5rem'
  },
  '.cm-md-image-status-frame-glyph svg': {
    height: '100%',
    width: '100%'
  },
  '.cm-md-image-status-frame-copy': {
    display: 'inline-flex',
    flex: '1 1 auto',
    flexDirection: 'column',
    minWidth: 0
  },
  '.cm-md-image-status-frame-caption': {
    color: 'color-mix(in srgb, var(--color-text-secondary) 76%, transparent)',
    fontSize: '0.9rem',
    fontWeight: 500,
    lineHeight: '1.2',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  '.cm-md-image-status-frame-source': {
    color: 'color-mix(in srgb, var(--color-text-secondary) 68%, transparent)',
    fontSize: '0.78rem',
    lineHeight: '1.25',
    marginTop: '0.12rem',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  '.cm-md-image-status-toolbar': {
    alignItems: 'center',
    flex: '0 0 auto',
    display: 'inline-flex',
    gap: '0.18rem',
    marginLeft: 'auto',
    opacity: '0.82',
    padding: '0.05rem',
    transition: 'opacity 120ms ease'
  },
  '.cm-md-image-status:hover .cm-md-image-status-toolbar, .cm-md-image-status:focus-within .cm-md-image-status-toolbar': {
    opacity: 1
  },
  '@media (hover: none)': {
    '.cm-md-image-status-toolbar': { opacity: '0.86' }
  },
  '.cm-md-image-status-toolbar-button': {
    alignItems: 'center',
    backgroundColor: 'transparent',
    border: 0,
    borderRadius: 'var(--editor-radius-md)',
    color: 'color-mix(in srgb, var(--color-text-secondary) 54%, transparent)',
    cursor: 'pointer',
    display: 'inline-flex',
    height: '2rem',
    justifyContent: 'center',
    padding: 0,
    width: '2rem'
  },
  '.cm-md-image-status-toolbar-button:hover, .cm-md-image-status-toolbar-button:focus-visible': {
    backgroundColor: 'color-mix(in srgb, var(--color-bg-elevated) 64%, transparent)',
    color: 'color-mix(in srgb, var(--color-text-secondary) 78%, transparent)',
    outline: 'none'
  },
  '.cm-md-image-status-toolbar-icon': {
    height: '1.12rem',
    width: '1.12rem'
  },
  '.cm-md-readwise-original-file-action': {
    color: 'color-mix(in srgb, var(--color-text-secondary) 58%, transparent)'
  },
  '.cm-md-readwise-original-file-action:hover, .cm-md-readwise-original-file-action:focus-visible': {
    color: 'color-mix(in srgb, var(--color-text-secondary) 84%, transparent)'
  },
  '.cm-md-readwise-original-file-detail': {
    color: 'color-mix(in srgb, var(--color-text-secondary) 64%, transparent)',
    fontSize: '0.78rem',
    lineHeight: '1.35',
    marginTop: '0.55rem',
    maxWidth: '34rem',
    whiteSpace: 'normal'
  },
  '.cm-md-image-status-block': {},
  '.cm-md-image-status-inline': {
    backgroundColor: 'color-mix(in srgb, var(--color-bg-muted) 48%, transparent)',
    border: '1px solid color-mix(in srgb, var(--color-border-strong) 12%, transparent)',
    borderRadius: 'var(--editor-radius-lg)',
    display: 'inline-flex',
    flexDirection: 'row',
    fontSize: '0.72em',
    height: '1lh',
    minHeight: '1lh',
    padding: liveMarkdownSpacing.imageInlineStatusPadding,
    verticalAlign: 'text-bottom'
  }
};
