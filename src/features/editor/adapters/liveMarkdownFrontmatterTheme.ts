export const liveMarkdownFrontmatterTheme = {
  '.cm-md-frontmatter-compact': {
    alignItems: 'center',
    display: 'flex',
    color: 'color-mix(in srgb, var(--color-text-secondary) 64%, transparent)',
    fontSize: '0.8rem',
    fontWeight: '420',
    gap: '0.58rem',
    justifyContent: 'flex-start',
    lineHeight: '1.5',
    margin: '0.22rem 0 0.78rem',
    minWidth: 0,
    width: '100%'
  },
  '.cm-md-frontmatter-header': {
    alignItems: 'center',
    display: 'flex',
    color: 'color-mix(in srgb, var(--color-text-secondary) 64%, transparent)',
    fontSize: '0.8rem',
    fontWeight: '420',
    gap: '0.58rem',
    justifyContent: 'flex-start',
    lineHeight: '1.5',
    marginBottom: '0.5rem',
    minWidth: 0,
    width: '100%'
  },
  '.cm-md-frontmatter-meta-line': {
    alignItems: 'center',
    display: 'flex',
    gap: '0.36rem',
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  '.cm-md-frontmatter-meta-item': {
    color: 'inherit'
  },
  '.cm-md-frontmatter-meta-link': {
    color: 'inherit',
    cursor: 'pointer',
    textDecoration: 'none'
  },
  '.cm-md-frontmatter-meta-link:hover': {
    color: 'color-mix(in srgb, var(--color-text-secondary) 82%, var(--color-text-primary))',
    textDecoration: 'underline',
    textDecorationColor: 'color-mix(in srgb, currentColor 42%, transparent)',
    textDecorationThickness: '1px',
    textUnderlineOffset: '0.18em'
  },
  '.cm-md-frontmatter-meta-link:focus-visible': {
    outline: 'none',
    textDecoration: 'underline',
    textDecorationColor: 'color-mix(in srgb, currentColor 54%, transparent)',
    textDecorationThickness: '1px',
    textUnderlineOffset: '0.18em'
  },
  '.cm-md-frontmatter-separator': {
    color: 'color-mix(in srgb, currentColor 52%, transparent)',
    fontWeight: '360'
  },
  '.cm-md-frontmatter-toggle': {
    background: 'transparent',
    border: 0,
    borderRadius: 0,
    color: 'inherit',
    cursor: 'pointer',
    flex: '0 0 auto',
    font: 'inherit',
    letterSpacing: '0.06em',
    lineHeight: '1.2',
    marginLeft: '0.05rem',
    padding: '0.08rem 0',
    textDecoration: 'none',
    textTransform: 'lowercase'
  },
  '.cm-md-frontmatter-toggle:hover': {
    color: 'color-mix(in srgb, var(--color-text-secondary) 82%, var(--color-text-primary))'
  },
  '.cm-md-frontmatter-toggle:focus-visible': {
    outline: 'none',
    textDecoration: 'underline',
    textDecorationColor: 'color-mix(in srgb, currentColor 48%, transparent)',
    textDecorationThickness: '1px',
    textUnderlineOffset: '0.18em'
  },
  '.cm-md-frontmatter-yaml': {
    boxSizing: 'border-box',
    margin: '0.42rem 0 0.7rem',
    padding: 0,
    width: '100%'
  },
  '.cm-md-frontmatter-yaml-input': {
    backgroundColor: 'rgb(var(--color-foreground) / 0.026)',
    border: '1px solid rgb(var(--color-border) / 0.58)',
    borderRadius: 'var(--editor-radius-sm)',
    boxSizing: 'border-box',
    color: 'color-mix(in srgb, var(--color-text-secondary) 92%, var(--color-text-primary))',
    display: 'block',
    fontFamily: 'var(--content-panel-mono-font-family, var(--font-family-mono))',
    fontSize: 'var(--content-panel-code-font-size, 0.86rem)',
    lineHeight: '1.58',
    outline: 'none',
    padding: '0.52rem 0.62rem',
    resize: 'vertical',
    width: '100%'
  },
  '.cm-md-frontmatter-yaml-input:focus': {
    borderColor: 'rgb(var(--color-border-strong) / 0.72)'
  }
};
