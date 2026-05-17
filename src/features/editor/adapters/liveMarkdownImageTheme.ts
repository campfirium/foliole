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
    flexDirection: 'column',
    gap: 'var(--editor-space-xs)',
    fontSize: '0.9rem',
    justifyContent: 'center',
    minHeight: '5rem',
    padding: 'var(--editor-space-md)'
  },
  '.cm-md-image-status-actions': { display: 'inline-flex', gap: 'var(--editor-space-xs)' },
  '.cm-md-image-status-action': {
    backgroundColor: 'transparent',
    border: 0,
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    font: 'inherit',
    padding: 0,
    textDecoration: 'underline',
    textUnderlineOffset: '0.18em'
  },
  '.cm-md-image-recovery-hint': {
    alignItems: 'center',
    color: 'color-mix(in srgb, var(--color-text-secondary) 82%, transparent)',
    display: 'inline-flex',
    flexWrap: 'wrap',
    gap: 'var(--editor-space-xs)',
    justifyContent: 'center',
    maxWidth: '100%',
    textAlign: 'center'
  },
  '.cm-md-image-status-block': { minHeight: '5rem', padding: 'var(--editor-space-md)' },
  '.cm-md-image-status-inline': {
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
