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
    alignItems: 'center',
    backgroundColor: 'color-mix(in srgb, var(--color-bg-muted) 88%, transparent)',
    border: '1px dashed color-mix(in srgb, var(--color-border-strong) 40%, transparent)',
    borderRadius: 'var(--editor-radius-xl)',
    color: 'var(--color-text-secondary)',
    display: 'flex',
    fontSize: '0.9rem',
    justifyContent: 'center',
    minHeight: '5rem',
    padding: 'var(--editor-space-md)'
  },
  '.cm-md-image-status-block': { minHeight: '5rem', padding: 'var(--editor-space-md)' },
  '.cm-md-image-status-inline': {
    borderRadius: 'var(--editor-radius-lg)',
    display: 'inline-flex',
    fontSize: '0.72em',
    height: '1lh',
    minHeight: '1lh',
    padding: liveMarkdownSpacing.imageInlineStatusPadding,
    verticalAlign: 'text-bottom'
  }
};
